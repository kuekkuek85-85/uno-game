// ──────────────────────────────────────────────────────────────
// 게임 진행 훅
// - 게임 상태 보관, 플레이어 액션 처리, AI 턴 자동 진행
// ──────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Difficulty, PlayColor } from '../game/types'
import {
  createInitialGame,
  drawCard,
  lastDrawnPlayable,
  passTurn,
  playCard,
  playCards,
  getValidCards,
  topCard,
} from '../game/engine'
import { decideAiMove, type AiDecision } from '../game/ai'

const AI_DELAY_MS = 900

export function useGame(difficulty: Difficulty, onEnd: (result: 'win' | 'lose') => void) {
  const [state, setState] = useState(createInitialGame)
  const [drawnThisTurn, setDrawnThisTurn] = useState(false)
  const endedRef = useRef(false)

  // 낼 수 있는 카드 id 집합 (UI 흐리게 처리용)
  const validIds = new Set(
    getValidCards(state.playerHand, topCard(state), state.currentColor).map((c) => c.id),
  )

  // ── 승패 콜백 (한 번만) ────────────────────────────────────
  useEffect(() => {
    if (endedRef.current) return
    if (state.phase === 'won') {
      endedRef.current = true
      onEnd('win')
    } else if (state.phase === 'lost') {
      endedRef.current = true
      onEnd('lose')
    }
  }, [state.phase, onEnd])

  // ── 플레이어 턴 시작 시 "뽑기 사용" 초기화 ─────────────────
  useEffect(() => {
    if (state.turn === 'player' && state.phase === 'playing') {
      setDrawnThisTurn(false)
    }
  }, [state.turn, state.phase])

  // ── AI 턴 자동 진행 ────────────────────────────────────────
  useEffect(() => {
    if (state.turn !== 'ai' || state.phase !== 'playing') return
    const timer = setTimeout(() => {
      setState((cur) => {
        if (cur.turn !== 'ai' || cur.phase !== 'playing') return cur

        // AI 결정을 상태에 적용하는 도우미
        const apply = (st: typeof cur, d: AiDecision): typeof cur => {
          if (d.type === 'playMany') return playCards(st, 'ai', d.cardIds)
          if (d.type === 'play') return playCard(st, 'ai', d.cardId, d.chosenColor)
          return st
        }

        const decision = decideAiMove(cur, difficulty)

        if (decision.type === 'draw') {
          const next = drawCard(cur, 'ai')
          // 뽑은 카드가 낼 수 있으면 내고, 아니면 패스 (무한 뽑기 방지)
          if (lastDrawnPlayable(next, 'ai')) {
            const d2 = decideAiMove(next, difficulty)
            return d2.type === 'draw' ? passTurn(next, 'ai') : apply(next, d2)
          }
          return passTurn(next, 'ai')
        }

        return apply(cur, decision)
      })
    }, AI_DELAY_MS)
    return () => clearTimeout(timer)
  }, [state.turn, state.phase, state.turns, difficulty])

  // ── 플레이어 액션 ──────────────────────────────────────────
  const playPlayerCard = useCallback((cardId: string, chosenColor?: PlayColor) => {
    setState((cur) => playCard(cur, 'player', cardId, chosenColor))
    // 카드를 내면 이번 턴 "뽑기 사용"을 초기화한다.
    // Skip/Reverse로 턴이 유지(한 번 더)될 때도 뽑기를 다시 쓸 수 있도록.
    setDrawnThisTurn(false)
  }, [])

  // 같은 숫자 카드 여러 장 한꺼번에 내기
  const playPlayerCards = useCallback((cardIds: string[]) => {
    setState((cur) => playCards(cur, 'player', cardIds))
    setDrawnThisTurn(false)
  }, [])

  const drawPlayerCard = useCallback(() => {
    setState((cur) => {
      if (cur.turn !== 'player' || cur.phase !== 'playing') return cur
      const next = drawCard(cur, 'player')
      // 뽑은 카드를 낼 수 없으면 자동으로 턴을 넘긴다
      if (!lastDrawnPlayable(next, 'player')) {
        return passTurn(next, 'player')
      }
      return next
    })
    setDrawnThisTurn(true)
  }, [])

  const passPlayerTurn = useCallback(() => {
    setState((cur) => passTurn(cur, 'player'))
    setDrawnThisTurn(false)
  }, [])

  const restart = useCallback(() => {
    endedRef.current = false
    setDrawnThisTurn(false)
    setState(createInitialGame())
  }, [])

  const canDraw =
    state.turn === 'player' && state.phase === 'playing' && !drawnThisTurn

  return {
    state,
    validIds,
    canDraw,
    drawnThisTurn,
    playPlayerCard,
    playPlayerCards,
    drawPlayerCard,
    passPlayerTurn,
    restart,
  }
}
