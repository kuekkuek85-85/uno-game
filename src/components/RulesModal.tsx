// ──────────────────────────────────────────────────────────────
// UNO 게임 규칙 설명 팝업 (입장 화면에서 열림)
// 스펙 3장(게임 규칙)·4장(AI)·5장(순위) 요약
// ──────────────────────────────────────────────────────────────

import { useEffect } from 'react'

const COLOR_DOT = ['bg-uno-red', 'bg-uno-yellow', 'bg-uno-green', 'bg-uno-blue']

export function RulesModal({ onClose }: { onClose: () => void }) {
  // ESC 로 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="UNO 게임 규칙"
    >
      <div
        className="bg-slate-800 rounded-2xl shadow-2xl animate-slide-up w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 (고정) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-xl font-black">📖 UNO 게임 규칙</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="w-8 h-8 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* 본문 (스크롤) */}
        <div className="px-6 py-4 overflow-y-auto space-y-5 text-sm leading-relaxed">
          <Section title="🎯 목표">
            <p>
              내 손패를 상대(AI)보다 <b>먼저 모두 내려놓으면 승리</b>합니다. 한 명과
              1:1로 대결해요.
            </p>
          </Section>

          <Section title="🃏 카드를 내는 규칙">
            <p>버린 더미 맨 위 카드와 다음 중 하나라도 같으면 낼 수 있어요.</p>
            <ul className="list-disc list-inside mt-1 space-y-0.5 text-slate-300">
              <li>
                <b>색</b>이 같다 (
                <span className="inline-flex gap-1 align-middle">
                  {COLOR_DOT.map((c) => (
                    <span key={c} className={`inline-block w-3 h-3 rounded-full ${c}`} />
                  ))}
                </span>
                )
              </li>
              <li>
                <b>숫자</b>가 같다 (예: 빨강 7 → 파랑 7)
              </li>
              <li>
                <b>종류</b>가 같다 (예: 초록 Skip → 노랑 Skip)
              </li>
              <li>
                <b>와일드</b> 카드는 아무 때나 낼 수 있어요
              </li>
            </ul>
            <p className="mt-1 text-slate-400">
              낼 수 있는 카드가 없으면 <b>뽑기 더미에서 1장</b>을 뽑습니다. 뽑은
              카드를 낼 수 있으면 내고, 아니면 턴이 넘어가요.
            </p>
          </Section>

          <Section title="✨ 특수 카드">
            <ul className="space-y-1.5">
              <RuleItem badge="🚫" name="Skip (건너뛰기)">
                상대 차례를 건너뜁니다. <b>1:1에서는 내가 한 번 더</b> 냅니다.
              </RuleItem>
              <RuleItem badge="🔁" name="Reverse (방향 전환)">
                1:1에서는 Skip과 똑같이 <b>내가 한 번 더</b> 냅니다.
              </RuleItem>
              <RuleItem badge="+2" name="Draw Two">
                상대가 <b>2장</b>을 뽑습니다.
              </RuleItem>
              <RuleItem badge="🎨" name="Wild (와일드)">
                원하는 <b>색을 지정</b>할 수 있어요.
              </RuleItem>
              <RuleItem badge="+4" name="Wild Draw Four">
                색을 지정하고 상대가 <b>4장</b>을 뽑습니다.
              </RuleItem>
            </ul>
          </Section>

          <Section title="🤖 AI 난이도">
            <ul className="list-disc list-inside space-y-0.5 text-slate-300">
              <li>
                <b>쉬움</b> — 낼 수 있는 카드 중 아무거나 냅니다.
              </li>
              <li>
                <b>보통</b> — 숫자를 아끼고 색을 맞추며 견제합니다.
              </li>
              <li>
                <b>어려움</b> — 상황을 읽고 공격·수비를 바꿉니다.
              </li>
            </ul>
          </Section>

          <Section title="🏆 점수">
            <p>
              승리하면 난이도에 따라 점수를 얻습니다 —{' '}
              <b>쉬움 1점 · 보통 2점 · 어려움 3점</b>. 순위표에서 총점으로 겨뤄요.
            </p>
          </Section>

          <Section title="💡 참고">
            <ul className="list-disc list-inside space-y-0.5 text-slate-400">
              <li>
                <b className="text-slate-200">같은 숫자</b> 카드는 한 번에 여러 장 낼 수
                있어요. 숫자 카드를 누르면 선택되고, 같은 숫자를 더 눌러 모은 뒤 "내기"를
                누르세요.
              </li>
              <li>손패가 1장 남으면 자동으로 "UNO" 처리됩니다 (외치기 벌칙 없음).</li>
              <li>뽑기 더미가 떨어지면 버린 더미를 섞어 다시 사용합니다.</li>
            </ul>
          </Section>
        </div>

        {/* 푸터 (고정) */}
        <div className="px-6 py-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-uno-red hover:bg-red-600 font-bold"
          >
            확인했어요!
          </button>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-bold text-slate-100 mb-1">{title}</h3>
      {children}
    </section>
  )
}

function RuleItem({
  badge,
  name,
  children,
}: {
  badge: string
  name: string
  children: React.ReactNode
}) {
  return (
    <li className="flex gap-2">
      <span className="shrink-0 w-9 h-7 rounded-md bg-slate-900 border border-slate-600 flex items-center justify-center font-bold text-xs">
        {badge}
      </span>
      <span className="text-slate-300">
        <b className="text-slate-100">{name}</b> — {children}
      </span>
    </li>
  )
}
