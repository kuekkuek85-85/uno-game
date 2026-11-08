// ──────────────────────────────────────────────────────────────
// 입장 화면: 학번·이름 입력 → AI 난이도 선택 → 시작 (스펙 6장 #1)
// ──────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import type { Difficulty } from '../game/types'
import { DIFFICULTY_LABEL, DIFFICULTY_SCORE } from '../game/types'
import { useSession } from '../session'
import { isSupabaseConfigured, upsertStudent } from '../lib/supabase'
import { RulesModal } from '../components/RulesModal'

const DIFF_INFO: Record<Difficulty, { desc: string; emoji: string }> = {
  easy: { desc: '랜덤으로 카드를 냅니다. 처음이라면 추천!', emoji: '🙂' },
  normal: { desc: '규칙 기반 전략. 숫자를 아끼고 견제합니다.', emoji: '😎' },
  hard: { desc: '상황을 읽고 공격·수비를 바꿉니다. 도전!', emoji: '🔥' },
}

export function EntryPage() {
  const nav = useNavigate()
  const { setSession } = useSession()
  const [studentNo, setStudentNo] = useState('')
  const [name, setName] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showRules, setShowRules] = useState(false)

  const start = async () => {
    setError('')
    if (!studentNo.trim() || !name.trim()) {
      setError('학번과 이름을 모두 입력하세요.')
      return
    }
    setLoading(true)
    try {
      const student = await upsertStudent(studentNo.trim(), name.trim())
      setSession({
        student,
        studentNo: studentNo.trim(),
        name: name.trim(),
        difficulty,
      })
      nav('/play')
    } catch {
      // Supabase 오류가 나도 연습 모드로 게임은 시작
      setSession({
        student: null,
        studentNo: studentNo.trim(),
        name: name.trim(),
        difficulty,
      })
      nav('/play')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-5xl font-black tracking-tight">
            <span className="text-uno-red">U</span>
            <span className="text-uno-yellow">N</span>
            <span className="text-uno-green">O</span>
            <span className="text-slate-400 text-3xl"> vs </span>
            <span className="text-uno-blue">AI</span>
          </h1>
          <p className="text-slate-400 mt-2">사람 vs 인공지능 UNO 대결</p>
          <button
            onClick={() => setShowRules(true)}
            className="mt-3 inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-sm font-medium"
          >
            📖 게임 방법 보기
          </button>
        </div>

        <div className="bg-slate-800/70 rounded-2xl p-6 shadow-xl space-y-5">
          {!isSupabaseConfigured && (
            <div className="text-xs bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-lg p-3">
              ⚠️ 연습 모드: Supabase가 연결되지 않아 결과가 저장되지 않습니다.
              (<code>.env</code> 설정 시 기록·순위가 활성화됩니다)
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-slate-300">학번</span>
              <input
                value={studentNo}
                onChange={(e) => setStudentNo(e.target.value)}
                placeholder="예: 10203"
                inputMode="numeric"
                className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-uno-blue"
              />
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">이름</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 홍길동"
                className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-uno-blue"
              />
            </label>
          </div>

          <div>
            <span className="text-sm text-slate-300">AI 난이도</span>
            <div className="mt-2 space-y-2">
              {(['easy', 'normal', 'hard'] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={[
                    'w-full text-left rounded-xl p-3 border transition-colors',
                    difficulty === d
                      ? 'border-uno-blue bg-uno-blue/15'
                      : 'border-slate-700 bg-slate-900 hover:border-slate-500',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      {DIFF_INFO[d].emoji} {DIFFICULTY_LABEL[d]}
                    </span>
                    <span className="text-xs text-slate-400">
                      승리 시 {DIFFICULTY_SCORE[d]}점
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{DIFF_INFO[d].desc}</p>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={start}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-uno-red hover:bg-red-600 font-bold text-lg shadow-lg disabled:opacity-60 transition-colors"
          >
            {loading ? '입장 중…' : '게임 시작'}
          </button>

          <div className="flex justify-center gap-4 text-sm text-slate-400">
            <Link to="/leaderboard" className="hover:text-white">
              🏆 순위 보기
            </Link>
            <Link to="/teacher" className="hover:text-white">
              📊 교사 대시보드
            </Link>
          </div>
        </div>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  )
}
