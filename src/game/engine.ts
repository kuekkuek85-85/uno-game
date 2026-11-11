// ──────────────────────────────────────────────────────────────
// UNO 게임 엔진 (순수 함수 모음)
// - 모든 함수는 상태를 변경하지 않고 새 GameState 를 반환한다.
// - 2인전 규칙: Skip/Reverse = "내가 한 번 더", Draw2/Draw4 = "상대가 뽑고 턴 넘김"
//   (스펙 3장 '2인전 규칙 주의' 기준, Draw 누적은 1단계에서 생략)
// ──────────────────────────────────────────────────────────────

import type { Card, GameState, Phase, PlayColor, Turn } from './types'
import { createDeck, shuffle } from './deck'

const HAND_SIZE = 7

function other(who: Turn): Turn {
  return who === 'player' ? 'ai' : 'player'
}

/** 버린 더미의 맨 위(top) 카드 */
export function topCard(state: GameState): Card {
  return state.discard[state.discard.length - 1]
}

/**
 * 한 장이 낼 수 있는 카드인지 판정
 * - top 과 색이 같거나 / 숫자·종류가 같거나 / 와일드면 가능
 */
export function canPlayCard(
  card: Card,
  top: Card,
  currentColor: PlayColor,
): boolean {
  if (card.color === 'wild') return true
  if (card.color === currentColor) return true
  if (card.kind === 'number' && top.kind === 'number' && card.value === top.value)
    return true
  if (card.kind !== 'number' && card.kind === top.kind) return true
  return false
}

/** 손패에서 낼 수 있는 카드 목록 */
export function getValidCards(
  hand: Card[],
  top: Card,
  currentColor: PlayColor,
): Card[] {
  return hand.filter((c) => canPlayCard(c, top, currentColor))
}

// ── 덱 보충(재셔플) ───────────────────────────────────────────
/**
 * 뽑을 더미가 비면 버린 더미의 top 1장만 남기고 나머지를 셔플해 새 덱으로.
 * (스펙 8장 예외 처리)
 */
function refillDeck(
  deck: Card[],
  discard: Card[],
): { deck: Card[]; discard: Card[] } {
  if (deck.length > 0 || discard.length <= 1) return { deck, discard }
  const top = discard[discard.length - 1]
  const rest = discard.slice(0, -1)
  return { deck: shuffle(rest), discard: [top] }
}

/** 더미에서 n장 뽑아 drawn 으로 반환(필요 시 재셔플) */
function drawN(
  deck: Card[],
  discard: Card[],
  n: number,
): { deck: Card[]; discard: Card[]; drawn: Card[] } {
  let d = deck
  let dc = discard
  const drawn: Card[] = []
  for (let i = 0; i < n; i++) {
    if (d.length === 0) {
      const r = refillDeck(d, dc)
      d = r.deck
      dc = r.discard
      if (d.length === 0) break // 정말로 카드가 다 떨어진 경우
    }
    drawn.push(d[d.length - 1])
    d = d.slice(0, -1)
  }
  return { deck: d, discard: dc, drawn }
}

// ── 초기 게임 생성 ────────────────────────────────────────────
export function createInitialGame(): GameState {
  let deck = shuffle(createDeck())

  const playerHand = deck.slice(deck.length - HAND_SIZE)
  deck = deck.slice(0, deck.length - HAND_SIZE)
  const aiHand = deck.slice(deck.length - HAND_SIZE)
  deck = deck.slice(0, deck.length - HAND_SIZE)

  // 시작 카드는 숫자 카드로 (와일드/액션으로 시작하지 않도록)
  let start: Card | undefined
  const leftover: Card[] = []
  while (deck.length > 0) {
    const c = deck[deck.length - 1]
    deck = deck.slice(0, -1)
    if (c.kind === 'number') {
      start = c
      break
    }
    leftover.push(c)
  }
  // 못 뽑은 액션/와일드 카드는 덱 아래로 되돌림
  deck = [...leftover, ...deck]
  if (!start) start = { id: 'fallback', color: 'red', kind: 'number', value: 0 }

  return {
    deck,
    discard: [start],
    currentColor: start.color === 'wild' ? 'red' : (start.color as PlayColor),
    playerHand,
    aiHand,
    turn: 'player',
    pendingDraw: 0,
    phase: 'playing',
    turns: 0,
    playerRecentColors: [],
    lastEvent: '게임 시작! 내 차례입니다.',
  }
}

// ── 카드 내기 ─────────────────────────────────────────────────
/**
 * who 가 cardId 카드를 낸다.
 * 와일드 계열이면 chosenColor 필수.
 */
export function playCard(
  state: GameState,
  who: Turn,
  cardId: string,
  chosenColor?: PlayColor,
): GameState {
  if (state.phase !== 'playing' || state.turn !== who) return state

  const hand = who === 'player' ? state.playerHand : state.aiHand
  const card = hand.find((c) => c.id === cardId)
  if (!card) return state
  if (!canPlayCard(card, topCard(state), state.currentColor)) return state

  const newHand = hand.filter((c) => c.id !== cardId)
  let deck = state.deck
  let discard = [...state.discard, card]
  let aiHand = who === 'player' ? state.aiHand : newHand
  let playerHand = who === 'player' ? newHand : state.playerHand

  // 색 결정
  const newColor: PlayColor =
    card.color === 'wild'
      ? chosenColor ?? 'red'
      : (card.color as PlayColor)

  const whoLabel = who === 'player' ? '나' : 'AI'
  let event = ''

  // 효과 적용 + 다음 턴 결정
  let nextWho: Turn
  if (card.kind === 'skip' || card.kind === 'reverse') {
    // 2인전: 상대 건너뜀 → 같은 사람 한 번 더
    nextWho = who
    event = `${whoLabel}: ${card.kind === 'skip' ? 'Skip' : 'Reverse'} → 한 번 더!`
  } else if (card.kind === 'draw2' || card.kind === 'wild4') {
    // 상대가 뽑고 턴 넘김 (누적 없이 즉시 처리)
    const n = card.kind === 'draw2' ? 2 : 4
    const opponentIsPlayer = who === 'ai'
    const r = drawN(deck, discard, n)
    deck = r.deck
    discard = r.discard
    if (opponentIsPlayer) playerHand = [...playerHand, ...r.drawn]
    else aiHand = [...aiHand, ...r.drawn]
    nextWho = other(who)
    const label = card.kind === 'draw2' ? '+2' : 'Wild +4'
    event = `${whoLabel}: ${label} → 상대가 ${r.drawn.length}장 뽑음`
  } else {
    // 숫자 / 일반 와일드
    nextWho = other(who)
    if (card.kind === 'wild') event = `${whoLabel}: 와일드 → ${colorKo(newColor)} 지정`
    else event = `${whoLabel}: ${colorKo(newColor)} ${card.value} 냄`
  }

  // 상대(플레이어)가 낸 색 추적 (어려움 AI 참고용)
  let playerRecentColors = state.playerRecentColors
  if (who === 'player') {
    playerRecentColors = [...playerRecentColors, newColor].slice(-5)
  }

  // 승패 판정
  let phase: Phase = state.phase
  const winnerHandEmpty = (who === 'player' ? playerHand : aiHand).length === 0
  if (winnerHandEmpty) {
    phase = who === 'player' ? 'won' : 'lost'
    event = who === 'player' ? '🎉 승리! 카드를 모두 냈습니다.' : '😢 패배… AI가 먼저 끝냈습니다.'
    nextWho = who
  }

  return {
    ...state,
    deck,
    discard,
    playerHand,
    aiHand,
    currentColor: newColor,
    turn: nextWho,
    phase,
    turns: state.turns + 1,
    playerRecentColors,
    lastEvent: event,
  }
}

// ── 같은 숫자 카드 여러 장 한꺼번에 내기 ──────────────────────
/**
 * who 가 같은 숫자(value)의 숫자 카드 여러 장을 한 번에 낸다. (하우스 룰)
 * 조건: 모두 숫자 카드이며 value 가 같고, 그중 최소 1장이 현재 top 에 낼 수 있어야 함.
 * 1장이면 playCard 와 동일하게 처리한다.
 */
export function playCards(
  state: GameState,
  who: Turn,
  cardIds: string[],
  chosenColor?: PlayColor,
): GameState {
  if (state.phase !== 'playing' || state.turn !== who) return state
  if (cardIds.length === 0) return state
  if (cardIds.length === 1) return playCard(state, who, cardIds[0], chosenColor)

  const hand = who === 'player' ? state.playerHand : state.aiHand
  const cards = cardIds.map((id) => hand.find((c) => c.id === id))
  if (cards.some((c) => !c)) return state
  const picked = cards as Card[]

  // 모두 숫자 카드 + 같은 value
  if (!picked.every((c) => c.kind === 'number')) return state
  const v = picked[0].value
  if (!picked.every((c) => c.value === v)) return state

  // 최소 1장은 현재 top 에 낼 수 있어야 함
  const top = topCard(state)
  if (!picked.some((c) => canPlayCard(c, top, state.currentColor))) return state

  const idSet = new Set(cardIds)
  const newHand = hand.filter((c) => !idSet.has(c.id))
  const discard = [...state.discard, ...picked]
  // 모두 숫자 카드이므로 마지막 카드의 색이 현재 색이 됨
  const newColor = picked[picked.length - 1].color as PlayColor

  const playerHand = who === 'player' ? newHand : state.playerHand
  const aiHand = who === 'player' ? state.aiHand : newHand

  let playerRecentColors = state.playerRecentColors
  if (who === 'player') {
    playerRecentColors = [...playerRecentColors, newColor].slice(-5)
  }

  const whoLabel = who === 'player' ? '나' : 'AI'
  let phase: Phase = state.phase
  let nextWho: Turn = other(who)
  let event = `${whoLabel}: ${colorKo(newColor)} ${v} ${picked.length}장 냄`

  if (newHand.length === 0) {
    phase = who === 'player' ? 'won' : 'lost'
    nextWho = who
    event =
      who === 'player'
        ? '🎉 승리! 카드를 모두 냈습니다.'
        : '😢 패배… AI가 먼저 끝냈습니다.'
  }

  return {
    ...state,
    discard,
    playerHand,
    aiHand,
    currentColor: newColor,
    turn: nextWho,
    phase,
    turns: state.turns + 1,
    playerRecentColors,
    lastEvent: event,
  }
}

// ── 카드 뽑기(턴 유지) ────────────────────────────────────────
/** who 가 더미에서 1장 뽑는다. 턴은 그대로 둔다(뽑은 카드 처리 여부는 호출자가 결정). */
export function drawCard(state: GameState, who: Turn): GameState {
  if (state.phase !== 'playing' || state.turn !== who) return state
  const r = drawN(state.deck, state.discard, 1)
  if (r.drawn.length === 0) {
    // 뽑기 더미와 버린 더미가 모두 소진되어 더 뽑을 수 없는 경우:
    // 낼 카드가 없는 플레이어가 이 지점에 도달하면 게임을 진행할 수 없으므로
    // 손패가 적은 쪽을 승자로 하여 교착을 끝낸다(동점은 AI 승).
    const playerWins = state.playerHand.length < state.aiHand.length
    return {
      ...state,
      phase: playerWins ? 'won' : 'lost',
      lastEvent: playerWins
        ? '🎉 승리! 더 이상 뽑을 카드가 없어 손패가 적은 내가 이겼습니다.'
        : '😢 패배… 더 이상 뽑을 카드가 없어 손패가 적은 AI가 이겼습니다.',
    }
  }
  const drawn = r.drawn[0]
  const playerHand =
    who === 'player' ? [...state.playerHand, ...r.drawn] : state.playerHand
  const aiHand = who === 'ai' ? [...state.aiHand, ...r.drawn] : state.aiHand
  const playable = canPlayCard(drawn, topCard(state), state.currentColor)
  return {
    ...state,
    deck: r.deck,
    discard: r.discard,
    playerHand,
    aiHand,
    lastEvent:
      (who === 'player' ? '나' : 'AI') +
      `: 카드 1장 뽑음${playable ? ' (낼 수 있음)' : ''}`,
  }
}

/**
 * 벌칙 뽑기: 턴과 무관하게 who 에게 n장을 뽑아 준다.
 * (우노 미콜 벌칙 등 — 현재 턴이 상대일 수도 있으므로 turn 검사를 하지 않는다)
 */
export function drawPenalty(
  state: GameState,
  who: Turn,
  n: number = 1,
): GameState {
  if (state.phase !== 'playing') return state
  const r = drawN(state.deck, state.discard, n)
  if (r.drawn.length === 0) return state
  const playerHand =
    who === 'player' ? [...state.playerHand, ...r.drawn] : state.playerHand
  const aiHand = who === 'ai' ? [...state.aiHand, ...r.drawn] : state.aiHand
  return {
    ...state,
    deck: r.deck,
    discard: r.discard,
    playerHand,
    aiHand,
    lastEvent: `${who === 'player' ? '나' : 'AI'}: 우노 벌칙 +${r.drawn.length}장`,
  }
}

/** 턴을 상대에게 넘긴다(패스). */
export function passTurn(state: GameState, who: Turn): GameState {
  if (state.phase !== 'playing' || state.turn !== who) return state
  return {
    ...state,
    turn: other(who),
    turns: state.turns + 1,
    lastEvent: `${who === 'player' ? '나' : 'AI'}: 패스`,
  }
}

/** 방금 뽑은(손패 마지막) 카드가 낼 수 있는 카드인지 */
export function lastDrawnPlayable(state: GameState, who: Turn): boolean {
  const hand = who === 'player' ? state.playerHand : state.aiHand
  if (hand.length === 0) return false
  const last = hand[hand.length - 1]
  return canPlayCard(last, topCard(state), state.currentColor)
}

export function colorKo(c: PlayColor): string {
  return { red: '빨강', yellow: '노랑', green: '초록', blue: '파랑' }[c]
}
