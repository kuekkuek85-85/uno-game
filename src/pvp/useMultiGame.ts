// ──────────────────────────────────────────────────────────────
// 3인 대전 게임 동기화 훅
// - 방(pvp_multi_rooms) 한 행이 단일 출처. 수는 version 조건부로 기록(동시 입력 안전).
// - Realtime + 1.2초 폴링, 10초 턴 타이머, 우노 외치기/잡기,
//   나가기/연결 끊김(45초) → 그 학생만 탈락하고 나머지는 계속.
// ──────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import type { PlayColor } from '../game/types'
import { getValidCards } from '../game/engine'
import {
  createMultiGame,
  multiDraw,
  multiEliminate,
  multiPass,
  multiPenalty,
  multiPlay,
  multiTop,
  type MultiState,
} from '../game/multi'
import { backToPool } from './api'
import {
  getLastSeenMap,
  getMultiRoom,
  multiHeartbeat as heartbeat,
  subscribeMultiRoom,
  writeMultiState,
  type MultiRoom,
} from './multiApi'

const POLL_MS = 1200
const HEARTBEAT_MS = 5000
const ABANDON_MS = 45000
const TURN_LIMIT_S = 10

export function useMultiGame(
  roomId: string,
  playerId: string,
  onEnd: (winnerSeat: number | null) => void,
) {
  const [room, setRoom] = useState<MultiRoom | null>(null)
  const [drawnThisTurn, setDrawnThisTurn] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const roomRef = useRef<MultiRoom | null>(null)
  roomRef.current = room
  const initRef = useRef(false)
  const endedRef = useRef(false)

  // 더 높은 version 만 반영 (같으면 서버 값으로 갱신)
  const merge = (r: MultiRoom) =>
    setRoom((prev) => (!prev || r.version >= prev.version ? r : prev))

  // ── 구독 + 폴링 ────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    getMultiRoom(roomId).then((r) => alive && r && merge(r))
    const unsub = subscribeMultiRoom(roomId, (r) => merge(r))
    const poll = setInterval(async () => {
      const r = await getMultiRoom(roomId)
      if (alive && r) merge(r)
    }, POLL_MS)
    return () => {
      alive = false
      unsub()
      clearInterval(poll)
    }
  }, [roomId])

  // ── 시작 상태 만들기(누구나, version 0 일 때 한 번만 성공) ──
  useEffect(() => {
    if (initRef.current || !room || room.status !== 'active' || room.state) return
    initRef.current = true
    const st = createMultiGame(room.players.map((p) => p.name))
    writeMultiState(roomId, room.version, st).then((r) => r && merge(r))
  }, [room, roomId])

  const st: MultiState | null = room?.state ?? null
  const mySeat = room ? room.players.findIndex((p) => p.id === playerId) : -1
  const iAmOut = Boolean(st && mySeat >= 0 && st.out[mySeat])
  const myTurn = Boolean(st && st.phase === 'playing' && st.turn === mySeat && !iAmOut)
  const myHand = st && mySeat >= 0 ? st.hands[mySeat] : []
  const validIds = new Set(
    st && myTurn ? getValidCards(myHand, multiTop(st), st.currentColor).map((c) => c.id) : [],
  )

  // ── 기록(낙관적 반영 → version 조건부 저장) ─────────────────
  // 다른 친구가 먼저 저장해 충돌하면, 최신 상태 위에 같은 행동을 다시 적용해 재시도.
  // (행동이 더 이상 유효하지 않으면 — 예: 이미 내 차례가 아님 — 최신 상태로 맞추고 끝)
  const commit = async (fn: (s: MultiState) => MultiState) => {
    let cur = roomRef.current
    if (!cur?.state) return
    let next = fn(cur.state)
    if (next === cur.state) return
    setRoom({ ...cur, state: next, version: cur.version + 1, _local: true })
    for (let attempt = 0; attempt < 5; attempt++) {
      const saved = await writeMultiState(roomId, cur.version, next)
      if (saved) {
        setRoom(saved)
        return
      }
      const fresh = await getMultiRoom(roomId)
      if (!fresh?.state) return
      cur = fresh
      next = fn(fresh.state)
      if (next === fresh.state) {
        setRoom(fresh)
        return
      }
    }
    const fresh = await getMultiRoom(roomId)
    if (fresh) setRoom(fresh)
  }

  // 차례가 바뀌면 뽑기 초기화
  useEffect(() => {
    setDrawnThisTurn(false)
  }, [st?.turn, st?.turns])

  // ── 종료 감지: 서버에 저장된 상태로만 판단(저장 전 화면만 보고 끝내지 않음) ──
  useEffect(() => {
    if (!room?.state || room._local || endedRef.current) return
    if (room.state.phase === 'finished') {
      endedRef.current = true
      onEnd(room.state.winner)
    }
  }, [room, onEnd])

  // ── 10초 턴 타이머(초과 시 자동 패스) ───────────────────────
  useEffect(() => {
    if (!myTurn) {
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
        commit((s) => (s.turn === mySeat ? multiPass(s, mySeat) : s))
      } else setSecondsLeft(left)
    }, 1000)
    return () => clearInterval(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, st?.turns])

  // ── 하트비트 + 이탈(45초) 감지 → 그 학생 탈락 ───────────────
  useEffect(() => {
    heartbeat(playerId)
    const hb = setInterval(() => heartbeat(playerId), HEARTBEAT_MS)
    const onVisible = () => document.visibilityState === 'visible' && heartbeat(playerId)
    document.addEventListener('visibilitychange', onVisible)
    const watch = setInterval(async () => {
      const r = roomRef.current
      const s = r?.state
      if (!r || !s || s.phase !== 'playing') return
      const others = r.players
        .map((p, i) => ({ id: p.id, seat: i }))
        .filter((p) => p.id !== playerId && !s.out[p.seat])
      if (others.length === 0) return
      // 내 하트비트(서버 시계)를 기준으로 비교 → 기기 시계 차이와 무관
      const seen = await getLastSeenMap([playerId, ...others.map((o) => o.id)])
      const ref = seen[playerId]
      if (!ref) return // 조회 실패 시 아무도 탈락시키지 않음
      const gone = others.find((o) => seen[o.id] && ref - seen[o.id] > ABANDON_MS)
      if (gone) commit((x) => multiEliminate(x, gone.seat))
    }, HEARTBEAT_MS)
    return () => {
      clearInterval(hb)
      clearInterval(watch)
      document.removeEventListener('visibilitychange', onVisible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, roomId])

  // ── 행동 ───────────────────────────────────────────────────
  const play = (cardId: string, color?: PlayColor) =>
    myTurn && commit((s) => multiPlay(s, mySeat, [cardId], color))
  const playMany = (ids: string[]) => myTurn && commit((s) => multiPlay(s, mySeat, ids))
  const draw = () => {
    if (!myTurn || drawnThisTurn) return
    setDrawnThisTurn(true)
    commit((s) => multiDraw(s, mySeat))
  }
  const pass = () => myTurn && commit((s) => multiPass(s, mySeat))

  const unoPending = st?.unoPending ?? null
  const unoActive = Boolean(st && st.phase === 'playing' && unoPending !== null && !iAmOut)
  const unoIsMine = unoPending === mySeat
  const pressUno = () => {
    const pending = roomRef.current?.state?.unoPending
    if (pending === null || pending === undefined) return
    if (pending === mySeat) {
      commit((s) =>
        s.unoPending === mySeat
          ? { ...s, unoPending: null, lastEvent: `${s.names[mySeat]}: 우노! 🎉` }
          : s,
      )
    } else {
      commit((s) => (s.unoPending === pending ? multiPenalty(s, pending, 1) : s))
    }
  }

  /** 게임 중 나가기 → 나만 탈락(남은 사람은 계속) */
  const leave = () => {
    if (st && st.phase === 'playing' && mySeat >= 0 && !st.out[mySeat]) {
      commit((s) => multiEliminate(s, mySeat))
    }
    backToPool(playerId)
  }

  return {
    room,
    state: st,
    mySeat,
    iAmOut,
    myTurn,
    myHand,
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
