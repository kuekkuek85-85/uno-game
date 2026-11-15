// ──────────────────────────────────────────────────────────────
// 게임 진행 훅
// - 게임 상태 보관, 플레이어 액션 처리, AI 턴 자동 진행
// - 우노 외치기 규칙: 손패 1장이 되면 제한 시간 안에 "우노!"를 외쳐야 하고,
//   못 외치면 상대가 잡아 벌칙 1장. (사람 vs AI 각색)
// ──────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import type { Difficulty, GameState, PlayColor, Turn } from '../game/types'
import {
  createInitialGame,
  drawCard,
  drawPenalty,
  lastDrawnPlayable,
  passTurn,
  playCard,
  playCards,
  getValidCards,
  topCard,
} from '../game/engine'
import { decideAiMove, type AiDecision } from '../game/ai'

const AI_DELAY_MS = 900
const UNO_CALL_MS = 3000 // 내가 "우노!"를 외쳐야 하는 제한 시간
const UNO_CATCH_MS = 3500 // AI가 깜빡했을 때 내가 "잡기!"할 수 있는 시간
const TOAST_MS = 2200

// 난이도별 AI의 우노 성실도: call=스스로 외칠 확률, catch=내 미콜을 잡을 확률
const UNO_PROB: Record<Difficulty, { call: number; catch: number }> = {
  easy: { call: 0.4, catch: 0.4 },
  normal: { call: 0.75, catch: 0.75 },
  hard: { call: 1.0, catch: 1.0 },
}

/** 진행 중인 우노 상황 */
export type UnoChallenge =
  | { who: 'player'; kind: 'call' } // 내가 "우노!"를 외쳐야 함
  | { who: 'ai'; kind: 'catch' } // AI가 깜빡함 → 내가 "잡기!" 가능
  | null

export function useGame(difficulty: Difficulty, onEnd: (result: 'win' | 'lose') => void) {
  const [state, setState] = useState(createInitialGame)
  const [drawnThisTurn, setDrawnThisTurn] = useState(false)
  const [uno, setUno] = useState<UnoChallenge>(null)
  const [toast, setToast] = useState<string | null>(null)
  const endedRef = useRef(false)

  // 최신 상태 참조(타이머 콜백에서 사용)
  const stateRef = useRef(state)
  stateRef.current = state

  const unoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const P = UNO_PROB[difficulty]

  // 낼 수 있는 카드 id 집합 (UI 강조용)
  const validIds = new Set(
    getValidCards(state.playerHand, topCard(state), state.currentColor).map((c) => c.id),
  )

  // ── 토스트 ────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), TOAST_MS)
  }

  // ── 우노 타이머 ───────────────────────────────────────────
  const clearUnoTimer = () => {
    if (unoTimerRef.current) {
      clearTimeout(unoTimerRef.current)
      unoTimerRef.current = null
    }
  }
  const clearUno = () => {
    clearUnoTimer()
    setUno(null)
  }

  // 내가 손패 1장이 됨 → 제한 시간 안에 외쳐야 함
  const openPlayerCall = () => {
    setUno({ who: 'player', kind: 'call' })
    clearUnoTimer()
    unoTimerRef.current = setTimeout(() => {
      setUno(null)
      const cur = stateRef.current
      if (cur.phase !== 'playing' || cur.playerHand.length !== 1) return
      if (Math.random() < P.catch) {
        setState(drawPenalty(cur, 'player', 1))
        showToast('😅 우노를 못 외쳤어요! AI가 잡아서 +1장')
      } else {
        showToast('휴… AI가 못 봤어요 (다음엔 우노!)')
      }
    }, UNO_CALL_MS)
  }

  // AI가 손패 1장이 됨
  const openAiMilestone = () => {
    if (Math.random() < P.call) {
      showToast('🔔 AI: 우노!')
      return
    }
    // AI가 깜빡함 → 내가 잡을 기회
    setUno({ who: 'ai', kind: 'catch' })
    clearUnoTimer()
    unoTimerRef.current = setTimeout(() => setUno(null), UNO_CATCH_MS)
  }

  /** 한 수를 둔 뒤, 그 사람이 막 손패 1장이 되었는지 확인해 우노 상황을 연다 */
  const afterMove = (prev: GameState, next: GameState, who: Turn) => {
    if (next.phase !== 'playing') return
    const before = who === 'player' ? prev.playerHand.length : prev.aiHand.length
    const now = who === 'player' ? next.playerHand.length : next.aiHand.length
    if (now === 1 && before > 1) {
      if (who === 'player') openPlayerCall()
      else openAiMilestone()
    }
  }

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

  // ── 언마운트 시 타이머 정리 ───────────────────────────────
  useEffect(() => {
    return () => {
      if (unoTimerRef.current) clearTimeout(unoTimerRef.current)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  // ── AI 턴 자동 진행 (우노 상황 중에는 멈춤) ────────────────
  useEffect(() => {
    if (state.turn !== 'ai' || state.phase !== 'playing' || uno) return
    const timer = setTimeout(() => {
      const cur = stateRef.current
      if (cur.turn !== 'ai' || cur.phase !== 'playing') return

      const apply = (st: GameState, d: AiDecision): GameState => {
        if (d.type === 'playMany') return playCards(st, 'ai', d.cardIds)
        if (d.type === 'play') return playCard(st, 'ai', d.cardId, d.chosenColor)
        return st
      }

      const decision = decideAiMove(cur, difficulty)
      let next: GameState
      if (decision.type === 'draw') {
        const drawn = drawCard(cur, 'ai')
        if (lastDrawnPlayable(drawn, 'ai')) {
          const d2 = decideAiMove(drawn, difficulty)
          next = d2.type === 'draw' ? passTurn(drawn, 'ai') : apply(drawn, d2)
        } else {
          next = passTurn(drawn, 'ai')
        }
      } else {
        next = apply(cur, decision)
      }

      setState(next)
      afterMove(cur, next, 'ai')
    }, AI_DELAY_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turn, state.phase, state.turns, difficulty, uno])

  // ── 플레이어 액션 ──────────────────────────────────────────
  const playPlayerCard = (cardId: string, chosenColor?: PlayColor) => {
    clearUno()
    const cur = stateRef.current
    const next = playCard(cur, 'player', cardId, chosenColor)
    setState(next)
    setDrawnThisTurn(false)
    afterMove(cur, next, 'player')
  }

  const playPlayerCards = (cardIds: string[]) => {
    clearUno()
    const cur = stateRef.current
    const next = playCards(cur, 'player', cardIds)
    setState(next)
    setDrawnThisTurn(false)
    afterMove(cur, next, 'player')
  }

  const drawPlayerCard = () => {
    clearUno()
    const cur = stateRef.current
    if (cur.turn !== 'player' || cur.phase !== 'playing') return
    const next = drawCard(cur, 'player')
    // 뽑은 카드를 낼 수 없으면 자동으로 턴을 넘긴다
    setState(!lastDrawnPlayable(next, 'player') ? passTurn(next, 'player') : next)
    setDrawnThisTurn(true)
  }

  const passPlayerTurn = () => {
    clearUno()
    setState(passTurn(stateRef.current, 'player'))
    setDrawnThisTurn(false)
  }

  // "우노!" 버튼 — 상황에 따라 동작이 달라진다.
  // · 내가 1장일 때 누르면: 안전(벌칙 방지)
  // · AI가 1장인데 깜빡했을 때 누르면: 내가 먼저 외쳐 AI에게 벌칙 1장
  const pressUno = () => {
    if (!uno) return
    clearUno()
    if (uno.who === 'player') {
      showToast('우노! 🎉 안전합니다')
    } else {
      setState(drawPenalty(stateRef.current, 'ai', 1))
      showToast('우노! 🎯 AI가 먼저 못 외쳤어요 → +1장')
    }
  }

  const restart = () => {
    endedRef.current = false
    clearUno()
    setToast(null)
    setDrawnThisTurn(false)
    setState(createInitialGame())
  }

  const canDraw =
    state.turn === 'player' && state.phase === 'playing' && !drawnThisTurn && !uno

  return {
    state,
    validIds,
    canDraw,
    drawnThisTurn,
    uno,
    toast,
    pressUno,
    playPlayerCard,
    playPlayerCards,
    drawPlayerCard,
    passPlayerTurn,
    restart,
  }
}
