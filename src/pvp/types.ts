// ──────────────────────────────────────────────────────────────
// PvP 타입 (설계: docs/pvp-spec.md)
// 엔진 재사용: host = 'player' 슬롯 / guest = 'ai' 슬롯
// ──────────────────────────────────────────────────────────────

import type { GameState, Turn } from '../game/types'

export type Seat = 'host' | 'guest'

export type RoomStatus = 'waiting' | 'active' | 'finished' | 'abandoned'

export type PvpRoom = {
  id: string
  host_id: string
  guest_id: string | null
  host_name: string
  guest_name: string | null
  status: RoomStatus
  state: GameState | null
  turn_seat: Seat | null
  winner_seat: Seat | null
  updated_at: string
  created_at: string
}

export type MatchResult = {
  role: Seat
  room_id: string
  opponent_name?: string
  waiting: boolean
  error?: string
}

/** 좌석 → 엔진의 Turn 슬롯 */
export function seatToTurn(seat: Seat): Turn {
  return seat === 'host' ? 'player' : 'ai'
}

/** 엔진의 Turn 슬롯 → 좌석 */
export function turnToSeat(turn: Turn): Seat {
  return turn === 'player' ? 'host' : 'guest'
}
