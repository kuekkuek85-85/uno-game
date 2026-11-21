// ──────────────────────────────────────────────────────────────
// 공용 게임 보드(프레젠테이션) — PvP와 AI 폴백이 함께 사용
// 카드 선택(같은 숫자 여러 장), 와일드 색 선택, 뽑기/패스 UI 포함.
// 우노 외치기 등 모드별 요소는 바깥(부모)에서 오버레이한다.
// ──────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import type { Card, PlayColor } from '../game/types'
import { colorKo } from '../game/engine'
import { CardView, CardBack } from './CardView'
import { ColorPicker } from './ColorPicker'

const COLOR_DOT: Record<PlayColor, string> = {
  red: 'bg-uno-red',
  yellow: 'bg-uno-yellow',
  green: 'bg-uno-green',
  blue: 'bg-uno-blue',
}

export type BoardController = {
  top: Card
  currentColor: PlayColor
  deckCount: number
  myHand: Card[]
  oppCount: number
  oppLabel: string
  oppIsTurn: boolean
  myTurn: boolean
  validIds: Set<string>
  canDraw: boolean
  drawnThisTurn: boolean
  lastEvent?: string
  onPlay: (cardId: string, chosenColor?: PlayColor) => void
  onPlayMany: (cardIds: string[]) => void
  onDraw: () => void
  onPass: () => void
  /** (선택) 상대 영역을 직접 그릴 때 — 다인원 대전용. 없으면 1:1 상대 표시 */
  topArea?: React.ReactNode
}

export function GameBoard(c: BoardController) {
  const [pendingWild, setPendingWild] = useState<Card | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // 내 차례가 아니게 되면 선택/팝업 해제
  useEffect(() => {
    if (!c.myTurn) {
      setSelectedIds([])
      setPendingWild(null)
    }
  }, [c.myTurn])

  const selectedValue =
    selectedIds.length > 0
      ? c.myHand.find((x) => x.id === selectedIds[0])?.value
      : undefined

  const onCardClick = (card: Card) => {
    if (!c.myTurn) return
    if (selectedIds.length > 0) {
      if (selectedIds.includes(card.id)) {
        setSelectedIds((ids) => ids.filter((id) => id !== card.id))
      } else if (card.kind === 'number' && card.value === selectedValue) {
        setSelectedIds((ids) => [...ids, card.id])
      }
      return
    }
    if (!c.validIds.has(card.id)) return
    if (card.color === 'wild') setPendingWild(card)
    else if (card.kind === 'number') setSelectedIds([card.id])
    else c.onPlay(card.id)
  }

  const playSelected = () => {
    if (selectedIds.length === 0) return
    if (selectedIds.length === 1) c.onPlay(selectedIds[0])
    else c.onPlayMany(selectedIds)
    setSelectedIds([])
  }

  return (
    <>
      {/* 상대 손패 */}
      {c.topArea ?? (
      <section className="px-4 pt-2">
        <div className="flex items-center gap-2 mb-1">
          <span
            className={[
              'inline-block w-2 h-2 rounded-full',
              c.oppIsTurn ? 'bg-uno-red animate-pulse' : 'bg-slate-600',
            ].join(' ')}
          />
          <span className="text-sm text-slate-400">
            {c.oppLabel} 손패 {c.oppCount}장
            {c.oppCount === 1 && <span className="ml-2 text-uno-red font-bold">UNO!</span>}
          </span>
        </div>
        <div className="flex gap-1 overflow-hidden h-16">
          {Array.from({ length: Math.min(c.oppCount, 12) }).map((_, i) => (
            <CardBack key={i} size="sm" />
          ))}
          {c.oppCount > 12 && (
            <span className="self-center text-slate-500 text-sm ml-1">
              +{c.oppCount - 12}
            </span>
          )}
        </div>
      </section>
      )}

      {/* 중앙 */}
      <section className="flex-1 flex items-center justify-center gap-8 py-4">
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-slate-500">버린 더미</span>
          <CardView card={c.top} size="lg" />
          <div className="flex items-center gap-1 text-sm">
            <span className="text-slate-500">현재 색</span>
            <span className={`w-4 h-4 rounded-full ${COLOR_DOT[c.currentColor]}`} />
            <span className="font-bold">{colorKo(c.currentColor)}</span>
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-slate-500">뽑기 더미 ({c.deckCount})</span>
          <CardBack size="lg" onClick={c.canDraw ? c.onDraw : undefined} />
          {c.canDraw && <span className="text-xs text-uno-blue">눌러서 뽑기</span>}
        </div>
      </section>

      {/* 상태 메시지 */}
      <div className="px-4 text-center h-6 text-sm text-slate-300">{c.lastEvent}</div>

      {/* 선택 바 */}
      {c.myTurn && selectedIds.length > 0 && (
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

      {/* 패스 */}
      {c.myTurn && c.drawnThisTurn && selectedIds.length === 0 && (
        <div className="px-4 pb-1 text-center">
          <button
            onClick={c.onPass}
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
            내 손패 {c.myHand.length}장
            {c.myHand.length === 1 && (
              <span className="ml-2 text-uno-green font-bold">UNO!</span>
            )}
          </span>
          <span
            className={[
              'text-xs px-2 py-0.5 rounded-full',
              c.myTurn ? 'bg-uno-green/20 text-uno-green' : 'bg-slate-700 text-slate-400',
            ].join(' ')}
          >
            {c.myTurn ? '내 차례' : '상대 차례'}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 justify-center">
          {c.myHand.map((card) => {
            const isSelected = selectedIds.includes(card.id)
            const inSelection = selectedIds.length > 0
            let highlight = false
            let clickable = false
            if (c.myTurn) {
              if (inSelection) {
                if (isSelected) clickable = true
                else if (card.kind === 'number' && card.value === selectedValue) {
                  highlight = true
                  clickable = true
                }
              } else if (c.validIds.has(card.id)) {
                highlight = true
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
                onClick={() => onCardClick(card)}
              />
            )
          })}
        </div>
      </section>

      {/* 와일드 색 선택 */}
      {pendingWild && (
        <ColorPicker
          onPick={(col) => {
            c.onPlay(pendingWild.id, col)
            setPendingWild(null)
          }}
          onCancel={() => setPendingWild(null)}
        />
      )}
    </>
  )
}
