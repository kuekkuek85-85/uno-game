// ──────────────────────────────────────────────────────────────
// UNO 게임 타입 정의
// 스펙 3장(게임 규칙 & 상태 설계) 기반
// ──────────────────────────────────────────────────────────────

export type CardColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild'
/** 와일드를 제외한 실제 플레이 색(현재 색은 반드시 이 중 하나) */
export type PlayColor = 'red' | 'yellow' | 'green' | 'blue'

export type CardKind =
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4'

export type Card = {
  id: string
  color: CardColor
  kind: CardKind
  value?: number // number 카드일 때 0~9
}

export type Difficulty = 'easy' | 'normal' | 'hard'
export type Turn = 'player' | 'ai'
export type Phase = 'playing' | 'won' | 'lost'

export type GameState = {
  deck: Card[] // 뽑을 더미
  discard: Card[] // 버린 더미 (마지막이 top)
  currentColor: PlayColor // 와일드로 바뀔 수 있으므로 별도 추적
  playerHand: Card[]
  aiHand: Card[]
  turn: Turn
  pendingDraw: number // +2/+4 처리용 (1단계: 누적 없이 즉시 처리)
  phase: Phase
  turns: number // 소요 턴 수(기록용)
  /** 어려움 AI가 참고하는 "상대(플레이어)가 최근 낸 색" 기록 */
  playerRecentColors: PlayColor[]
  /** 마지막 액션 로그 메시지 (UI 표시용) */
  lastEvent?: string
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
}

export const DIFFICULTY_SCORE: Record<Difficulty, number> = {
  easy: 1,
  normal: 2,
  hard: 3,
}

export const PLAY_COLORS: PlayColor[] = ['red', 'yellow', 'green', 'blue']
