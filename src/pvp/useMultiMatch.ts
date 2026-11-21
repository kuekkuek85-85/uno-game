// ──────────────────────────────────────────────────────────────
// 3인 대전 매칭 훅
// 접속 순서대로 방을 채우고, 15초가 지나면 서버가 판정:
//   2명 이상 → 그 인원으로 시작 / 혼자 → AI 연습
// 판정은 서버 RPC(pvp_multi_tick)가 원자적으로 하므로 학생 기기 시계와 무관하다.
// ──────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { backToPool, isPvpAvailable, joinPool } from './api'
import {
  getMultiRoom,
  multiHeartbeat as heartbeat,
  multiJoin,
  multiLeaveWait,
  multiTick,
  subscribeMultiRoom,
  type MultiRoom,
} from './multiApi'

const POLL_MS = 1500
export const MULTI_WAIT_S = 15

export type MultiPhase = 'connecting' | 'waiting' | 'playing' | 'ai' | 'error'

export function useMultiMatch(name: string, studentId: string | null, capacity: number) {
  const [phase, setPhase] = useState<MultiPhase>('connecting')
  const [room, setRoom] = useState<MultiRoom | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const pidRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const unsubRef = useRef<() => void>(() => {})

  const stop = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
    unsubRef.current()
    unsubRef.current = () => {}
  }

  const join = useCallback(async () => {
    const pid = pidRef.current
    if (!pid) return
    stop()
    setPhase('connecting')
    setRoom(null)
    await heartbeat(pid) // 입장 직전 서버 시계로 갱신(대기 방 정리에서 잘못 빠지지 않게)
    const res = await multiJoin(pid, capacity)
    if (!res) {
      setPhase('error')
      return
    }
    setRoomId(res.room_id)
    if (res.status === 'active') {
      setPhase('playing')
      return
    }
    setPhase('waiting')

    let decided = false
    const decide = (p: MultiPhase) => {
      if (decided) return
      decided = true
      stop()
      setPhase(p)
    }
    unsubRef.current = subscribeMultiRoom(res.room_id, (r) => {
      setRoom(r)
      if (r.status === 'active') decide('playing')
    })
    pollRef.current = setInterval(async () => {
      if (decided) return
      heartbeat(pid)
      const r = await getMultiRoom(res.room_id)
      if (decided) return
      if (r) {
        setRoom(r)
        if (r.status === 'active') return decide('playing')
      }
      const t = await multiTick(res.room_id, pid)
      if (decided) return
      if (t === 'active') decide('playing')
      else if (t === 'ai') decide('ai')
      else if (t === 'gone' || t === 'abandoned') {
        // 대기 방에서 빠졌음(연결 지연 등) → 다시 입장
        decided = true
        stop()
        setTimeout(() => join(), 0)
      }
    }, POLL_MS)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capacity])

  useEffect(() => {
    let alive = true
    if (!isPvpAvailable) {
      setPhase('error')
      return
    }
    joinPool(name, studentId).then((pid) => {
      if (!alive) return
      if (!pid) {
        setPhase('error')
        return
      }
      pidRef.current = pid
      setPlayerId(pid)
      join()
    })
    return () => {
      alive = false
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 게임/AI 연습이 끝난 뒤 다시 매칭 */
  const requeue = useCallback(async () => {
    const pid = pidRef.current
    if (!pid) return
    await backToPool(pid)
    await join()
  }, [join])

  /** 대기 중 나가기 */
  const leaveWait = useCallback(() => {
    const pid = pidRef.current
    stop()
    if (pid && roomId && phase === 'waiting') multiLeaveWait(roomId, pid)
  }, [roomId, phase])

  return { phase, room, roomId, playerId, requeue, leaveWait }
}
