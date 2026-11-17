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
  drawPenalty,
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
  pushUno,
  subscribeRoom,
} from './api'
import { seatToTurn, turnToSeat, type PvpRoom, type Seat } from './types'

const HEARTBEAT_MS = 5000
const POLL_MS = 1200 // Realtime가 끊겨도 상태를 따라잡는 폴백 주기
const ABANDON_MS = 45000 // 모바일 백그라운드 등으로 인한 오판을 줄이려 넉넉히
const TURN_LIMIT_S = 10 // 내 차례 제한 시간(초과 시 자동 패스)

export type PvpResult = { winnerSeat: Seat; abandoned: boolean }

export function usePvpGame(
  roomId: string,
  mySeat: Seat,
  playerId: string,
  onEnd: (r: PvpResult) => void,
) {
  const [room, setRoom] = useState<PvpRoom | null>(null)
  const [drawnThisTurn, setDrawnThisTurn] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const endedRef = useRef(false)
  const initRef = useRef(false)
  const roomRef = useRef<PvpRoom | null>(null)
  roomRef.current = room

  const myTurnSlot = seatToTurn(mySeat)

  // 서버 방 상태를 안전하게 병합: 종료 상태는 항상, 그 외엔 state.turns(단조 증가)로 판단.
  // (클럭 의존 제거 → 양쪽 화면이 어긋나거나 턴이 교착되는 문제 방지)
  const mergeRoom = (r: PvpRoom) =>
    setRoom((prev) => {
      if (!prev) return r
      if (r.status === 'finished' || r.status === 'abandoned') return r
      const rt = r.state?.turns ?? -1
      const pt = prev.state?.turns ?? -1
      return rt >= pt ? r : prev
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

  // ── 초기 게임 상태 생성(양쪽 누구나, 동시성 안전) ──────────
  //   state가 비어있으면 먼저 쓰는 쪽이 초기화. 상대가 늦거나 유령이어도 게임이 시작됨.
  useEffect(() => {
    if (initRef.current) return
    if (!room || room.status !== 'active' || room.state) return
    initRef.current = true
    const initial = createInitialGame()
    const firstSeat: Seat = Math.random() < 0.5 ? 'host' : 'guest'
    initial.turn = seatToTurn(firstSeat)
    initial.lastEvent = '게임 시작!'
    initRoomState(roomId, initial, firstSeat).then((won) => {
      if (won) setRoom(won) // 내가 초기화 성공 → 즉시 반영 (실패 시 poll이 가져옴)
    })
  }, [room, roomId])

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

  // ── 수 두기(서버 권위 + 실패 시 복구) ──────────────────────
  const commit = async (next: GameState) => {
    // 이번 수로 둔 사람이 손패 1장이 되면 "우노!" 대상으로 표시(아니면 해제).
    const moverHand = myTurnSlot === 'player' ? next.playerHand : next.aiHand
    next.unoPending = moverHand.length === 1 ? myTurnSlot : null

    if (next.phase === 'won' || next.phase === 'lost') {
      const winnerSeat: Seat = next.phase === 'won' ? 'host' : 'guest'
      endedRef.current = true
      finishRoom(roomId, winnerSeat, next)
      onEnd({ winnerSeat, abandoned: false })
      setRoom((r) => (r ? { ...r, state: next, status: 'finished', winner_seat: winnerSeat } : r))
      return
    }
    // 즉시 반영(체감 지연 최소화) 후 서버 기록 → 서버가 돌려준 최신 행으로 확정
    setRoom((r) => (r ? { ...r, state: next, turn_seat: turnToSeat(next.turn) } : r))
    const updated = await pushMove(roomId, next, turnToSeat(next.turn))
    if (updated) {
      setRoom(updated)
    } else {
      // 쓰기 실패/응답 유실 → 서버 진실로 강제 복구(내 낙관적 갱신을 되돌려 턴 교착 방지)
      const r = await getRoom(roomId)
      if (r) setRoom(r)
    }
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

  // ── 우노! 버튼 (사람 vs 사람) ─────────────────────────────
  // · 내가 1장일 때 누르면: 안전
  // · 상대가 1장인데 안 외쳤을 때 누르면: 내가 먼저 외쳐 상대 +1장
  const unoPendingSeat = state?.unoPending ?? null
  const unoActive = Boolean(unoPendingSeat && room?.status === 'active')
  const unoIsMine = unoPendingSeat === myTurnSlot

  const pressUno = async () => {
    const st = roomRef.current?.state
    const pending = st?.unoPending
    if (!st || !pending || roomRef.current?.status !== 'active') return
    let next: GameState
    if (pending === myTurnSlot) {
      next = { ...st, unoPending: null, lastEvent: '우노! 🎉' }
    } else {
      next = { ...drawPenalty(st, pending, 1), unoPending: null }
      next.lastEvent = '우노! 🎯 상대가 못 외쳐서 +1장'
    }
    setRoom((r) => (r ? { ...r, state: next } : r))
    const updated = await pushUno(roomId, next)
    if (updated) setRoom(updated)
  }

  // ── 5초 턴 타이머: 내 차례에 안 내면 자동 패스(다음 사람 턴으로) ──
  useEffect(() => {
    if (!myTurn || !state || room?.status !== 'active') {
      setSecondsLeft(null)
      return
    }
    let left = TURN_LIMIT_S
    setSecondsLeft(left)
    const tick = setInterval(() => {
      left -= 1
      if (left <= 0) {
        clearInterval(tick)
        setSecondsLeft(0)
        commit(passTurn(state, myTurnSlot)) // 시간 초과 → 턴 넘김
      } else {
        setSecondsLeft(left)
      }
    }, 1000)
    return () => clearInterval(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, room?.turn_seat, room?.status, state?.turns])

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
    secondsLeft,
    unoActive,
    unoIsMine,
    pressUno,
    play,
    playMany,
    draw,
    pass,
    leave,
  }
}
