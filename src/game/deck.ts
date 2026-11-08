// ──────────────────────────────────────────────────────────────
// 덱 생성 · 셔플 · 분배
// 스펙 3장(덱 구성 108장) 기반
// ──────────────────────────────────────────────────────────────

import type { Card, PlayColor } from './types'
import { PLAY_COLORS } from './types'

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

/**
 * 표준 UNO 108장 덱 생성
 * - 색상 4종(red/yellow/green/blue)
 *   - 숫자 0: 색당 1장 / 숫자 1~9: 색당 2장
 *   - Skip, Reverse, Draw Two: 색당 2장씩
 * - 와일드 4장, 와일드 Draw Four 4장
 */
export function createDeck(): Card[] {
  const deck: Card[] = []

  for (const color of PLAY_COLORS) {
    // 숫자 0: 1장
    deck.push({ id: nextId('n'), color, kind: 'number', value: 0 })
    // 숫자 1~9: 2장씩
    for (let v = 1; v <= 9; v++) {
      deck.push({ id: nextId('n'), color, kind: 'number', value: v })
      deck.push({ id: nextId('n'), color, kind: 'number', value: v })
    }
    // 액션 카드: 색당 2장씩
    for (let i = 0; i < 2; i++) {
      deck.push({ id: nextId('a'), color, kind: 'skip' })
      deck.push({ id: nextId('a'), color, kind: 'reverse' })
      deck.push({ id: nextId('a'), color, kind: 'draw2' })
    }
  }

  // 와일드 4장, 와일드 Draw Four 4장
  for (let i = 0; i < 4; i++) {
    deck.push({ id: nextId('w'), color: 'wild', kind: 'wild' })
    deck.push({ id: nextId('w'), color: 'wild', kind: 'wild4' })
  }

  return deck
}

/** Fisher–Yates 셔플 (원본을 바꾸지 않고 새 배열 반환) */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 숫자 카드 중 하나를 시작 카드로 쓰기 위해 찾기 (와일드/액션으로 시작하지 않도록) */
export function pickStartColor(card: Card): PlayColor {
  return card.color === 'wild' ? 'red' : (card.color as PlayColor)
}
