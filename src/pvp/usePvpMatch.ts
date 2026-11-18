// ──────────────────────────────────────────────────────────────
// PvP 매칭 훅
// 접속 순서 매칭(FIFO), 10초 내 짝 없으면 AI 폴백, 종료 후 재매칭.
// ──────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import {
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

const AI_FALLBACK_MS = 10000
const SEARCH_POLL_MS = 1500

export type MatchPhase = 'connecting' | 'searching' | 'matched' | 'ai' | 'error'

export function usePvpMatch(name: string, studentId: string | null) {
  const [phase, setPhase] = useState<MatchPhase>('connecting')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [mySeat, setMySeat] = useState<Seat>('host')
  const [opponentName, setOpponentName] = useState<string>('상대')
  const playerIdRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const unsubRef = useRef<() => void>(() => {})

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
    setPhase('connecting')
    const res = await requestMatch(pid)
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
    // host로 대기
    setMySeat('host')
    setPhase('searching')
    // 이번 대기에서 결과(매칭/AI)는 딱 한 번만 결정 — 겹친 폴링·실시간 이벤트가 두 번 전환하지 않게
    let decided = false
    const matched = (name: string) => {
      if (decided) return
      decided = true
      clearSearch()
      setOpponentName(name)
      setPhase('matched')
    }
    // guest 입장 감지(Realtime)
    unsubRef.current = subscribeRoom(res.room_id, (r) => {
      if (r.status === 'active') matched(r.guest_name ?? '상대')
    })
    // 폴백: 1.5초마다 방 확인 + 하트비트(Realtime가 느리거나 끊겨도 매칭을 잡음)
    let elapsed = 0
    pollRef.current = setInterval(async () => {
      if (decided) return
      elapsed += SEARCH_POLL_MS
      heartbeat(pid)
      const r = await getRoom(res.room_id)
      if (decided) return
      if (r && r.status === 'active') {
        matched(r.guest_name ?? '상대')
        return
      }
      if (elapsed >= AI_FALLBACK_MS) {
        decided = true
        clearSearch()
        // 원자적 취소: 정말 아무도 안 왔을 때만 AI로
        const cancelled = await cancelWaitingRoom(res.room_id, pid)
        if (cancelled) {
          setPhase('ai')
          return
        }
        // 취소 직전에 누가 입장함(이미 active) → AI로 가지 않고 그 친구와 PvP 시작
        const r2 = await getRoom(res.room_id)
        if (r2 && r2.status === 'active') {
          setOpponentName(r2.guest_name ?? '상대')
          setPhase('matched')
        } else {
          setPhase('ai')
        }
      }
    }, SEARCH_POLL_MS)
  }, [])

  // 최초 입장
  useEffect(() => {
    let active = true
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
      clearSearch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 재매칭(게임/AI 끝난 뒤 풀 복귀)
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
  }
}
