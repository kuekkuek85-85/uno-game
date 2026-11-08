// 게임 엔진 핵심 로직 단위 테스트 (vitest)
import { describe, it, expect } from 'vitest'
import { createDeck } from './deck'
import {
  canPlayCard,
  createInitialGame,
  getValidCards,
  playCard,
  topCard,
} from './engine'
import type { Card } from './types'

describe('덱 구성', () => {
  it('표준 UNO는 108장이다', () => {
    expect(createDeck().length).toBe(108)
  })
  it('와일드는 8장(wild 4 + wild4 4)이다', () => {
    const deck = createDeck()
    expect(deck.filter((c) => c.kind === 'wild').length).toBe(4)
    expect(deck.filter((c) => c.kind === 'wild4').length).toBe(4)
  })
  it('각 색 0은 1장, 1~9는 2장이다', () => {
    const red = createDeck().filter((c) => c.color === 'red' && c.kind === 'number')
    expect(red.filter((c) => c.value === 0).length).toBe(1)
    expect(red.filter((c) => c.value === 5).length).toBe(2)
  })
})

describe('낼 수 있는 카드 판정', () => {
  const top: Card = { id: 't', color: 'red', kind: 'number', value: 5 }
  it('같은 색이면 낼 수 있다', () => {
    expect(canPlayCard({ id: 'a', color: 'red', kind: 'skip' }, top, 'red')).toBe(true)
  })
  it('같은 숫자면 낼 수 있다', () => {
    expect(
      canPlayCard({ id: 'a', color: 'blue', kind: 'number', value: 5 }, top, 'red'),
    ).toBe(true)
  })
  it('와일드는 항상 낼 수 있다', () => {
    expect(canPlayCard({ id: 'a', color: 'wild', kind: 'wild' }, top, 'red')).toBe(true)
  })
  it('색·숫자·종류 모두 다르면 못 낸다', () => {
    expect(
      canPlayCard({ id: 'a', color: 'blue', kind: 'number', value: 9 }, top, 'red'),
    ).toBe(false)
  })
})

describe('초기 게임', () => {
  it('각자 7장씩 나눠 갖고 버린 더미는 숫자 카드로 시작', () => {
    const g = createInitialGame()
    expect(g.playerHand.length).toBe(7)
    expect(g.aiHand.length).toBe(7)
    expect(topCard(g).kind).toBe('number')
    expect(g.turn).toBe('player')
  })
})

describe('카드 내기 턴 규칙 (2인전)', () => {
  it('숫자 카드를 내면 상대 턴으로 넘어간다', () => {
    const g = createInitialGame()
    const top = topCard(g)
    // 플레이어 손에 낼 수 있는 숫자 카드를 강제로 하나 넣는다
    const forced: Card = { id: 'force', color: g.currentColor, kind: 'number', value: top.value ?? 0 }
    const g2 = { ...g, playerHand: [forced, ...g.playerHand] }
    const after = playCard(g2, 'player', 'force')
    expect(after.turn).toBe('ai')
  })

  it('Skip을 내면 같은 사람(플레이어)이 한 번 더', () => {
    const g = createInitialGame()
    const forced: Card = { id: 'skip', color: g.currentColor, kind: 'skip' }
    const g2 = { ...g, playerHand: [forced, ...g.playerHand] }
    const after = playCard(g2, 'player', 'skip')
    expect(after.turn).toBe('player')
  })

  it('Draw2를 내면 상대가 2장 뽑고 턴이 넘어간다', () => {
    const g = createInitialGame()
    const forced: Card = { id: 'd2', color: g.currentColor, kind: 'draw2' }
    const g2 = { ...g, playerHand: [forced, ...g.playerHand] }
    const before = g2.aiHand.length
    const after = playCard(g2, 'player', 'd2')
    expect(after.aiHand.length).toBe(before + 2)
    expect(after.turn).toBe('ai')
  })

  it('마지막 카드를 내면 승리한다', () => {
    const g = createInitialGame()
    const only: Card = { id: 'last', color: g.currentColor, kind: 'number', value: 7 }
    const g2 = { ...g, playerHand: [only] }
    const after = playCard(g2, 'player', 'last')
    expect(after.phase).toBe('won')
    expect(after.playerHand.length).toBe(0)
  })
})

describe('유효 카드 목록', () => {
  it('현재 색과 일치하는 카드를 포함한다', () => {
    const top: Card = { id: 't', color: 'green', kind: 'number', value: 3 }
    const hand: Card[] = [
      { id: '1', color: 'green', kind: 'number', value: 8 },
      { id: '2', color: 'red', kind: 'number', value: 1 },
      { id: '3', color: 'wild', kind: 'wild' },
    ]
    const valid = getValidCards(hand, top, 'green')
    const ids = valid.map((c) => c.id)
    expect(ids).toContain('1')
    expect(ids).toContain('3')
    expect(ids).not.toContain('2')
  })
})
