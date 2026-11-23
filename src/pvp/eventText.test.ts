import { describe, expect, it } from 'vitest'
import { pvpEventText } from './eventText'

const playing = (lastEvent: string) => ({ phase: 'playing' as const, lastEvent })

describe('pvpEventText — 1:1 안내 문구를 보는 사람 기준으로', () => {
  it('host가 빨강 2를 내면: host 화면은 "나", guest 화면은 상대 이름', () => {
    const st = playing('나: 빨강 2 냄')
    expect(pvpEventText(st, 'host', '민지')).toBe('나: 빨강 2 냄')
    expect(pvpEventText(st, 'guest', '철수')).toBe('철수: 빨강 2 냄')
  })

  it('guest가 내면: guest 화면은 "나", host 화면은 상대 이름 (AI 아님)', () => {
    const st = playing('AI: 파랑 7 2장 냄')
    expect(pvpEventText(st, 'guest', '철수')).toBe('나: 파랑 7 2장 냄')
    expect(pvpEventText(st, 'host', '민지')).toBe('민지: 파랑 7 2장 냄')
  })

  it('뽑기·패스·+2·우노 벌칙도 같은 규칙', () => {
    expect(pvpEventText(playing('AI: 카드 1장 뽑음'), 'host', '민지')).toBe('민지: 카드 1장 뽑음')
    expect(pvpEventText(playing('나: 패스'), 'guest', '철수')).toBe('철수: 패스')
    expect(pvpEventText(playing('나: +2 → 상대가 2장 뽑음'), 'guest', '철수')).toBe(
      '철수: +2 → 상대가 2장 뽑음',
    )
    expect(pvpEventText(playing('AI: 우노 벌칙 +1장'), 'guest', '철수')).toBe('나: 우노 벌칙 +1장')
  })

  it('게임 끝 문구는 승자 좌석 기준 (AI 표현 없음)', () => {
    const hostWon = { phase: 'won' as const, lastEvent: '🎉 승리! 카드를 모두 냈습니다.' }
    expect(pvpEventText(hostWon, 'host', '민지')).toBe('🎉 승리!')
    expect(pvpEventText(hostWon, 'guest', '철수')).toBe('😢 철수 승리')
    const guestWon = { phase: 'lost' as const, lastEvent: '😢 패배… AI가 먼저 끝냈습니다.' }
    expect(pvpEventText(guestWon, 'guest', '철수')).toBe('🎉 승리!')
    expect(pvpEventText(guestWon, 'host', '민지')).toBe('😢 민지 승리')
  })

  it('주어 없는 문구는 그대로', () => {
    expect(pvpEventText(playing('게임 시작!'), 'guest', '철수')).toBe('게임 시작!')
  })
})
