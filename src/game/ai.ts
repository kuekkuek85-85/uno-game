// ──────────────────────────────────────────────────────────────
// AI 난이도 로직 (3단계) — 스펙 4장
//
// ⭐ 수업용: 세 단계를 aiMoveEasy / aiMoveNormal / aiMoveHard 로
//    "명확히 분리"했다. 학생이 코드를 비교·수정하기 쉽도록 구성.
// ──────────────────────────────────────────────────────────────

import type { Card, Difficulty, GameState, PlayColor } from './types'
import { PLAY_COLORS } from './types'
import { getValidCards, topCard } from './engine'

/** AI의 한 수 결정 결과 */
export type AiDecision =
  | { type: 'play'; cardId: string; chosenColor?: PlayColor }
  | { type: 'draw' }

// ── 공통 도우미 ───────────────────────────────────────────────

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** 손패에서 색깔별 장수 세기 (와일드 제외) */
function countColors(hand: Card[]): Record<PlayColor, number> {
  const counts: Record<PlayColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 }
  for (const c of hand) {
    if (c.color !== 'wild') counts[c.color as PlayColor] += 1
  }
  return counts
}

/** 손패에서 가장 많은 색 (없으면 무작위) */
function mostCommonColor(hand: Card[]): PlayColor {
  const counts = countColors(hand)
  let best: PlayColor = randomItem(PLAY_COLORS)
  let bestN = -1
  for (const color of PLAY_COLORS) {
    if (counts[color] > bestN) {
      bestN = counts[color]
      best = color
    }
  }
  return best
}

function isAction(c: Card): boolean {
  return c.kind === 'skip' || c.kind === 'reverse' || c.kind === 'draw2'
}

// ──────────────────────────────────────────────────────────────
// Level 1 — 쉬움 (랜덤)
// 교육 포인트: "AI가 그냥 아무거나 낸다." 기본 조건문 수준.
// ──────────────────────────────────────────────────────────────
export function aiMoveEasy(state: GameState): AiDecision {
  const valid = getValidCards(state.aiHand, topCard(state), state.currentColor)

  // 낼 수 있는 카드가 없으면 1장 뽑기
  if (valid.length === 0) return { type: 'draw' }

  // 낼 수 있는 카드 중 무작위 1장
  const card = randomItem(valid)

  // 와일드면 색을 무작위로 지정
  if (card.color === 'wild') {
    return { type: 'play', cardId: card.id, chosenColor: randomItem(PLAY_COLORS) }
  }
  return { type: 'play', cardId: card.id }
}

// ──────────────────────────────────────────────────────────────
// Level 2 — 보통 (규칙 기반 휴리스틱)
// 교육 포인트: "조건을 쌓으면 전략이 된다." 휴리스틱 = 조건문 전략.
// ──────────────────────────────────────────────────────────────
export function aiMoveNormal(state: GameState): AiDecision {
  const valid = getValidCards(state.aiHand, topCard(state), state.currentColor)
  if (valid.length === 0) return { type: 'draw' }

  const playerCardCount = state.playerHand.length

  // 4) 상대 손이 2장 이하이고 Draw2/Skip/Reverse가 있으면 → 견제용으로 낸다
  if (playerCardCount <= 2) {
    const guard = valid.find(
      (c) => c.kind === 'draw2' || c.kind === 'skip' || c.kind === 'reverse',
    )
    if (guard) return { type: 'play', cardId: guard.id }
  }

  // 1) 숫자 카드를 우선으로 낸다 (액션 카드는 아껴둠)
  const numbers = valid.filter((c) => c.kind === 'number')
  if (numbers.length > 0) {
    // 2) 낼 색을 고를 땐, 내 손에 가장 많은 색을 유지하는 쪽
    const keep = mostCommonColor(state.aiHand)
    const best =
      numbers.find((c) => c.color === keep) ??
      // 가장 많은 색이 없으면 숫자 중 손에 가장 흔한 색 카드
      numbers.sort(
        (a, b) =>
          countColors(state.aiHand)[b.color as PlayColor] -
          countColors(state.aiHand)[a.color as PlayColor],
      )[0]
    return { type: 'play', cardId: best.id }
  }

  // 숫자가 없으면 액션 카드(와일드 제외) 우선
  const actions = valid.filter(isAction)
  if (actions.length > 0) return { type: 'play', cardId: actions[0].id }

  // 그래도 없으면 와일드 — 3) 색은 내 손패에서 가장 많은 색
  const wild = valid.find((c) => c.color === 'wild')
  if (wild) {
    return { type: 'play', cardId: wild.id, chosenColor: mostCommonColor(state.aiHand) }
  }

  // 혹시 모를 fallback
  return { type: 'play', cardId: valid[0].id }
}

// ──────────────────────────────────────────────────────────────
// Level 3 — 어려움 (상태 기반 판단)
// 교육 포인트: "AI가 왜 이렇게 두지?"를 뜯어보기 = 알고리즘 읽기.
// ──────────────────────────────────────────────────────────────
export function aiMoveHard(state: GameState): AiDecision {
  const valid = getValidCards(state.aiHand, topCard(state), state.currentColor)
  if (valid.length === 0) return { type: 'draw' }

  const myCount = state.aiHand.length
  const oppCount = state.playerHand.length

  // 와일드 색 지정: 상대가 최근 낸 색을 피하고, 내 손에 많은 색을 선호
  const chooseWildColor = (): PlayColor => {
    const recent = new Set(state.playerRecentColors)
    const counts = countColors(state.aiHand)
    const candidates = PLAY_COLORS.filter((c) => !recent.has(c))
    const pool = candidates.length > 0 ? candidates : PLAY_COLORS
    return pool.sort((a, b) => counts[b] - counts[a])[0]
  }

  // ① 공격 모드: 상대 손 ≤ 2 (UNO 임박)
  //    Draw4 > Draw2 > Skip/Reverse 우선 사용
  if (oppCount <= 2) {
    const draw4 = valid.find((c) => c.kind === 'wild4')
    if (draw4) return { type: 'play', cardId: draw4.id, chosenColor: chooseWildColor() }
    const draw2 = valid.find((c) => c.kind === 'draw2')
    if (draw2) return { type: 'play', cardId: draw2.id }
    const stop = valid.find((c) => c.kind === 'skip' || c.kind === 'reverse')
    if (stop) return { type: 'play', cardId: stop.id }
    // 공격 카드가 없으면 숫자라도 내서 턴을 넘기지 않도록 일반 휴리스틱으로
    return aiMoveNormal(state)
  }

  // ② 수비 모드: 내 손 ≤ 2 (내가 유리)
  //    액션 카드로 턴을 가져오며 손패 빨리 비우기
  if (myCount <= 2) {
    // 턴을 한 번 더 가져오는 skip/reverse 로 손패를 빠르게 소진
    const keepTurn = valid.find((c) => c.kind === 'skip' || c.kind === 'reverse')
    if (keepTurn) return { type: 'play', cardId: keepTurn.id }
    // 숫자 소진
    const num = valid.find((c) => c.kind === 'number')
    if (num) return { type: 'play', cardId: num.id }
    // 그 외 아무 유효 카드 (와일드는 색 지정)
    const any = valid[0]
    if (any.color === 'wild')
      return { type: 'play', cardId: any.id, chosenColor: chooseWildColor() }
    return { type: 'play', cardId: any.id }
  }

  // ③ 그 외: Level 2 휴리스틱 사용 (단, 와일드/Draw4 는 아껴둠)
  //    결정적이지 않은 상황에서는 숫자·일반 액션을 먼저 쓴다.
  const nonWild = valid.filter((c) => c.color !== 'wild')
  if (nonWild.length > 0) {
    // 숫자 먼저, 그다음 일반 액션
    const numbers = nonWild.filter((c) => c.kind === 'number')
    const keep = mostCommonColor(state.aiHand)
    if (numbers.length > 0) {
      const best = numbers.find((c) => c.color === keep) ?? numbers[0]
      return { type: 'play', cardId: best.id }
    }
    return { type: 'play', cardId: nonWild[0].id }
  }

  // 와일드만 남은 경우에만 사용
  const wild = valid[0]
  return { type: 'play', cardId: wild.id, chosenColor: chooseWildColor() }
}

// ── 난이도 분배 ───────────────────────────────────────────────
export function decideAiMove(state: GameState, difficulty: Difficulty): AiDecision {
  switch (difficulty) {
    case 'easy':
      return aiMoveEasy(state)
    case 'normal':
      return aiMoveNormal(state)
    case 'hard':
      return aiMoveHard(state)
  }
}
