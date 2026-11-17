// ──────────────────────────────────────────────────────────────
// PvP Supabase 접근 (매칭 RPC, 방 구독/갱신, 하트비트, 전적)
// ──────────────────────────────────────────────────────────────

import { supabase } from '../lib/supabase'
import type { GameState } from '../game/types'
import type { MatchResult, PvpRoom, Seat } from './types'

export const isPvpAvailable = Boolean(supabase)

const PLAYER_ID_KEY = 'pvp.playerId'

/**
 * 대기 풀에 플레이어 등록 → player id 반환.
 * 재입장 시 같은 id를 재사용(localStorage)해 직전 상대 기록을 보존하고
 * 유령 행이 쌓이지 않게 한다.
 */
export async function joinPool(
  name: string,
  studentId: string | null,
): Promise<string | null> {
  if (!supabase) return null
  const now = new Date().toISOString()

  // 1) 저장된 id가 아직 유효하면 재사용
  try {
    const existing = localStorage.getItem(PLAYER_ID_KEY)
    if (existing) {
      const { data } = await supabase
        .from('pvp_players')
        .select('id')
        .eq('id', existing)
        .maybeSingle()
      if (data) {
        await supabase
          .from('pvp_players')
          .update({ name, student_id: studentId, status: 'idle', room_id: null, last_seen: now })
          .eq('id', existing)
        return existing
      }
    }
  } catch {
    /* ignore */
  }

  // 2) 새로 생성
  const { data, error } = await supabase
    .from('pvp_players')
    .insert({ name, student_id: studentId, status: 'idle', last_seen: now })
    .select('id')
    .single()
  if (error || !data) return null
  try {
    localStorage.setItem(PLAYER_ID_KEY, data.id as string)
  } catch {
    /* ignore */
  }
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

/**
 * 초기 게임 상태를 방에 기록. state가 아직 비어있을 때만(=is.null) 성공.
 * 성공하면 갱신된 방을 반환, 이미 누가 초기화했으면 null(동시성 안전 → 양쪽 누구나 호출 가능).
 */
export async function initRoomState(
  roomId: string,
  state: GameState,
  turnSeat: Seat,
): Promise<PvpRoom | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('pvp_rooms')
    .update({ state, turn_seat: turnSeat, updated_at: new Date().toISOString() })
    .eq('id', roomId)
    .is('state', null)
    .select()
    .maybeSingle()
  return (data as PvpRoom) ?? null
}

/** 한 수 둔 뒤 공유 상태 갱신 → 서버의 최신 행을 반환(권위) */
export async function pushMove(
  roomId: string,
  state: GameState,
  turnSeat: Seat,
): Promise<PvpRoom | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('pvp_rooms')
    .update({ state, turn_seat: turnSeat, updated_at: new Date().toISOString() })
    .eq('id', roomId)
    .select()
    .maybeSingle()
  return (data as PvpRoom) ?? null
}

/** 우노 외치기/잡기 등 턴을 바꾸지 않는 상태 갱신 → 최신 행 반환 */
export async function pushUno(
  roomId: string,
  state: GameState,
): Promise<PvpRoom | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('pvp_rooms')
    .update({ state, updated_at: new Date().toISOString() })
    .eq('id', roomId)
    .select()
    .maybeSingle()
  return (data as PvpRoom) ?? null
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
