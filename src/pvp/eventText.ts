// ──────────────────────────────────────────────────────────────
// 1:1 대전 안내 문구를 "보는 사람" 기준으로 바꾼다.
// 엔진(AI 대전과 공용)은 host 슬롯을 '나', guest 슬롯을 'AI'로 적는다.
// 그대로 보여주면 guest 화면에서 상대(host)가 낸 카드가 "나: …"로 보이므로,
// 내 좌석에 맞춰 '나' / 상대 이름으로 바꿔 준다.
// ──────────────────────────────────────────────────────────────

import type { GameState } from '../game/types'
import type { Seat } from './types'

/** 엔진 문구의 주어(host='나', guest='AI') → 좌석 */
const LABEL_SEAT: Record<string, Seat> = { 나: 'host', AI: 'guest' }

export function pvpEventText(
  state: Pick<GameState, 'phase' | 'lastEvent'>,
  mySeat: Seat,
  opponentName: string,
): string {
  const ev = state.lastEvent ?? ''
  const who = (seat: Seat) => (seat === mySeat ? '나' : opponentName)

  // 게임 끝: 엔진 문구 대신 승자 좌석으로 다시 쓴다
  if (state.phase === 'won' || state.phase === 'lost') {
    const winner: Seat = state.phase === 'won' ? 'host' : 'guest'
    const why = ev.includes('뽑을 카드가 없어') ? ' (더 이상 뽑을 카드가 없어 손패가 적은 쪽 승리)' : ''
    return winner === mySeat ? `🎉 승리!${why}` : `😢 ${opponentName} 승리${why}`
  }

  // "나: …" / "AI: …" → 실제 주어로
  const m = ev.match(/^(나|AI): /)
  if (m) return `${who(LABEL_SEAT[m[1]])}: ${ev.slice(m[0].length)}`
  return ev
}

/** 엔진 슬롯 표기(host='나', guest='AI') — PvP에서 직접 문구를 만들 때 사용 */
export function slotLabel(seat: Seat): string {
  return seat === 'host' ? '나' : 'AI'
}
