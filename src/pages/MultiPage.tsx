// ──────────────────────────────────────────────────────────────
// 3인 대전 화면
// 대기실(모인 친구 + 15초 카운트다운) → 게임 → 결과 → 다시 매칭
// 혼자면 AI 연습, 게임 중 나가면 그 학생만 탈락하고 나머지는 계속
// ──────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../session'
import type { Difficulty } from '../game/types'
import { multiTop } from '../game/multi'
import { GameBoard, type BoardController } from '../components/GameBoard'
import { CardBack } from '../components/CardView'
import { isPvpAvailable } from '../pvp/api'
import { MULTI_WAIT_S, useMultiMatch } from '../pvp/useMultiMatch'
import { useMultiGame } from '../pvp/useMultiGame'
import type { MultiRoom } from '../pvp/multiApi'
import {
  AiFallbackGame,
  Centered,
  HomeButton,
  ResultModal,
  Screen,
  UnoButton,
} from './PvpPage'

/** 3인 대전 정원 — 나중에 4인으로 바꾸려면 이 숫자만 바꾸면 됨 */
export const MULTI_CAPACITY = 3

export function MultiPage() {
  const nav = useNavigate()
  const { session } = useSession()
  if (!session) {
    nav('/')
    return null
  }
  if (!isPvpAvailable) {
    return (
      <Centered>
        <p className="text-slate-300 mb-4">3인 대전은 Supabase 연결이 필요합니다.</p>
        <HomeButton />
      </Centered>
    )
  }
  return (
    <MultiFlow
      name={session.name}
      studentId={session.student?.id ?? null}
      difficulty={session.difficulty}
    />
  )
}

function MultiFlow({
  name,
  studentId,
  difficulty,
}: {
  name: string
  studentId: string | null
  difficulty: Difficulty
}) {
  const m = useMultiMatch(name, studentId, MULTI_CAPACITY)

  if (m.phase === 'error')
    return (
      <Centered>
        <p className="text-red-400 mb-2">3인 대전 서버에 연결하지 못했습니다.</p>
        <p className="text-xs text-slate-500 mb-4">
          (선생님: <code>supabase/pvp_multi_schema.sql</code> 실행 여부를 확인하세요)
        </p>
        <HomeButton />
      </Centered>
    )
  if (m.phase === 'ai') return <AiFallbackGame difficulty={difficulty} onRequeue={m.requeue} />
  if (m.phase === 'playing' && m.roomId && m.playerId)
    return <MultiGame key={m.roomId} roomId={m.roomId} playerId={m.playerId} onRequeue={m.requeue} />
  return <WaitingRoom room={m.room} onLeave={m.leaveWait} />
}

// ── 대기실 ──────────────────────────────────────────────────
function WaitingRoom({ room, onLeave }: { room: MultiRoom | null; onLeave: () => void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  const count = room?.players.length ?? 1
  const elapsed = room ? (now - new Date(room.created_at).getTime()) / 1000 : 0
  const left = Math.max(0, Math.min(MULTI_WAIT_S, Math.ceil(MULTI_WAIT_S - elapsed)))

  return (
    <Centered>
      <div className="w-12 h-12 rounded-full border-4 border-slate-600 border-t-uno-yellow animate-spin mb-5" />
      <p className="font-bold text-lg">
        3인 대전 대기 중… <span className="text-uno-yellow">{count}/{MULTI_CAPACITY}명</span>
      </p>
      <div className="flex gap-2 mt-3 flex-wrap justify-center">
        {Array.from({ length: MULTI_CAPACITY }).map((_, i) => {
          const p = room?.players[i]
          return (
            <span
              key={i}
              className={[
                'px-3 py-1 rounded-full text-sm border',
                p ? 'bg-uno-green/20 border-uno-green text-white' : 'border-slate-600 text-slate-500',
              ].join(' ')}
            >
              {p ? p.name : '빈 자리'}
            </span>
          )
        })}
      </div>
      <p className="text-sm text-slate-400 mt-4">
        {left > 0
          ? `${left}초 안에 다 모이지 않으면, 모인 친구들(2명 이상)과 시작해요`
          : '곧 시작합니다…'}
      </p>
      <p className="text-xs text-slate-500 mt-1">혼자면 AI와 연습 게임을 해요</p>
      <div className="mt-6">
        <HomeButton onBeforeLeave={onLeave} />
      </div>
    </Centered>
  )
}

// ── 게임 ────────────────────────────────────────────────────
function MultiGame({
  roomId,
  playerId,
  onRequeue,
}: {
  roomId: string
  playerId: string
  onRequeue: () => void
}) {
  const nav = useNavigate()
  const [winner, setWinner] = useState<number | null | undefined>(undefined)
  const g = useMultiGame(roomId, playerId, (w) => setWinner(w))
  const st = g.state

  if (!st) {
    return (
      <Centered>
        <div className="w-10 h-10 rounded-full border-4 border-slate-600 border-t-uno-green animate-spin mb-4" />
        <p className="font-bold">
          {g.room?.players.map((p) => p.name).join(' · ') || '친구들'} 매칭됨!
        </p>
        <p className="text-sm text-slate-400 mt-1">게임을 준비하는 중…</p>
        <div className="mt-6">
          <HomeButton onBeforeLeave={g.leave} />
        </div>
      </Centered>
    )
  }

  const n = st.hands.length
  // 내 다음 순서부터 진행 방향대로 상대를 나열
  const order: number[] = []
  for (let k = 1; k < n; k++) order.push((((g.mySeat + st.direction * k) % n) + n) % n)

  const topArea = (
    <section className="px-3 pt-2">
      <div className="flex items-center justify-between text-xs text-slate-500 mb-1 h-6">
        <span>
          진행 방향 {st.direction === 1 ? '↻ 시계' : '↺ 반시계'} · {st.names[st.turn]} 차례
        </span>
        {g.myTurn && g.secondsLeft !== null && (
          <span
            className={[
              'px-2 py-0.5 rounded-full border font-bold',
              g.secondsLeft <= 3
                ? 'bg-uno-red/90 border-red-300 text-white animate-pulse'
                : 'bg-slate-900/90 border-slate-600 text-slate-200',
            ].join(' ')}
          >
            ⏱ {g.secondsLeft}초
          </span>
        )}
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${n - 1}, minmax(0, 1fr))` }}>
        {order.map((seat) => {
          const isTurn = st.turn === seat && st.phase === 'playing'
          const out = st.out[seat]
          const cnt = st.hands[seat].length
          return (
            <div
              key={seat}
              className={[
                'rounded-xl border p-2',
                isTurn ? 'border-uno-red bg-uno-red/10' : 'border-slate-700 bg-slate-800/40',
                out ? 'opacity-40' : '',
              ].join(' ')}
            >
              <div className="flex items-center gap-1 text-sm">
                <span
                  className={[
                    'inline-block w-2 h-2 rounded-full',
                    isTurn ? 'bg-uno-red animate-pulse' : 'bg-slate-600',
                  ].join(' ')}
                />
                <span className="font-bold truncate">{st.names[seat]}</span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {out ? '나감' : `${cnt}장`}
                {!out && cnt === 1 && <span className="ml-1 text-uno-red font-bold">UNO!</span>}
              </div>
              {!out && (
                <div className="flex gap-0.5 mt-1 overflow-hidden h-9">
                  {Array.from({ length: Math.min(cnt, 6) }).map((_, i) => (
                    <div key={i} className="scale-[0.55] origin-top-left -mr-5">
                      <CardBack size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )

  const controller: BoardController = {
    top: multiTop(st),
    currentColor: st.currentColor,
    deckCount: st.deck.length,
    myHand: g.myHand,
    oppCount: 0,
    oppLabel: '',
    oppIsTurn: !g.myTurn,
    myTurn: g.myTurn,
    validIds: g.validIds,
    canDraw: g.canDraw,
    drawnThisTurn: g.drawnThisTurn,
    lastEvent: st.lastEvent,
    onPlay: g.play,
    onPlayMany: g.playMany,
    onDraw: g.draw,
    onPass: g.pass,
    topArea,
  }

  const pendingName = st.unoPending !== null ? st.names[st.unoPending] : ''

  return (
    <Screen title={`${n}인 대전 · ${st.names[g.mySeat] ?? ''}`} onBeforeLeave={winner === undefined ? g.leave : undefined}>
      <GameBoard {...controller} />
      {g.unoActive && winner === undefined && (
        <UnoButton
          label={
            g.unoIsMine
              ? '빨리 외치세요! (늦으면 친구가 외쳐 +1장)'
              : `${pendingName} 1장! 먼저 외치면 ${pendingName} +1장`
          }
          onPress={g.pressUno}
        />
      )}
      {g.iAmOut && winner === undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 rounded-2xl p-8 text-center shadow-2xl max-w-sm w-full">
            <div className="text-5xl mb-3">📴</div>
            <h2 className="text-2xl font-black mb-2">연결이 끊겨 탈락했어요</h2>
            <p className="text-slate-400 mb-5 text-sm">남은 친구들끼리 게임이 계속돼요</p>
            <button
              onClick={onRequeue}
              className="w-full py-3 rounded-xl bg-uno-green hover:bg-green-600 font-bold"
            >
              다시 매칭
            </button>
            <button
              onClick={() => nav('/')}
              className="w-full py-2 mt-2 text-slate-400 hover:text-white text-sm"
            >
              그만두기
            </button>
          </div>
        </div>
      )}
      {winner !== undefined && (
        <ResultModal
          win={winner === g.mySeat}
          subtitle={
            winner === null
              ? '게임 종료'
              : winner === g.mySeat
                ? `${n}인 대전 1등!`
                : `${st.names[winner]} 승리`
          }
          onRequeue={() => {
            setWinner(undefined)
            onRequeue()
          }}
        />
      )}
    </Screen>
  )
}
