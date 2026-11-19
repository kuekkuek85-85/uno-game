// ──────────────────────────────────────────────────────────────
// 다인원(3인) 대전 Supabase 접근
// 상태 갱신은 version 조건부 UPDATE(낙관적 동시성) — 여러 명이 동시에
// 써도 한 번에 한 사람의 수만 반영되고, 충돌하면 최신 상태를 다시 읽는다.
// ──────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase'
import type { MultiState } from '../game/multi'

export type MultiRoomStatus = 'waiting' | 'active' | 'finished' | 'abandoned'

export type MultiRoom = {
  id: string
  capacity: number
  status: MultiRoomStatus
  players: { id: string; name: string }[]
  state: MultiState | null
  version: number
  created_at: string
  updated_at: string
}

export async function multiJoin(
  playerId: string,
  capacity: number,
): Promise<{ room_id: string; status: MultiRoomStatus } | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('pvp_multi_join', {
    p_player: playerId,
    p_capacity: capacity,
  })
  if (error || !data || (data as { error?: string }).error) return null
  return data as { room_id: string; status: MultiRoomStatus }
}

/** 15초 판정: 'waiting' | 'active' | 'ai' | 'gone' | ... */
export async function multiTick(roomId: string, playerId: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('pvp_multi_tick', {
    p_room: roomId,
    p_player: playerId,
  })
  if (error) return null
  return data as string
}

export async function multiLeaveWait(roomId: string, playerId: string) {
  if (!supabase) return
  await supabase.rpc('pvp_multi_leave_wait', { p_room: roomId, p_player: playerId })
}

export async function getMultiRoom(roomId: string): Promise<MultiRoom | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('pvp_multi_rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle()
  if (error || !data) return null
  return data as MultiRoom
}

/**
 * version 이 내가 본 값과 같을 때만 상태를 쓴다.
 * 성공하면 최신 방, 다른 사람이 먼저 썼으면(충돌) null.
 */
export async function writeMultiState(
  roomId: string,
  expectedVersion: number,
  state: MultiState,
): Promise<MultiRoom | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('pvp_multi_rooms')
    .update({
      state,
      version: expectedVersion + 1,
      status: state.phase === 'finished' ? 'finished' : 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', roomId)
    .eq('version', expectedVersion)
    .select()
    .maybeSingle()
  if (error || !data) return null
  return data as MultiRoom
}

export function subscribeMultiRoom(
  roomId: string,
  onChange: (room: MultiRoom) => void,
): () => void {
  const sb = supabase
  if (!sb) return () => {}
  const channel = sb
    .channel(`pvp_multi_${roomId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pvp_multi_rooms', filter: `id=eq.${roomId}` },
      (payload) => onChange(payload.new as MultiRoom),
    )
    .subscribe()
  return () => {
    sb.removeChannel(channel)
  }
}

/** 하트비트(서버 시계 now()로 기록). RPC가 없으면 기기 시계로 대체 */
export async function multiHeartbeat(playerId: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('pvp_heartbeat', { p_player: playerId })
  if (error) {
    await supabase
      .from('pvp_players')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', playerId)
  }
}

/** 여러 플레이어의 last_seen 조회(이탈 감지) */
export async function getLastSeenMap(ids: string[]): Promise<Record<string, number>> {
  if (!supabase || ids.length === 0) return {}
  const { data } = await supabase.from('pvp_players').select('id,last_seen').in('id', ids)
  const out: Record<string, number> = {}
  for (const r of (data ?? []) as { id: string; last_seen: string }[]) {
    out[r.id] = new Date(r.last_seen).getTime()
  }
  return out
}
