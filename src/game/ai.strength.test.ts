import { describe, it, expect } from 'vitest'
import {
  createInitialGame,
  drawCard,
  lastDrawnPlayable,
  passTurn,
  playCard,
  playCards,
  getValidCards,
  topCard,
} from './engine'
import { decideAiMove, type AiDecision } from './ai'
import { PLAY_COLORS } from './types'

function applyAi(s: ReturnType<typeof createInitialGame>, d: AiDecision) {
  if (d.type === 'playMany') return playCards(s, 'ai', d.cardIds)
  if (d.type === 'play') return playCard(s, 'ai', d.cardId, d.chosenColor)
  return s
}

// 'ai' 슬롯 = 어려움 AI, 'player' 슬롯 = 무작위 합법수 플레이어
function randomPlayerMove(s: ReturnType<typeof createInitialGame>) {
  const valid = getValidCards(s.playerHand, topCard(s), s.currentColor)
  if (valid.length === 0) {
    let n = drawCard(s, 'player')
    if (lastDrawnPlayable(n, 'player')) {
      const v = getValidCards(n.playerHand, topCard(n), n.currentColor)
      const c = v[Math.floor(Math.random() * v.length)]
      const color = c.color === 'wild' ? PLAY_COLORS[Math.floor(Math.random() * 4)] : undefined
      return playCard(n, 'player', c.id, color)
    }
    return passTurn(n, 'player')
  }
  const c = valid[Math.floor(Math.random() * valid.length)]
  const color = c.color === 'wild' ? PLAY_COLORS[Math.floor(Math.random() * 4)] : undefined
  return playCard(s, 'player', c.id, color)
}

function playGame(): 'ai' | 'player' {
  let s = createInitialGame()
  let guard = 0
  while (s.phase === 'playing' && guard++ < 5000) {
    if (s.turn === 'ai') {
      const d = decideAiMove(s, 'hard')
      if (d.type === 'draw') {
        s = drawCard(s, 'ai')
        if (lastDrawnPlayable(s, 'ai')) {
          const d2 = decideAiMove(s, 'hard')
          s = d2.type === 'draw' ? passTurn(s, 'ai') : applyAi(s, d2)
        } else s = passTurn(s, 'ai')
      } else s = applyAi(s, d)
    } else {
      s = randomPlayerMove(s)
    }
  }
  // 무한 루프 방지 가드에 걸리면 손패 적은 쪽
  if (s.phase === 'won') return 'player'
  if (s.phase === 'lost') return 'ai'
  return s.aiHand.length <= s.playerHand.length ? 'ai' : 'player'
}

describe('어려움 AI 강도 시뮬레이션', () => {
  it('무작위 플레이어 상대 승률이 충분히 높다', () => {
    const N = 400
    let aiWins = 0
    for (let i = 0; i < N; i++) if (playGame() === 'ai') aiWins++
    const rate = aiWins / N
    console.log(`어려움 AI 승률 vs 무작위: ${(rate * 100).toFixed(1)}%`)
    expect(rate).toBeGreaterThan(0.55)
  })
})
