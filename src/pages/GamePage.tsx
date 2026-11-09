// ──────────────────────────────────────────────────────────────
// 게임 화면 (스펙 6장 #2)
// 상단: AI 손패(뒷면) / 중앙: 버린 더미 top + 현재 색 + 뽑기 더미 / 하단: 내 손패
// ──────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Card, PlayColor } from '../game/types'
import { DIFFICULTY_LABEL } from '../game/types'
import { colorKo, topCard } from '../game/engine'
import { useGame } from '../hooks/useGame'
import { useSession } from '../session'
import { recordMatch, isSupabaseConfigured } from '../lib/supabase'
import { CardView, CardBack } from '../components/CardView'
import { ColorPicker } from '../components/ColorPicker'

const COLOR_DOT: Record<PlayColor, string> = {
  red: 'bg-uno-red',
  yellow: 'bg-uno-yellow',
  green: 'bg-uno-green',
  blue: 'bg-uno-blue',
}

export function GamePage() {
  const nav = useNavigate()
  const { session } = useSession()

  // 세션 없으면 입장 화면으로
  useEffect(() => {
    if (!session) nav('/')
  }, [session, nav])

  const [result, setResult] = useState<'win' | 'lose' | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'skipped'>('idle')
  const difficulty = session?.difficulty ?? 'easy'

  const onEnd = useCallback(
    (r: 'win' | 'lose') => setResult(r),
    [],
  )

  const {
    state,
    validIds,
    canDraw,
    drawnThisTurn,
    playPlayerCard,
    playPlayerCards,
    drawPlayerCard,
    passPlayerTurn,
    restart,
  } = useGame(difficulty, onEnd)

  // 와일드 색 선택 팝업
  const [pendingWild, setPendingWild] = useState<Card | null>(null)

  // 같은 숫자 여러 장 선택 상태(선택된 카드 id 목록)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // 내 턴이 아니게 되거나 게임이 끝나면 선택 해제
  useEffect(() => {
    if (state.turn !== 'player' || state.phase !== 'playing') setSelectedIds([])
  }, [state.turn, state.phase])

  // 선택된 숫자(첫 선택 카드의 value)
  const selectedValue =
    selectedIds.length > 0
      ? state.playerHand.find((c) => c.id === selectedIds[0])?.value
      : undefined

  // 경기 결과 저장 (한 번만)
  const savedRef = useRef(false)
  useEffect(() => {
    if (!result || savedRef.current) return
    savedRef.current = true
    if (!session?.student || !isSupabaseConfigured) {
      setSaveState('skipped')
      return
    }
    setSaveState('saving')
    recordMatch({
      student_id: session.student.id,
      difficulty,
      result: result === 'win' ? 'win' : 'lose',
      turns: state.turns,
    }).then((ok) => setSaveState(ok ? 'saved' : 'skipped'))
  }, [result, session, difficulty, state.turns])

  if (!session) return null

  const handlePlayerCardClick = (card: Card) => {
    if (state.turn !== 'player' || state.phase !== 'playing') return

    // 이미 선택(여러 장 모으기) 중일 때
    if (selectedIds.length > 0) {
      if (selectedIds.includes(card.id)) {
        // 선택 해제(토글)
        setSelectedIds((ids) => ids.filter((id) => id !== card.id))
      } else if (card.kind === 'number' && card.value === selectedValue) {
        // 같은 숫자면 추가
        setSelectedIds((ids) => [...ids, card.id])
      }
      // 다른 숫자/액션/와일드는 무시
      return
    }

    // 선택이 없을 때(첫 클릭) — 낼 수 있는 카드만
    if (!validIds.has(card.id)) return
    if (card.color === 'wild') {
      setPendingWild(card)
    } else if (card.kind === 'number') {
      // 숫자 카드는 바로 내지 않고 "선택" → 같은 숫자를 더 모을 수 있음
      setSelectedIds([card.id])
    } else {
      // 액션 카드(Skip/Reverse/+2)는 즉시 내기
      playPlayerCard(card.id)
    }
  }

  // 선택한 카드(들) 내기
  const playSelected = () => {
    if (selectedIds.length === 0) return
    if (selectedIds.length === 1) playPlayerCard(selectedIds[0])
    else playPlayerCards(selectedIds)
    setSelectedIds([])
  }

  const handleColorPick = (c: PlayColor) => {
    if (pendingWild) {
      playPlayerCard(pendingWild.id, c)
      setPendingWild(null)
    }
  }

  const doRestart = () => {
    savedRef.current = false
    setResult(null)
    setSaveState('idle')
    restart()
  }

  const top = topCard(state)
  const isPlayerTurn = state.turn === 'player' && state.phase === 'playing'

  return (
    <div className="min-h-full flex flex-col max-w-3xl mx-auto w-full">
      {/* 헤더 */}
      <header className="flex items-center justify-between px-4 py-3 text-sm">
        <button onClick={() => nav('/')} className="text-slate-400 hover:text-white">
          ← 나가기
        </button>
        <div className="text-slate-300">
          <span className="font-bold">{session.name}</span>
          <span className="text-slate-500"> · 난이도 </span>
          <span className="font-bold text-uno-yellow">
            {DIFFICULTY_LABEL[difficulty]}
          </span>
        </div>
        <div className="text-slate-500">{state.turns}턴</div>
      </header>

      {/* AI 손패 (뒷면, 장수만) */}
      <section className="px-4 pt-2">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={[
              'inline-block w-2 h-2 rounded-full',
              state.turn === 'ai' && state.phase === 'playing'
                ? 'bg-uno-red animate-pulse'
                : 'bg-slate-600',
            ].join(' ')}
          />
          <span className="text-sm text-slate-400">
            AI 손패 {state.aiHand.length}장
            {state.aiHand.length === 1 && (
              <span className="ml-2 text-uno-red font-bold">UNO!</span>
            )}
          </span>
        </div>
        <div className="flex gap-1 overflow-hidden h-16">
          {state.aiHand.slice(0, 12).map((c) => (
            <CardBack key={c.id} size="sm" />
          ))}
          {state.aiHand.length > 12 && (
            <span className="self-center text-slate-500 text-sm ml-1">
              +{state.aiHand.length - 12}
            </span>
          )}
        </div>
      </section>

      {/* 중앙: 버린 더미 + 현재 색 + 뽑기 더미 */}
      <section className="flex-1 flex items-center justify-center gap-8 py-4">
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-slate-500">버린 더미</span>
          <CardView card={top} size="lg" />
          <div className="flex items-center gap-1 text-sm">
            <span className="text-slate-500">현재 색</span>
            <span className={`w-4 h-4 rounded-full ${COLOR_DOT[state.currentColor]}`} />
            <span className="font-bold">{colorKo(state.currentColor)}</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-slate-500">뽑기 더미 ({state.deck.length})</span>
          <CardBack
            size="lg"
            onClick={
              canDraw
                ? () => {
                    setSelectedIds([])
                    drawPlayerCard()
                  }
                : undefined
            }
          />
          {canDraw && <span className="text-xs text-uno-blue">눌러서 뽑기</span>}
        </div>
      </section>

      {/* 상태 메시지 */}
      <div className="px-4 text-center h-6 text-sm text-slate-300">
        {state.lastEvent}
      </div>

      {/* 선택한 카드 내기 바 (같은 숫자 여러 장) */}
      {isPlayerTurn && selectedIds.length > 0 && (
        <div className="px-4 pb-1 flex items-center justify-center gap-2">
          <span className="text-sm text-slate-300">
            숫자 <b className="text-white">{selectedValue}</b> · {selectedIds.length}장 선택
          </span>
          <button
            onClick={playSelected}
            className="px-4 py-1.5 rounded-lg bg-uno-green hover:bg-green-600 text-sm font-bold"
          >
            내기 ({selectedIds.length})
          </button>
          <button
            onClick={() => setSelectedIds([])}
            className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
          >
            취소
          </button>
        </div>
      )}

      {/* 뽑은 뒤 패스 버튼 */}
      {isPlayerTurn && drawnThisTurn && selectedIds.length === 0 && (
        <div className="px-4 pb-1 text-center">
          <button
            onClick={passPlayerTurn}
            className="px-4 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
          >
            패스 (턴 넘기기)
          </button>
        </div>
      )}

      {/* 내 손패 */}
      <section className="px-2 pb-6 pt-2">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-sm text-slate-400">
            내 손패 {state.playerHand.length}장
            {state.playerHand.length === 1 && (
              <span className="ml-2 text-uno-green font-bold">UNO!</span>
            )}
          </span>
          <span
            className={[
              'text-xs px-2 py-0.5 rounded-full',
              isPlayerTurn ? 'bg-uno-green/20 text-uno-green' : 'bg-slate-700 text-slate-400',
            ].join(' ')}
          >
            {isPlayerTurn ? '내 차례' : 'AI 차례'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 justify-center">
          {state.playerHand.map((card) => {
            const isSelected = selectedIds.includes(card.id)
            const inSelection = selectedIds.length > 0

            let highlight = false
            let clickable = false
            if (isPlayerTurn) {
              if (inSelection) {
                if (isSelected) {
                  clickable = true // 눌러서 선택 해제
                } else if (card.kind === 'number' && card.value === selectedValue) {
                  highlight = true // 같은 숫자 → 추가 가능
                  clickable = true
                }
              } else if (validIds.has(card.id)) {
                highlight = true // 낼 수 있는 카드
                clickable = true
              }
            }

            return (
              <CardView
                key={card.id}
                card={card}
                size="md"
                selected={isSelected}
                highlight={highlight}
                disabled={!clickable}
                onClick={() => handlePlayerCardClick(card)}
              />
            )
          })}
        </div>
      </section>

      {/* 와일드 색 선택 */}
      {pendingWild && (
        <ColorPicker onPick={handleColorPick} onCancel={() => setPendingWild(null)} />
      )}

      {/* 승/패 모달 */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-800 rounded-2xl p-8 text-center shadow-2xl animate-slide-up max-w-sm w-full">
            <div className="text-6xl mb-3">{result === 'win' ? '🎉' : '😢'}</div>
            <h2 className="text-3xl font-black mb-1">
              {result === 'win' ? '승리!' : '패배'}
            </h2>
            <p className="text-slate-400 mb-1">
              난이도 {DIFFICULTY_LABEL[difficulty]} · {state.turns}턴
            </p>
            <p className="text-xs text-slate-500 mb-5">
              {saveState === 'saving' && '결과 저장 중…'}
              {saveState === 'saved' && '✅ 결과가 기록되었습니다.'}
              {saveState === 'skipped' &&
                (isSupabaseConfigured ? '기록을 건너뛰었습니다.' : '연습 모드(미저장)')}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={doRestart}
                className="w-full py-3 rounded-xl bg-uno-red hover:bg-red-600 font-bold"
              >
                다시하기
              </button>
              <button
                onClick={() => nav('/leaderboard')}
                className="w-full py-3 rounded-xl bg-slate-700 hover:bg-slate-600 font-bold"
              >
                순위 보기
              </button>
              <button
                onClick={() => nav('/')}
                className="w-full py-2 text-slate-400 hover:text-white text-sm"
              >
                처음으로
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
