// ──────────────────────────────────────────────────────────────
// 다인원(3~4인) UNO 엔진 — 순수 함수
// 1:1 엔진(engine.ts)과 분리. 좌석은 0..n-1 번호로 관리하고
// 진행 방향(direction)과 탈락(out)을 지원한다.
//
// 표준 규칙(3인 이상):
//   - Skip: 다음 사람 건너뜀
//   - Reverse: 진행 방향 반대로 (남은 인원이 2명이면 Skip처럼 동작)
//   - +2 / +4: 다음 사람이 뽑고 차례를 건너뜀
//   - 같은 숫자 여러 장 한꺼번에 내기(하우스 룰) 지원
// ──────────────────────────────────────────────────────────────

import type { Card, PlayColor } from './types'
import { createDeck, shuffle } from './deck'
import { canPlayCard, colorKo } from './engine'

export type MultiState = {
  deck: Card[]
  discard: Card[] // 마지막이 top
  currentColor: PlayColor
  hands: Card[][] // 좌석별 손패
  names: string[] // 좌석별 이름(표시용)
  turn: number // 현재 차례 좌석
  direction: 1 | -1
  out: boolean[] // 탈락(나감) 여부
  phase: 'playing' | 'finished'
  winner: number | null
  turns: number
  lastEvent?: string
  /** 손패 1장이 되어 "우노!" 대상인 좌석 */
  unoPending: number | null
}

const HAND_SIZE = 7

export function multiTop(s: MultiState): Card {
  return s.discard[s.discard.length - 1]
}

export function activeSeats(s: MultiState): number[] {
  return s.hands.map((_, i) => i).filter((i) => !s.out[i])
}

/** from 좌석에서 진행 방향으로 steps 칸 이동(탈락자는 건너뜀) */
export function nextSeat(s: MultiState, from: number, steps = 1, dir = s.direction): number {
  const n = s.hands.length
  let seat = from
  let moved = 0
  let guard = 0
  while (moved < steps && guard++ < n * 4) {
    seat = (seat + dir + n) % n
    if (!s.out[seat]) moved++
  }
  return seat
}

function refill(deck: Card[], discard: Card[]) {
  if (deck.length > 0 || discard.length <= 1) return { deck, discard }
  const top = discard[discard.length - 1]
  return { deck: shuffle(discard.slice(0, -1)), discard: [top] }
}

function drawFrom(deck: Card[], discard: Card[], n: number) {
  let d = deck
  let dc = discard
  const drawn: Card[] = []
  for (let i = 0; i < n; i++) {
    if (d.length === 0) {
      const r = refill(d, dc)
      d = r.deck
      dc = r.discard
      if (d.length === 0) break
    }
    drawn.push(d[d.length - 1])
    d = d.slice(0, -1)
  }
  return { deck: d, discard: dc, drawn }
}

function withHand(hands: Card[][], seat: number, hand: Card[]): Card[][] {
  return hands.map((h, i) => (i === seat ? hand : h))
}

// ── 시작 ────────────────────────────────────────────────────
export function createMultiGame(names: string[]): MultiState {
  const n = names.length
  let deck = shuffle(createDeck())
  const hands: Card[][] = []
  for (let i = 0; i < n; i++) {
    hands.push(deck.slice(deck.length - HAND_SIZE))
    deck = deck.slice(0, deck.length - HAND_SIZE)
  }
  // 시작 카드는 숫자 카드
  let start: Card | undefined
  const skipped: Card[] = []
  while (deck.length > 0) {
    const c = deck[deck.length - 1]
    deck = deck.slice(0, -1)
    if (c.kind === 'number') {
      start = c
      break
    }
    skipped.push(c)
  }
  deck = [...skipped, ...deck]
  if (!start) start = { id: 'fallback', color: 'red', kind: 'number', value: 0 }

  const first = Math.floor(Math.random() * n)
  return {
    deck,
    discard: [start],
    currentColor: start.color as PlayColor,
    hands,
    names,
    turn: first,
    direction: 1,
    out: names.map(() => false),
    phase: 'playing',
    winner: null,
    turns: 0,
    lastEvent: `게임 시작! ${names[first]} 차례`,
    unoPending: null,
  }
}

// ── 카드 내기(1장 또는 같은 숫자 여러 장) ───────────────────
export function multiPlay(
  s: MultiState,
  seat: number,
  cardIds: string[],
  chosenColor?: PlayColor,
): MultiState {
  if (s.phase !== 'playing' || s.turn !== seat || s.out[seat]) return s
  if (cardIds.length === 0) return s
  const hand = s.hands[seat]
  const cards = cardIds.map((id) => hand.find((c) => c.id === id))
  if (cards.some((c) => !c)) return s
  const picked = cards as Card[]
  const top = multiTop(s)

  if (picked.length > 1) {
    // 같은 숫자 여러 장: 숫자 카드만, 같은 value, 최소 1장은 낼 수 있어야 함
    if (!picked.every((c) => c.kind === 'number')) return s
    if (!picked.every((c) => c.value === picked[0].value)) return s
    if (!picked.some((c) => canPlayCard(c, top, s.currentColor))) return s
  } else if (!canPlayCard(picked[0], top, s.currentColor)) {
    return s
  }

  const idSet = new Set(cardIds)
  const newHand = hand.filter((c) => !idSet.has(c.id))
  const last = picked[picked.length - 1]
  let deck = s.deck
  let discard = [...s.discard, ...picked]
  let hands = withHand(s.hands, seat, newHand)
  let direction = s.direction
  const color: PlayColor =
    last.color === 'wild' ? chosenColor ?? 'red' : (last.color as PlayColor)
  const me = s.names[seat]
  let event = ''
  let next: number

  const activeCount = activeSeats(s).length
  if (picked.length > 1) {
    next = nextSeat(s, seat, 1, direction)
    event = `${me}: ${colorKo(color)} ${last.value} ${picked.length}장`
  } else if (last.kind === 'skip') {
    next = nextSeat(s, seat, 2, direction)
    event = `${me}: Skip → ${s.names[nextSeat(s, seat, 1, direction)]} 건너뜀`
  } else if (last.kind === 'reverse') {
    direction = (direction === 1 ? -1 : 1) as 1 | -1
    if (activeCount <= 2) {
      next = seat // 2명이면 Skip처럼 한 번 더
      event = `${me}: Reverse → 한 번 더`
    } else {
      next = nextSeat({ ...s, direction }, seat, 1, direction)
      event = `${me}: Reverse → 방향 전환`
    }
  } else if (last.kind === 'draw2' || last.kind === 'wild4') {
    const n = last.kind === 'draw2' ? 2 : 4
    const victim = nextSeat(s, seat, 1, direction)
    const r = drawFrom(deck, discard, n)
    deck = r.deck
    discard = r.discard
    hands = withHand(hands, victim, [...hands[victim], ...r.drawn])
    next = nextSeat(s, seat, 2, direction)
    event = `${me}: ${last.kind === 'draw2' ? '+2' : 'Wild +4'} → ${s.names[victim]} ${r.drawn.length}장 뽑고 건너뜀`
  } else {
    next = nextSeat(s, seat, 1, direction)
    event =
      last.kind === 'wild'
        ? `${me}: 와일드 → ${colorKo(color)}`
        : `${me}: ${colorKo(color)} ${last.value}`
  }

  const won = newHand.length === 0
  return {
    ...s,
    deck,
    discard,
    hands,
    direction,
    currentColor: color,
    turn: won ? seat : next,
    phase: won ? 'finished' : 'playing',
    winner: won ? seat : null,
    turns: s.turns + 1,
    lastEvent: won ? `🎉 ${me} 승리!` : event,
    unoPending: newHand.length === 1 ? seat : null,
  }
}

/** 1장 뽑기. 뽑은 카드를 낼 수 없으면 자동으로 다음 사람에게 넘긴다. */
export function multiDraw(s: MultiState, seat: number): MultiState {
  if (s.phase !== 'playing' || s.turn !== seat) return s
  const r = drawFrom(s.deck, s.discard, 1)
  if (r.drawn.length === 0) return multiPass(s, seat)
  const card = r.drawn[0]
  const drawn: MultiState = {
    ...s,
    deck: r.deck,
    discard: r.discard,
    hands: withHand(s.hands, seat, [...s.hands[seat], card]),
    lastEvent: `${s.names[seat]}: 1장 뽑음`,
    unoPending: s.unoPending === seat ? null : s.unoPending,
  }
  return canPlayCard(card, multiTop(s), s.currentColor) ? drawn : multiPass(drawn, seat)
}

/** 패스(턴 넘김). 10초 시간 초과 시에도 사용 */
export function multiPass(s: MultiState, seat: number): MultiState {
  if (s.phase !== 'playing' || s.turn !== seat) return s
  return {
    ...s,
    turn: nextSeat(s, seat, 1),
    turns: s.turns + 1,
    lastEvent: `${s.names[seat]}: 패스`,
    unoPending: s.unoPending === seat ? s.unoPending : null,
  }
}

/** 우노 벌칙: seat 에게 n장 (턴 변화 없음) */
export function multiPenalty(s: MultiState, seat: number, n = 1): MultiState {
  if (s.phase !== 'playing') return s
  const r = drawFrom(s.deck, s.discard, n)
  return {
    ...s,
    deck: r.deck,
    discard: r.discard,
    hands: withHand(s.hands, seat, [...s.hands[seat], ...r.drawn]),
    unoPending: null,
    lastEvent: `우노! ${s.names[seat]} 못 외쳐서 +${r.drawn.length}장`,
  }
}

/** 탈락(나감): 손패는 덱 아래로 돌려놓고, 1명 남으면 그 사람 승리 */
export function multiEliminate(s: MultiState, seat: number): MultiState {
  if (s.phase !== 'playing' || s.out[seat]) return s
  const out = s.out.map((o, i) => (i === seat ? true : o))
  const after: MultiState = {
    ...s,
    out,
    deck: [...s.hands[seat], ...s.deck],
    hands: withHand(s.hands, seat, []),
    unoPending: s.unoPending === seat ? null : s.unoPending,
    lastEvent: `${s.names[seat]} 나감`,
  }
  const alive = activeSeats(after)
  if (alive.length <= 1) {
    const w = alive[0] ?? null
    return {
      ...after,
      phase: 'finished',
      winner: w,
      lastEvent: w !== null ? `🎉 ${s.names[w]} 승리! (남은 사람)` : '게임 종료',
    }
  }
  if (s.turn === seat) after.turn = nextSeat(after, seat, 1)
  return after
}
