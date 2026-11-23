// ──────────────────────────────────────────────────────────────
// 3인 대전 매칭 훅
// 접속 순서대로 방을 채운다. 시간 제한·AI 전환 없이 친구가 올 때까지 기다리고,
// 학생이 스스로 "대기 그만하기"로 나갈 수 있다.
//   3명이 차면 바로 시작 / 2명이 모인 뒤 15초 동안 3번째가 없으면 2명으로 시작
// 시작 판정은 서버 RPC(pvp_multi_tick)가 원자적으로 한다.
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

export type MultiPhase = 'connecting' | 'waiting' | 'playing' | 'error'

export function useMultiMatch(name: string, studentId: string | null, capacity: number) {
  const [phase, setPhase] = useState<MultiPhase>('connecting')
  const [room, setRoom] = useState<MultiRoom | null>(null)
  const [roomId, setRoomId] = useState<string | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  /** 2명 이상 모인 것을 처음 본 시각(이때부터 15초 카운트다운) */
  const [pairedAt, setPairedAt] = useState<number | null>(null)
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
    setPairedAt(null)
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
    let paired: number | null = null // 2명 이상 모인 시각(내 기기 기준 경과 시간만 사용)
    const decide = () => {
      if (decided) return
      decided = true
      stop()
      setPhase('playing')
    }
    // 대기 방이 정리됐거나(오래 대기·연결 지연) 내가 빠졌으면 조용히 다시 줄을 선다
    const rejoin = () => {
      if (decided) return
      decided = true
      stop()
      setTimeout(() => join(), 0)
    }
    const observe = (r: MultiRoom) => {
      setRoom(r)
      if (r.players.length >= 2) {
        if (paired === null) {
          paired = Date.now()
          setPairedAt(paired)
        }
      } else if (paired !== null) {
        paired = null
        setPairedAt(null)
      }
    }
    unsubRef.current = subscribeMultiRoom(res.room_id, (r) => {
      if (decided) return
      observe(r)
      if (r.status === 'active') decide()
    })
    pollRef.current = setInterval(async () => {
      if (decided) return
      heartbeat(pid)
      const r = await getMultiRoom(res.room_id)
      if (decided || !r) return
      observe(r)
      if (r.status === 'active') return decide()
      if (r.status !== 'waiting' || !r.players.some((p) => p.id === pid)) return rejoin()
      // 혼자일 때는 판정하지 않고 계속 기다린다(AI 전환 없음)
      if (paired === null || Date.now() - paired < MULTI_WAIT_S * 1000) return
      const t = await multiTick(res.room_id, pid)
      if (decided) return
      if (t === 'active') decide()
      // 판정 순간 다른 친구가 끊겨 혼자 남았으면 서버가 방을 닫는다('ai') → 다시 줄 서기
      else if (t && t !== 'waiting') rejoin()
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

  /** 게임이 끝난 뒤 다시 매칭 */
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

  return { phase, room, roomId, playerId, pairedAt, requeue, leaveWait }
}
