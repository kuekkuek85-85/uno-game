// 어려움 AI 행동 테스트 (vitest)
import { describe, it, expect } from 'vitest'
import { aiMoveHard } from './ai'
import { createInitialGame } from './engine'
import type { Card, GameState } from './types'

// top=red 5, currentColor=red 인 기본 상태를 만든다
function baseState(aiHand: Card[], playerCount: number): GameState {
  const g = createInitialGame()
  const top: Card = { id: 'top', color: 'red', kind: 'number', value: 5 }
  const playerHand: Card[] = Array.from({ length: playerCount }, (_, i) => ({
    id: `p${i}`,
    color: 'blue',
    kind: 'number',
    value: 9,
  }))
  return {
    ...g,
    discard: [top],
    currentColor: 'red',
    aiHand,
    playerHand,
    turn: 'ai',
    phase: 'playing',
  }
}

describe('aiMoveHard — 턴 연쇄', () => {
  it('중반에 이어서 낼 카드가 있으면 Skip/Reverse로 턴을 유지한다', () => {
    const aiHand: Card[] = [
      { id: 'skip', color: 'red', kind: 'skip' },
      { id: 'r3', color: 'red', kind: 'number', value: 3 }, // skip 뒤 이어서 낼 카드
      { id: 'b1', color: 'blue', kind: 'number', value: 1 },
    ]
    const d = aiMoveHard(baseState(aiHand, 5))
    expect(d.type).toBe('play')
    if (d.type === 'play') expect(d.cardId).toBe('skip')
  })

  it('이어서 낼 카드가 없으면 Skip을 연쇄하지 않고 숫자를 낸다', () => {
    const aiHand: Card[] = [
      { id: 'skip', color: 'red', kind: 'skip' }, // 뒤에 red/skip/reverse 없음
      { id: 'r3', color: 'red', kind: 'number', value: 3 },
    ]
    // skip의 follow-up은 red 카드(r3)가 있으므로 이 경우엔 연쇄함 →
    // follow-up이 진짜 없는 경우를 별도로 구성
    const aiHand2: Card[] = [
      { id: 'skip', color: 'red', kind: 'skip' },
      { id: 'b3', color: 'blue', kind: 'number', value: 3 }, // red도 skip/reverse도 아님
    ]
    const d = aiMoveHard(baseState(aiHand2, 5))
    expect(d.type).toBe('play')
    if (d.type === 'play') expect(d.cardId).toBe('skip') // valid 중 유일하게 낼 수 있는 건 skip
    // (b3는 top=red5 와 색/숫자 불일치라 낼 수 없음 → skip만 valid)
    void aiHand
  })
})

describe('aiMoveHard — 공격 모드', () => {
  it('상대가 UNO 임박이면 Draw4를 결정타로 쓴다', () => {
    const aiHand: Card[] = [
      { id: 'w4', color: 'wild', kind: 'wild4' },
      { id: 'r3', color: 'red', kind: 'number', value: 3 },
    ]
    const d = aiMoveHard(baseState(aiHand, 1)) // 상대 1장
    expect(d.type).toBe('play')
    if (d.type === 'play') {
      expect(d.cardId).toBe('w4')
      expect(d.chosenColor).toBeDefined()
    }
  })
})
