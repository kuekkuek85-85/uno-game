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
  | { type: 'playMany'; cardIds: string[] } // 같은 숫자 여러 장 한꺼번에
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
    // 색깔별 장수는 한 번만 계산해 재사용(정렬 비교자 안 반복 계산 방지)
    const counts = countColors(state.aiHand)
    const best =
      numbers.find((c) => c.color === keep) ??
      // 가장 많은 색이 없으면 숫자 중 손에 가장 흔한 색 카드 (원본 보존 위해 사본 정렬)
      [...numbers].sort(
        (a, b) =>
          counts[b.color as PlayColor] - counts[a.color as PlayColor],
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

  const play = (c: Card, chosenColor?: PlayColor): AiDecision => ({
    type: 'play',
    cardId: c.id,
    chosenColor,
  })

  // 숫자 카드를 낼 땐 손에 있는 같은 숫자 카드를 모두 한꺼번에 내 손패를 빨리 비운다
  // (하우스 룰 — 사람 플레이어와 동일한 이점)
  const playNumber = (c: Card): AiDecision => {
    const same = state.aiHand.filter(
      (x) => x.kind === 'number' && x.value === c.value,
    )
    if (same.length > 1) return { type: 'playMany', cardIds: same.map((x) => x.id) }
    return play(c)
  }

  // 와일드 색 지정: 상대가 최근 낸 색을 피하고, 내 손에 많은 색을 선호
  const chooseWildColor = (): PlayColor => {
    const recent = new Set(state.playerRecentColors)
    const counts = countColors(state.aiHand)
    const candidates = PLAY_COLORS.filter((c) => !recent.has(c))
    const pool = candidates.length > 0 ? candidates : PLAY_COLORS
    return pool.sort((a, b) => counts[b] - counts[a])[0]
  }

  // ⭐ 턴 연쇄: Skip/Reverse 는 2인전에서 "한 번 더" 두게 해준다.
  //    그 뒤에 이어서 낼 카드(같은 색 / 또 다른 Skip·Reverse)가 있으면
  //    턴을 넘기지 않고 카드를 연달아 몰아낸다 → 상대에게 차례를 거의 안 줌.
  const keepTurnCards = valid.filter(
    (c) => c.kind === 'skip' || c.kind === 'reverse',
  )
  const pickChainable = (): Card | undefined => {
    for (const k of keepTurnCards) {
      const C = k.color as PlayColor // skip/reverse 는 색이 있는 카드
      const hasFollowUp = state.aiHand.some(
        (c) =>
          c.id !== k.id &&
          (c.color === C || c.kind === 'skip' || c.kind === 'reverse'),
      )
      if (hasFollowUp) return k
    }
    return undefined
  }

  // ① 공격 모드: 상대 손 ≤ 2 (UNO 임박) — 상대가 못 끝내게 압박
  if (oppCount <= 2) {
    // 결정타: Draw4 > Draw2 로 상대 손패를 불린다
    const draw4 = valid.find((c) => c.kind === 'wild4')
    if (draw4) return play(draw4, chooseWildColor())
    const draw2 = valid.find((c) => c.kind === 'draw2')
    if (draw2) return play(draw2)
    // 드로우가 없으면 Skip/Reverse 연쇄로 상대 차례를 계속 빼앗는다
    const chain = pickChainable()
    if (chain) return play(chain)
    if (keepTurnCards.length > 0) return play(keepTurnCards[0])
    // 그래도 없으면 보통 휴리스틱(숫자 등)
    return aiMoveNormal(state)
  }

  // ② 수비 모드: 내 손 ≤ 2 (내가 유리) — 턴을 유지하며 빠르게 비운다
  if (myCount <= 2) {
    const chain = pickChainable()
    if (chain) return play(chain)
    if (keepTurnCards.length > 0) return play(keepTurnCards[0])
    const num = valid.find((c) => c.kind === 'number')
    if (num) return playNumber(num)
    const any = valid[0]
    return any.color === 'wild' ? play(any, chooseWildColor()) : play(any)
  }

  // ③ 중반: 턴 연쇄로 카드를 몰아내는 것을 최우선, 와일드/Draw4 는 아껴둔다
  const chain = pickChainable()
  if (chain) return play(chain)

  const nonWild = valid.filter((c) => c.color !== 'wild')
  if (nonWild.length > 0) {
    const numbers = nonWild.filter((c) => c.kind === 'number')
    if (numbers.length > 0) {
      // 손에 가장 많은 색을 유지(연쇄·대응 유연성)
      const keep = mostCommonColor(state.aiHand)
      const counts = countColors(state.aiHand)
      const best =
        numbers.find((c) => c.color === keep) ??
        [...numbers].sort(
          (a, b) => counts[b.color as PlayColor] - counts[a.color as PlayColor],
        )[0]
      return playNumber(best)
    }
    // 숫자가 없으면 일반 액션(Draw2 등)
    return play(nonWild[0])
  }

  // 와일드만 남은 경우에만 사용
  return play(valid[0], chooseWildColor())
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
