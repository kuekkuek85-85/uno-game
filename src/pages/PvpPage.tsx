// ──────────────────────────────────────────────────────────────
// 친구와 대전(PvP) 화면 — 설계: docs/pvp-spec.md
// 접속 순서 매칭 / 짝이 올 때까지 대기(스스로 나갈 수 있음) / 종료 후 재매칭
// ──────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../session'
import { topCard } from '../game/engine'
import { GameBoard, type BoardController } from '../components/GameBoard'
import { usePvpMatch } from '../pvp/usePvpMatch'
import { usePvpGame, type PvpResult } from '../pvp/usePvpGame'
import { isPvpAvailable } from '../pvp/api'
import { pvpEventText } from '../pvp/eventText'
import type { Seat } from '../pvp/types'

export function PvpPage() {
  const nav = useNavigate()
  const { session } = useSession()

  if (!session) {
    nav('/')
    return null
  }
  if (!isPvpAvailable) {
    return (
      <Centered>
        <p className="text-slate-300 mb-3">
          친구와 대전은 Supabase 연결이 필요합니다.
        </p>
        <p className="text-sm text-slate-500 mb-4">
          <code>supabase/pvp_schema.sql</code> 실행 + <code>.env</code> 설정 후
          이용할 수 있어요.
        </p>
        <HomeButton />
      </Centered>
    )
  }

  return (
    <PvpFlow
      name={session.name}
      studentId={session.student?.id ?? null}
    />
  )
}

function PvpFlow({ name, studentId }: { name: string; studentId: string | null }) {
  const { phase, roomId, mySeat, opponentName, playerId, requeue, leaveWait } = usePvpMatch(
    name,
    studentId,
  )

  if (phase === 'error')
    return (
      <Centered>
        <p className="text-red-400 mb-4">매칭 서버에 연결하지 못했습니다.</p>
        <HomeButton />
      </Centered>
    )

  if (phase === 'connecting' || phase === 'searching')
    return <Waiting searching={phase === 'searching'} onLeave={leaveWait} />

  if (phase === 'matched' && roomId && playerId)
    return (
      <PvpActiveGame
        roomId={roomId}
        mySeat={mySeat}
        playerId={playerId}
        opponentName={opponentName}
        onRequeue={requeue}
      />
    )

  return <Waiting searching onLeave={leaveWait} />
}

// ── 대기 화면 ───────────────────────────────────────────────
// 시간 제한 없이 짝이 올 때까지 기다린다. 그만두고 싶으면 스스로 나간다.
function Waiting({ searching, onLeave }: { searching: boolean; onLeave: () => void }) {
  return (
    <Centered>
      <div className="w-12 h-12 rounded-full border-4 border-slate-600 border-t-uno-red animate-spin mb-5" />
      <p className="font-bold text-lg">친구를 기다리는 중…</p>
      <p className="text-sm text-slate-400 mt-1">
        {searching ? '친구가 들어오면 바로 시작해요' : '연결 중…'}
      </p>
      <div className="mt-6">
        <HomeButton onBeforeLeave={onLeave} label="대기 그만하기" />
      </div>
    </Centered>
  )
}

// ── PvP 실제 게임 ───────────────────────────────────────────
function PvpActiveGame({
  roomId,
  mySeat,
  playerId,
  opponentName,
  onRequeue,
}: {
  roomId: string
  mySeat: Seat
  playerId: string
  opponentName: string
  onRequeue: () => void
}) {
  const [result, setResult] = useState<{ win: boolean; abandoned: boolean } | null>(
    null,
  )
  const onEnd = (r: PvpResult) =>
    setResult({ win: r.winnerSeat === mySeat, abandoned: r.abandoned })
  const pg = usePvpGame(roomId, mySeat, playerId, onEnd)

  // 게임이 끝나지 않았는데 나가면 기권(상대 부전승) 처리
  const leaveIfPlaying = () => {
    if (!result) pg.leave()
  }

  if (!pg.state) {
    return (
      <Centered>
        <div className="w-10 h-10 rounded-full border-4 border-slate-600 border-t-uno-green animate-spin mb-4" />
        <p className="font-bold">
          <span className="text-uno-green">{opponentName}</span> 님과 매칭됨!
        </p>
        <p className="text-sm text-slate-400 mt-1">게임을 준비하는 중…</p>
        <div className="mt-6">
          <HomeButton onBeforeLeave={leaveIfPlaying} />
        </div>
      </Centered>
    )
  }

  const controller: BoardController = {
    top: topCard(pg.state),
    currentColor: pg.state.currentColor,
    deckCount: pg.state.deck.length,
    myHand: pg.myHand,
    oppCount: pg.oppHandCount,
    oppLabel: opponentName,
    oppIsTurn: !pg.myTurn,
    myTurn: pg.myTurn,
    validIds: pg.validIds,
    canDraw: pg.canDraw,
    drawnThisTurn: pg.drawnThisTurn,
    lastEvent: pvpEventText(pg.state, mySeat, opponentName),
    onPlay: pg.play,
    onPlayMany: pg.playMany,
    onDraw: pg.draw,
    onPass: pg.pass,
  }

  return (
    <Screen title={`vs ${opponentName}`} onBeforeLeave={leaveIfPlaying}>
      {pg.myTurn && pg.secondsLeft !== null && (
        <div
          className={[
            'fixed top-14 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full border text-sm font-bold',
            pg.secondsLeft <= 3
              ? 'bg-uno-red/90 border-red-300 text-white animate-pulse'
              : 'bg-slate-900/90 border-slate-600 text-slate-200',
          ].join(' ')}
        >
          ⏱ {pg.secondsLeft}초 안에 내기
        </div>
      )}
      <GameBoard {...controller} />
      {pg.unoActive && (
        <UnoButton
          label={
            pg.unoIsMine
              ? '빨리 외치세요! (늦으면 상대가 외쳐 +1장)'
              : `${opponentName}님이 1장! 먼저 외치면 상대 +1장`
          }
          onPress={pg.pressUno}
        />
      )}
      {result && (
        <ResultModal
          win={result.win}
          subtitle={
            result.abandoned
              ? result.win
                ? '상대가 나가서 승리'
                : '연결 종료'
              : `vs ${opponentName}`
          }
          onRequeue={() => {
            setResult(null)
            onRequeue()
          }}
        />
      )}
    </Screen>
  )
}

// ── 공용 작은 컴포넌트들 ────────────────────────────────────
export function Screen({
  title,
  children,
  onBeforeLeave,
}: {
  title: string
  children: React.ReactNode
  onBeforeLeave?: () => void
}) {
  const nav = useNavigate()
  return (
    <div className="min-h-full flex flex-col max-w-3xl mx-auto w-full">
      <header className="flex items-center justify-between px-4 py-3 text-sm">
        <button
          onClick={() => {
            onBeforeLeave?.()
            nav('/')
          }}
          className="text-slate-400 hover:text-white"
        >
          ← 나가기
        </button>
        <span className="font-bold text-slate-200">{title}</span>
        <span className="text-slate-600 w-10" />
      </header>
      {children}
    </div>
  )
}

export function ResultModal({
  win,
  subtitle,
  onRequeue,
}: {
  win: boolean
  subtitle: string
  onRequeue: () => void
}) {
  const nav = useNavigate()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-800 rounded-2xl p-8 text-center shadow-2xl animate-slide-up max-w-sm w-full">
        <div className="text-6xl mb-3">{win ? '🎉' : '😢'}</div>
        <h2 className="text-3xl font-black mb-1">{win ? '승리!' : '패배'}</h2>
        <p className="text-slate-400 mb-5">{subtitle}</p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onRequeue}
            className="w-full py-3 rounded-xl bg-uno-green hover:bg-green-600 font-bold"
          >
            다시 매칭 (새 상대)
          </button>
          <button
            onClick={() => nav('/')}
            className="w-full py-2 text-slate-400 hover:text-white text-sm"
          >
            그만두기
          </button>
        </div>
      </div>
    </div>
  )
}

export function UnoButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <div className="fixed inset-x-0 bottom-28 z-40 flex flex-col items-center gap-1 pointer-events-none">
      <button
        onClick={onPress}
        className="pointer-events-auto px-10 py-4 rounded-full bg-uno-red hover:bg-red-600 text-white text-2xl font-black shadow-2xl ring-4 ring-white/70 animate-pulse"
      >
        우노!
      </button>
      <span className="text-xs text-slate-200 bg-slate-900/80 px-2 py-0.5 rounded-full pointer-events-none">
        {label}
      </span>
    </div>
  )
}

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center p-6 text-center">
      {children}
    </div>
  )
}

export function HomeButton({
  onBeforeLeave,
  label = '처음으로',
}: {
  onBeforeLeave?: () => void
  label?: string
}) {
  const nav = useNavigate()
  return (
    <button
      onClick={() => {
        onBeforeLeave?.()
        nav('/')
      }}
      className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
    >
      ← {label}
    </button>
  )
}
