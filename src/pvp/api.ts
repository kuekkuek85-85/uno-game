// ──────────────────────────────────────────────────────────────
// PvP Supabase 접근 (매칭 RPC, 방 구독/갱신, 하트비트, 전적)
// ──────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase'
import type { GameState } from '../game/types'
import type { MatchResult, PvpRoom, Seat } from './types'

export const isPvpAvailable = Boolean(supabase)

/** 대기 풀에 플레이어 등록(없으면 생성) → player id 반환 */
export async function joinPool(
  name: string,
  studentId: string | null,
): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('pvp_players')
    .insert({ name, student_id: studentId, status: 'idle' })
    .select('id')
    .single()
  if (error || !data) return null
  return data.id as string
}

/** 매칭 요청(RPC) */
export async function requestMatch(playerId: string): Promise<MatchResult | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('pvp_request_match', {
    p_player: playerId,
  })
  if (error || !data) return null
  return data as MatchResult
}

/** 대기 중이던 내 방 취소(AI 폴백으로 전환할 때) */
export async function cancelWaitingRoom(roomId: string, playerId: string) {
  if (!supabase) return
  await supabase
    .from('pvp_rooms')
    .update({ status: 'abandoned' })
    .eq('id', roomId)
    .eq('status', 'waiting')
  await supabase
    .from('pvp_players')
    .update({ status: 'ai_game', room_id: null })
    .eq('id', playerId)
}

export async function getRoom(roomId: string): Promise<PvpRoom | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('pvp_rooms')
    .select('*')
    .eq('id', roomId)
    .maybeSingle()
  if (error || !data) return null
  return data as PvpRoom
}

/** 초기 게임 상태를 방에 기록(guest가 매칭 성사 시 1회) */
export async function initRoomState(
  roomId: string,
  state: GameState,
  turnSeat: Seat,
) {
  if (!supabase) return
  await supabase
    .from('pvp_rooms')
    .update({ state, turn_seat: turnSeat, updated_at: new Date().toISOString() })
    .eq('id', roomId)
}

/** 한 수 둔 뒤 공유 상태 갱신 */
export async function pushMove(
  roomId: string,
  state: GameState,
  turnSeat: Seat,
) {
  if (!supabase) return
  await supabase
    .from('pvp_rooms')
    .update({ state, turn_seat: turnSeat, updated_at: new Date().toISOString() })
    .eq('id', roomId)
}

/** 게임 종료 기록 */
export async function finishRoom(roomId: string, winnerSeat: Seat, state: GameState) {
  if (!supabase) return
  await supabase
    .from('pvp_rooms')
    .update({
      status: 'finished',
      winner_seat: winnerSeat,
      state,
      updated_at: new Date().toISOString(),
    })
    .eq('id', roomId)
}

/** 상대 이탈 → 내가 부전승 처리 */
export async function abandonRoom(roomId: string, winnerSeat: Seat) {
  if (!supabase) return
  await supabase
    .from('pvp_rooms')
    .update({ status: 'abandoned', winner_seat: winnerSeat })
    .eq('id', roomId)
}

/** 하트비트 */
export async function heartbeat(playerId: string) {
  if (!supabase) return
  await supabase
    .from('pvp_players')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', playerId)
}

/** 게임 끝나고 풀로 복귀 */
export async function backToPool(playerId: string) {
  if (!supabase) return
  await supabase
    .from('pvp_players')
    .update({ status: 'idle', room_id: null })
    .eq('id', playerId)
}

/** 전적 기록(선택) */
export async function recordPvpMatch(params: {
  room_id: string
  winner_student_id: string | null
  loser_student_id: string | null
  winner_name: string
  loser_name: string
}) {
  if (!supabase) return
  await supabase.from('pvp_matches').insert(params)
}

/** 방 변경 구독 → 콜백. 구독 해제 함수를 반환 */
export function subscribeRoom(
  roomId: string,
  onChange: (room: PvpRoom) => void,
): () => void {
  const sb = supabase
  if (!sb) return () => {}
  const channel = sb
    .channel(`pvp_room_${roomId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'pvp_rooms', filter: `id=eq.${roomId}` },
      (payload) => onChange(payload.new as PvpRoom),
    )
    .subscribe()
  return () => {
    sb.removeChannel(channel)
  }
}

/** 특정 플레이어(상대)의 last_seen 조회 — 이탈 감지용 */
export async function getPlayerLastSeen(playerId: string): Promise<number | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('pvp_players')
    .select('last_seen')
    .eq('id', playerId)
    .maybeSingle()
  if (!data) return null
  return new Date(data.last_seen as string).getTime()
}
