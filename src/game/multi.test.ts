import { describe, it, expect } from 'vitest'
import type { Card } from './types'
import {
  createMultiGame,
  multiDraw,
  multiEliminate,
  multiPass,
  multiPenalty,
  multiPlay,
  nextSeat,
  type MultiState,
} from './multi'

const red5: Card = { id: 'top', color: 'red', kind: 'number', value: 5 }
const filler = (p: string, n = 3): Card[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, color: 'blue', kind: 'number', value: 9 }))

/** 3인, top=빨강5, seat0 차례인 상태 */
function base(seat0: Card[]): MultiState {
  const g = createMultiGame(['A', 'B', 'C'])
  return {
    ...g,
    discard: [red5],
    currentColor: 'red',
    hands: [seat0, filler('b'), filler('c')],
    turn: 0,
    direction: 1,
    unoPending: null,
  }
}

describe('3인 엔진 기본', () => {
  it('3명에게 7장씩 분배', () => {
    const g = createMultiGame(['A', 'B', 'C'])
    expect(g.hands.map((h) => h.length)).toEqual([7, 7, 7])
    expect(g.deck.length + g.discard.length + 21).toBe(108)
  })

  it('숫자 카드 → 다음 사람(0→1)', () => {
    const s = base([{ id: 'x', color: 'red', kind: 'number', value: 3 }, ...filler('a')])
    expect(multiPlay(s, 0, ['x']).turn).toBe(1)
  })

  it('Skip → 한 명 건너뜀(0→2)', () => {
    const s = base([{ id: 'x', color: 'red', kind: 'skip' }, ...filler('a')])
    expect(multiPlay(s, 0, ['x']).turn).toBe(2)
  })

  it('Reverse → 방향 전환(0→2), 이후 2→1', () => {
    const s = base([{ id: 'x', color: 'red', kind: 'reverse' }, ...filler('a')])
    const r = multiPlay(s, 0, ['x'])
    expect(r.direction).toBe(-1)
    expect(r.turn).toBe(2)
    expect(nextSeat(r, 2)).toBe(1)
  })

  it('+2 → 다음 사람이 2장 뽑고 건너뜀(0→2, B +2)', () => {
    const s = base([{ id: 'x', color: 'red', kind: 'draw2' }, ...filler('a')])
    const r = multiPlay(s, 0, ['x'])
    expect(r.hands[1].length).toBe(5)
    expect(r.turn).toBe(2)
  })

  it('같은 숫자 여러 장 → 모두 내고 마지막 색으로', () => {
    const s = base([
      { id: 'p', color: 'red', kind: 'number', value: 5 },
      { id: 'q', color: 'green', kind: 'number', value: 5 },
      ...filler('a'),
    ])
    const r = multiPlay(s, 0, ['p', 'q'])
    expect(r.hands[0].length).toBe(3)
    expect(r.currentColor).toBe('green')
    expect(r.turn).toBe(1)
  })

  it('마지막 카드를 내면 승리', () => {
    const s = base([{ id: 'x', color: 'red', kind: 'number', value: 1 }])
    const r = multiPlay(s, 0, ['x'])
    expect(r.phase).toBe('finished')
    expect(r.winner).toBe(0)
  })

  it('1장 남으면 우노 대상, 벌칙 시 +1장', () => {
    const s = base([{ id: 'x', color: 'red', kind: 'number', value: 1 }, ...filler('a', 1)])
    const r = multiPlay(s, 0, ['x'])
    expect(r.unoPending).toBe(0)
    const p = multiPenalty(r, 0, 1)
    expect(p.hands[0].length).toBe(2)
    expect(p.unoPending).toBe(null)
  })

  it('차례가 아니면 무시', () => {
    const s = base([{ id: 'x', color: 'red', kind: 'number', value: 3 }, ...filler('a')])
    expect(multiPlay(s, 1, ['b0'])).toBe(s)
  })

  it('패스 → 다음 사람', () => {
    const s = base(filler('a'))
    expect(multiPass(s, 0).turn).toBe(1)
  })

  it('낼 수 없는 카드를 뽑으면 자동으로 넘어감', () => {
    const s = { ...base(filler('a')), deck: [{ id: 'd', color: 'blue', kind: 'number', value: 1 } as Card] }
    const r = multiDraw(s, 0)
    expect(r.hands[0].length).toBe(4)
    expect(r.turn).toBe(1)
  })
})

describe('탈락(나감)', () => {
  it('차례인 사람이 나가면 다음 사람으로, 이후 건너뜀', () => {
    const s = base(filler('a'))
    const r = multiEliminate(s, 0)
    expect(r.out[0]).toBe(true)
    expect(r.turn).toBe(1)
    expect(nextSeat(r, 2)).toBe(1) // 0은 건너뜀
  })

  it('1명만 남으면 그 사람 승리', () => {
    const s = base(filler('a'))
    const r = multiEliminate(multiEliminate(s, 1), 2)
    expect(r.phase).toBe('finished')
    expect(r.winner).toBe(0)
  })

  it('남은 2명일 때 Reverse는 한 번 더', () => {
    const s = multiEliminate(base([{ id: 'x', color: 'red', kind: 'reverse' }, ...filler('a')]), 2)
    expect(multiPlay(s, 0, ['x']).turn).toBe(0)
  })
})
