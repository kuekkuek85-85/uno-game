// ──────────────────────────────────────────────────────────────
// PvP 매칭 훅
// 접속 순서 매칭(FIFO), 10초 내 짝 없으면 AI 폴백, 종료 후 재매칭.
// ──────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  backToPool,
  cancelWaitingRoom,
  getRoom,
  isPvpAvailable,
  joinPool,
  requestMatch,
  subscribeRoom,
} from './api'
import type { Seat } from './types'

const AI_FALLBACK_MS = 10000

export type MatchPhase = 'connecting' | 'searching' | 'matched' | 'ai' | 'error'

export function usePvpMatch(name: string, studentId: string | null) {
  const [phase, setPhase] = useState<MatchPhase>('connecting')
  const [roomId, setRoomId] = useState<string | null>(null)
  const [mySeat, setMySeat] = useState<Seat>('host')
  const [opponentName, setOpponentName] = useState<string>('상대')
  const playerIdRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unsubRef = useRef<() => void>(() => {})

  const clearSearch = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
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
    // guest 입장 감지
    unsubRef.current = subscribeRoom(res.room_id, (r) => {
      if (r.status === 'active') {
        clearSearch()
        setOpponentName(r.guest_name ?? '상대')
        setPhase('matched')
      }
    })
    // 10초 내 짝 없으면 AI 폴백
    timerRef.current = setTimeout(async () => {
      const r = await getRoom(res.room_id)
      if (r && r.status === 'active') {
        clearSearch()
        setOpponentName(r.guest_name ?? '상대')
        setPhase('matched')
        return
      }
      clearSearch()
      await cancelWaitingRoom(res.room_id, pid)
      setPhase('ai')
    }, AI_FALLBACK_MS)
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
