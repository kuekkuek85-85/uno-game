// ──────────────────────────────────────────────────────────────
// PvP 게임 동기화 훅
// - 방(pvp_rooms) 한 행을 단일 출처로 삼아 수를 주고받는다.
// - guest가 매칭 성사 시 초기 상태를 만든다.
// - 하트비트 + 상대 이탈 감지.
// 우노 외치기는 v1 PvP에서 생략(자동 안전).
// ──────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import type { GameState, PlayColor } from '../game/types'
import {
  createInitialGame,
  drawCard,
  getValidCards,
  lastDrawnPlayable,
  passTurn,
  playCard,
  playCards,
  topCard,
} from '../game/engine'
import {
  abandonRoom,
  finishRoom,
  getPlayerLastSeen,
  getRoom,
  heartbeat,
  initRoomState,
  pushMove,
  subscribeRoom,
} from './api'
import { seatToTurn, turnToSeat, type PvpRoom, type Seat } from './types'

const HEARTBEAT_MS = 5000
const ABANDON_MS = 20000

export type PvpResult = { winnerSeat: Seat; abandoned: boolean }

export function usePvpGame(
  roomId: string,
  mySeat: Seat,
  playerId: string,
  onEnd: (r: PvpResult) => void,
) {
  const [room, setRoom] = useState<PvpRoom | null>(null)
  const [drawnThisTurn, setDrawnThisTurn] = useState(false)
  const endedRef = useRef(false)
  const initRef = useRef(false)
  const roomRef = useRef<PvpRoom | null>(null)
  roomRef.current = room

  const myTurnSlot = seatToTurn(mySeat)

  // 차례가 바뀌면 "뽑기 사용" 초기화
  useEffect(() => {
    setDrawnThisTurn(false)
  }, [room?.turn_seat])

  // ── 방 구독 + 초기 로드 ────────────────────────────────────
  useEffect(() => {
    let active = true
    getRoom(roomId).then((r) => {
      if (active && r) setRoom(r)
    })
    const unsub = subscribeRoom(roomId, (r) => setRoom(r))
    return () => {
      active = false
      unsub()
    }
  }, [roomId])

  // ── guest: 초기 게임 상태 생성(1회) ────────────────────────
  useEffect(() => {
    if (initRef.current) return
    if (mySeat !== 'guest') return
    if (!room || room.status !== 'active' || room.state) return
    initRef.current = true
    const initial = createInitialGame()
    const firstSeat: Seat = Math.random() < 0.5 ? 'host' : 'guest'
    // 엔진 상태의 turn도 선공 좌석에 맞춘다
    initial.turn = seatToTurn(firstSeat)
    initial.lastEvent = '게임 시작!'
    initRoomState(roomId, initial, firstSeat)
  }, [room, mySeat, roomId])

  // ── 종료 감지(상대가 끝냈을 때) ────────────────────────────
  useEffect(() => {
    if (!room || endedRef.current) return
    if (room.status === 'finished' && room.winner_seat) {
      endedRef.current = true
      onEnd({ winnerSeat: room.winner_seat, abandoned: false })
    } else if (room.status === 'abandoned' && room.winner_seat) {
      endedRef.current = true
      onEnd({ winnerSeat: room.winner_seat, abandoned: true })
    }
  }, [room, onEnd])

  // ── 하트비트 + 상대 이탈 감지 ──────────────────────────────
  useEffect(() => {
    const hb = setInterval(() => heartbeat(playerId), HEARTBEAT_MS)
    const watch = setInterval(async () => {
      const r = roomRef.current
      if (!r || r.status !== 'active' || endedRef.current) return
      const opponentId = mySeat === 'host' ? r.guest_id : r.host_id
      if (!opponentId) return
      const seen = await getPlayerLastSeen(opponentId)
      if (seen && Date.now() - seen > ABANDON_MS && !endedRef.current) {
        endedRef.current = true
        await abandonRoom(roomId, mySeat)
        onEnd({ winnerSeat: mySeat, abandoned: true })
      }
    }, HEARTBEAT_MS)
    return () => {
      clearInterval(hb)
      clearInterval(watch)
    }
  }, [playerId, roomId, mySeat, onEnd])

  // ── 파생값 ─────────────────────────────────────────────────
  const state: GameState | null = room?.state ?? null
  const myTurn = Boolean(state && room?.turn_seat === mySeat && room.status === 'active')
  const myHand = state
    ? myTurnSlot === 'player'
      ? state.playerHand
      : state.aiHand
    : []
  const oppHandCount = state
    ? myTurnSlot === 'player'
      ? state.aiHand.length
      : state.playerHand.length
    : 0
  const validIds = new Set(
    state && myTurn
      ? getValidCards(myHand, topCard(state), state.currentColor).map((c) => c.id)
      : [],
  )

  // ── 수 두기(공유 상태 갱신) ────────────────────────────────
  const commit = (next: GameState) => {
    if (next.phase === 'won' || next.phase === 'lost') {
      const winnerSeat: Seat = next.phase === 'won' ? 'host' : 'guest'
      endedRef.current = true
      finishRoom(roomId, winnerSeat, next)
      onEnd({ winnerSeat, abandoned: false })
    } else {
      pushMove(roomId, next, turnToSeat(next.turn))
    }
    // 낙관적 반영
    setRoom((r) => (r ? { ...r, state: next, turn_seat: turnToSeat(next.turn) } : r))
  }

  const play = (cardId: string, chosenColor?: PlayColor) => {
    if (!state || !myTurn) return
    commit(playCard(state, myTurnSlot, cardId, chosenColor))
  }
  const playMany = (cardIds: string[]) => {
    if (!state || !myTurn) return
    commit(playCards(state, myTurnSlot, cardIds))
  }
  const draw = () => {
    if (!state || !myTurn || drawnThisTurn) return
    setDrawnThisTurn(true)
    const next = drawCard(state, myTurnSlot)
    commit(!lastDrawnPlayable(next, myTurnSlot) ? passTurn(next, myTurnSlot) : next)
  }
  const pass = () => {
    if (!state || !myTurn) return
    commit(passTurn(state, myTurnSlot))
  }

  return {
    room,
    state,
    myTurn,
    myHand,
    oppHandCount,
    validIds,
    drawnThisTurn,
    canDraw: myTurn && !drawnThisTurn,
    play,
    playMany,
    draw,
    pass,
  }
}
