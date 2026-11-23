// ──────────────────────────────────────────────────────────────
// PvP 매칭 훅
// 접속 순서 매칭(FIFO). 짝이 올 때까지 계속 기다리고(시간 제한·AI 전환 없음),
// 학생이 스스로 "대기 그만하기"로 나갈 수 있다. 종료 후 재매칭.
// ──────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  abandonRoom,
  backToPool,
  cancelWaitingRoom,
  getRoom,
  heartbeat,
  isPvpAvailable,
  joinPool,
  requestMatch,
  subscribeRoom,
} from './api'
import type { Seat } from './types'

const SEARCH_POLL_MS = 1500

export type MatchPhase = 'connecting' | 'searching' | 'matched' | 'error'

export function usePvpMatch(name: string, studentId: string | null) {
  const [phase, setPhase] = useState<MatchPhase>('connecting')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [mySeat, setMySeat] = useState<Seat>('host')
  const [opponentName, setOpponentName] = useState<string>('상대')
  const playerIdRef = useRef<string | null>(null)
  const waitRoomRef = useRef<string | null>(null) // 내가 host로 기다리는 방
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const unsubRef = useRef<() => void>(() => {})
  const aliveRef = useRef(true) // 화면을 떠났는지(요청 도중 나간 경우 방 정리용)

  const clearSearch = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
    unsubRef.current()
    unsubRef.current = () => {}
  }

  // 한 번의 매칭 시도
  const tryMatch = useCallback(async () => {
    const pid = playerIdRef.current
    if (!pid) return
    clearSearch()
    waitRoomRef.current = null
    setPhase('connecting')
    const res = await requestMatch(pid)
    if (!aliveRef.current) {
      // 매칭 요청 도중 화면을 떠났다 → 방을 남기지 않는다(상대가 기다리지 않게)
      if (res && !res.error) {
        if (res.waiting) await cancelWaitingRoom(res.room_id, pid)
        else await abandonRoom(res.room_id, 'host')
        await backToPool(pid)
      }
      return
    }
    if (!res || res.error) {
      setPhase('error')
      return
    }
    setRoomId(res.room_id)
    if (!res.waiting) {
      // guest로 바로 매칭
      setMySeat('guest')
      setOpponentName(res.opponent_name ?? '상대')
      setPhase('matched')
      return
    }
    // host로 대기 — 짝이 들어올 때까지 계속(시간 제한 없음)
    setMySeat('host')
    setPhase('searching')
    waitRoomRef.current = res.room_id
    // 결과(매칭/재입장)는 딱 한 번만 결정 — 겹친 폴링·실시간 이벤트가 두 번 전환하지 않게
    let decided = false
    const matched = (name: string) => {
      if (decided) return
      decided = true
      clearSearch()
      waitRoomRef.current = null
      setOpponentName(name)
      setPhase('matched')
    }
    // guest 입장 감지(Realtime)
    unsubRef.current = subscribeRoom(res.room_id, (r) => {
      if (r.status === 'active') matched(r.guest_name ?? '상대')
    })
    // 1.5초마다 방 확인 + 하트비트(Realtime가 느리거나 끊겨도 매칭을 잡음)
    pollRef.current = setInterval(async () => {
      if (decided) return
      heartbeat(pid)
      const r = await getRoom(res.room_id)
      if (decided) return
      if (r && r.status === 'active') {
        matched(r.guest_name ?? '상대')
        return
      }
      // 서버가 오래된 대기 방을 정리했으면(60초 이상 대기 등) 조용히 다시 줄을 선다
      if (r && (r.status === 'abandoned' || r.status === 'finished')) {
        decided = true
        clearSearch()
        setTimeout(() => tryMatch(), 0)
      }
    }, SEARCH_POLL_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 대기 그만하기: 내 대기 방을 정리(그 순간 누가 들어왔으면 그 친구를 부전승으로 풀어줌) */
  const leaveWait = useCallback(async () => {
    clearSearch()
    const pid = playerIdRef.current
    const rid = waitRoomRef.current
    waitRoomRef.current = null
    if (!pid) return
    if (rid) {
      const cancelled = await cancelWaitingRoom(rid, pid)
      if (!cancelled) await abandonRoom(rid, 'guest')
    }
    await backToPool(pid)
  }, [])

  // 최초 입장
  useEffect(() => {
    let active = true
    aliveRef.current = true
    if (!isPvpAvailable) {
      setPhase('error')
      return
    }
    joinPool(name, studentId).then((pid) => {
      if (!active) return
      if (!pid) {
        setPhase('error')
        return
      }
      playerIdRef.current = pid
      tryMatch()
    })
    return () => {
      active = false
      aliveRef.current = false
      clearSearch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 재매칭(게임 끝난 뒤 풀 복귀)
  const requeue = useCallback(async () => {
    const pid = playerIdRef.current
    if (!pid) return
    await backToPool(pid)
    await tryMatch()
  }, [tryMatch])

  return {
    phase,
    roomId,
    mySeat,
    opponentName,
    playerId: playerIdRef.current,
    requeue,
    leaveWait,
  }
}
