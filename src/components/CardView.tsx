// ──────────────────────────────────────────────────────────────
// UNO 카드 한 장 렌더링
// ──────────────────────────────────────────────────────────────

import type { Card, CardKind } from '../game/types'

const COLOR_BG: Record<string, string> = {
  red: 'bg-uno-red',
  yellow: 'bg-uno-yellow',
  green: 'bg-uno-green',
  blue: 'bg-uno-blue',
  wild: 'bg-slate-800',
}

const SIZES = {
  sm: 'w-12 h-[72px] text-base rounded-lg',
  md: 'w-16 h-24 text-xl rounded-xl',
  lg: 'w-20 h-28 text-2xl rounded-xl',
}

function symbol(kind: CardKind, value?: number): string {
  switch (kind) {
    case 'number':
      return String(value ?? 0)
    case 'skip':
      return '🚫'
    case 'reverse':
      return '🔁'
    case 'draw2':
      return '+2'
    case 'wild':
      return '🎨'
    case 'wild4':
      return '+4'
  }
}

type Props = {
  card: Card
  size?: keyof typeof SIZES
  disabled?: boolean
  onClick?: () => void
  selected?: boolean
}

export function CardView({ card, size = 'md', disabled, onClick, selected }: Props) {
  const bg = COLOR_BG[card.color] ?? 'bg-slate-700'
  const clickable = Boolean(onClick) && !disabled
  const sym = symbol(card.kind, card.value)

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      aria-label={`${card.color} ${card.kind} ${card.value ?? ''}`}
      className={[
        SIZES[size],
        bg,
        'relative flex items-center justify-center font-black text-white',
        'border-2 border-white/80 shadow-lg select-none transition-transform',
        card.color === 'wild' ? 'ring-2 ring-fuchsia-400/40' : '',
        clickable ? 'hover:-translate-y-2 cursor-pointer' : '',
        disabled ? 'opacity-40 grayscale' : '',
        selected ? '-translate-y-3 ring-4 ring-white' : '',
      ].join(' ')}
    >
      {/* 모서리 작은 표식 */}
      <span className="absolute top-0.5 left-1 text-[10px] leading-none opacity-90">
        {sym}
      </span>
      <span className="absolute bottom-0.5 right-1 text-[10px] leading-none opacity-90 rotate-180">
        {sym}
      </span>
      {/* 가운데 흰 타원 + 심볼 */}
      <span className="flex items-center justify-center w-3/4 h-3/5 rounded-full bg-white/90">
        <span
          className={[
            'drop-shadow',
            card.color === 'wild'
              ? 'bg-gradient-to-br from-red-500 via-yellow-400 to-blue-500 bg-clip-text text-transparent'
              : card.color === 'yellow'
                ? 'text-amber-500'
                : card.color === 'red'
                  ? 'text-red-600'
                  : card.color === 'green'
                    ? 'text-green-600'
                    : 'text-blue-600',
          ].join(' ')}
        >
          {sym}
        </span>
      </span>
    </button>
  )
}

/** 뒷면(상대 손패·뽑기 더미) */
export function CardBack({
  size = 'md',
  onClick,
  label,
}: {
  size?: keyof typeof SIZES
  onClick?: () => void
  label?: string
}) {
  const clickable = Boolean(onClick)
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={[
        SIZES[size],
        'card-back-pattern bg-slate-900 border-2 border-white/40 shadow-lg',
        'flex items-center justify-center relative',
        clickable ? 'hover:-translate-y-1 cursor-pointer' : '',
      ].join(' ')}
    >
      <span className="text-uno-red font-black text-lg -rotate-12 bg-white/90 px-1 rounded">
        UNO
      </span>
      {label && (
        <span className="absolute -bottom-6 text-xs text-slate-300 whitespace-nowrap">
          {label}
        </span>
      )}
    </button>
  )
}
