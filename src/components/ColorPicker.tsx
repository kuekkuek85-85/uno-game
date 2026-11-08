// ──────────────────────────────────────────────────────────────
// 와일드 카드를 낼 때 색 선택 팝업
// ──────────────────────────────────────────────────────────────

import type { PlayColor } from '../game/types'
import { PLAY_COLORS } from '../game/types'
import { colorKo } from '../game/engine'

const BG: Record<PlayColor, string> = {
  red: 'bg-uno-red',
  yellow: 'bg-uno-yellow',
  green: 'bg-uno-green',
  blue: 'bg-uno-blue',
}

export function ColorPicker({
  onPick,
  onCancel,
}: {
  onPick: (c: PlayColor) => void
  onCancel: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-slate-800 rounded-2xl p-6 shadow-2xl animate-pop-in max-w-xs w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-center mb-4">색을 선택하세요</h3>
        <div className="grid grid-cols-2 gap-3">
          {PLAY_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onPick(c)}
              className={`${BG[c]} h-20 rounded-xl font-bold text-white text-lg border-2 border-white/60 hover:scale-105 transition-transform shadow-lg`}
            >
              {colorKo(c)}
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          className="mt-4 w-full py-2 text-slate-400 hover:text-white text-sm"
        >
          취소
        </button>
      </div>
    </div>
  )
}
