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
  backToPool,
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
const POLL_MS = 2500 // Realtime가 끊겨도 상태를 따라잡는 폴백 주기
const ABANDON_MS = 45000 // 모바일 백그라운드 등으로 인한 오판을 줄이려 넉넉히

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

  // 서버 방 상태를 안전하게 병합: 종료 상태는 항상, 그 외엔 더 최신(updated_at)일 때만 반영.
  // (내 낙관적 갱신을 오래된 폴링 결과가 되돌리는 것을 방지)
  const mergeRoom = (r: PvpRoom) =>
    setRoom((prev) => {
      if (!prev) return r
      if (r.status === 'finished' || r.status === 'abandoned') return r
      return new Date(r.updated_at).getTime() >= new Date(prev.updated_at).getTime()
        ? r
        : prev
    })

  // 차례가 바뀌면 "뽑기 사용" 초기화
  useEffect(() => {
    setDrawnThisTurn(false)
  }, [room?.turn_seat])

  // ── 방 구독 + 초기 로드 + 폴링 폴백 ────────────────────────
  useEffect(() => {
    let active = true
    getRoom(roomId).then((r) => {
      if (active && r) mergeRoom(r)
    })
    const unsub = subscribeRoom(roomId, (r) => mergeRoom(r))
    // Realtime가 느리거나 끊겨도 2.5초마다 따라잡는다(호스트 멈춤/게임 얼어붙음 방지)
    const poll = setInterval(async () => {
      if (endedRef.current) return
      const r = await getRoom(roomId)
      if (active && r) mergeRoom(r)
    }, POLL_MS)
    return () => {
      active = false
      unsub()
      clearInterval(poll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  // ── 화면이 다시 보이면 즉시 하트비트(백그라운드 복귀 대응) ──
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') heartbeat(playerId)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [playerId])

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
    // 게스트 화면에도 즉시 반영
    setRoom((prev) =>
      prev
        ? { ...prev, state: initial, turn_seat: firstSeat, updated_at: new Date().toISOString() }
        : prev,
    )
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
    // 낙관적 반영 (updated_at을 올려 폴링 폴백이 이 수를 되돌리지 않게 함)
    setRoom((r) =>
      r
        ? { ...r, state: next, turn_seat: turnToSeat(next.turn), updated_at: new Date().toISOString() }
        : r,
    )
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

  // 나가기(기권): 상대를 즉시 부전승으로 풀어주고 나는 풀로 복귀
  const leave = () => {
    const r = roomRef.current
    if (!endedRef.current && r && (r.status === 'active' || r.status === 'waiting')) {
      endedRef.current = true
      const oppSeat: Seat = mySeat === 'host' ? 'guest' : 'host'
      abandonRoom(roomId, oppSeat) // 상대 부전승
    }
    backToPool(playerId)
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
    leave,
  }
}
