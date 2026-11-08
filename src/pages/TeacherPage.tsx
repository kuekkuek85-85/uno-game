// ──────────────────────────────────────────────────────────────
// 교사 대시보드 (스펙 6장 #4, 경로 /teacher)
// 학생별 판수·승률, 난이도별 도전/승리 수, 전체 통계
// ──────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Difficulty } from '../game/types'
import { DIFFICULTY_LABEL } from '../game/types'
import {
  fetchAllMatches,
  fetchAllStudents,
  isSupabaseConfigured,
  type MatchRow,
  type Student,
} from '../lib/supabase'

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard']

type StudentStat = {
  student: Student
  games: number
  wins: number
  byDiff: Record<Difficulty, { games: number; wins: number }>
}

export function TeacherPage() {
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([fetchAllMatches(), fetchAllStudents()]).then(([m, s]) => {
      setMatches(m)
      setStudents(s)
      setLoading(false)
    })
  }

  useEffect(load, [])

  // ── 통계 집계 ──────────────────────────────────────────────
  const stats = useMemo(() => {
    const map = new Map<string, StudentStat>()
    for (const s of students) {
      map.set(s.id, {
        student: s,
        games: 0,
        wins: 0,
        byDiff: {
          easy: { games: 0, wins: 0 },
          normal: { games: 0, wins: 0 },
          hard: { games: 0, wins: 0 },
        },
      })
    }
    for (const m of matches) {
      const st = map.get(m.student_id)
      if (!st) continue
      st.games += 1
      st.byDiff[m.difficulty].games += 1
      if (m.result === 'win') {
        st.wins += 1
        st.byDiff[m.difficulty].wins += 1
      }
    }
    return [...map.values()]
      .filter((s) => s.games > 0)
      .sort((a, b) => b.games - a.games)
  }, [matches, students])

  // 전체 통계
  const overall = useMemo(() => {
    const total = matches.length
    const wins = matches.filter((m) => m.result === 'win').length
    const byDiff: Record<Difficulty, { games: number; wins: number }> = {
      easy: { games: 0, wins: 0 },
      normal: { games: 0, wins: 0 },
      hard: { games: 0, wins: 0 },
    }
    for (const m of matches) {
      byDiff[m.difficulty].games += 1
      if (m.result === 'win') byDiff[m.difficulty].wins += 1
    }
    return { total, wins, players: stats.length, byDiff }
  }, [matches, stats.length])

  const rate = (w: number, g: number) => (g === 0 ? '-' : `${Math.round((w / g) * 100)}%`)

  return (
    <div className="min-h-full max-w-4xl mx-auto w-full p-4">
      <header className="flex items-center justify-between mb-5">
        <Link to="/" className="text-slate-400 hover:text-white text-sm">
          ← 처음으로
        </Link>
        <h1 className="text-2xl font-black">📊 교사 대시보드</h1>
        <button onClick={load} className="text-slate-400 hover:text-white text-sm">
          새로고침
        </button>
      </header>

      {!isSupabaseConfigured && (
        <div className="text-sm bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-lg p-3 mb-4">
          Supabase가 연결되지 않아 데이터가 없습니다. <code>.env</code>와{' '}
          <code>supabase/schema.sql</code>을 설정하세요.
        </div>
      )}

      {loading ? (
        <p className="text-center text-slate-500 py-10">불러오는 중…</p>
      ) : (
        <>
          {/* 전체 통계 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="참여 학생" value={overall.players} />
            <StatCard label="총 경기" value={overall.total} />
            <StatCard label="학생 승리" value={overall.wins} />
            <StatCard
              label="전체 승률"
              value={rate(overall.wins, overall.total)}
            />
          </div>

          {/* 난이도별 도전/승리 */}
          <h2 className="text-lg font-bold mb-2">난이도별 현황</h2>
          <div className="grid grid-cols-3 gap-3 mb-6">
            {DIFFS.map((d) => (
              <div key={d} className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
                <div className="text-sm text-slate-400">{DIFFICULTY_LABEL[d]}</div>
                <div className="text-2xl font-black mt-1">
                  {overall.byDiff[d].games}
                  <span className="text-sm text-slate-500 font-normal"> 판</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  승 {overall.byDiff[d].wins} · 승률{' '}
                  {rate(overall.byDiff[d].wins, overall.byDiff[d].games)}
                </div>
              </div>
            ))}
          </div>

          {/* 학생별 표 */}
          <h2 className="text-lg font-bold mb-2">학생별 상세</h2>
          {stats.length === 0 ? (
            <p className="text-center text-slate-500 py-8">아직 경기 기록이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-700">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-300">
                  <tr>
                    <th className="px-3 py-2 text-left">학생</th>
                    <th className="px-3 py-2 text-right">판수</th>
                    <th className="px-3 py-2 text-right">승</th>
                    <th className="px-3 py-2 text-right">승률</th>
                    <th className="px-3 py-2 text-right">쉬움</th>
                    <th className="px-3 py-2 text-right">보통</th>
                    <th className="px-3 py-2 text-right">어려움</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s, i) => (
                    <tr
                      key={s.student.id}
                      className={i % 2 ? 'bg-slate-900/50' : 'bg-slate-900/20'}
                    >
                      <td className="px-3 py-2">
                        <span className="font-semibold">{s.student.name}</span>
                        <span className="text-slate-500 text-xs ml-1">
                          {s.student.student_no}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{s.games}</td>
                      <td className="px-3 py-2 text-right">{s.wins}</td>
                      <td className="px-3 py-2 text-right text-uno-yellow font-semibold">
                        {rate(s.wins, s.games)}
                      </td>
                      {DIFFS.map((d) => (
                        <td key={d} className="px-3 py-2 text-right text-slate-300">
                          {s.byDiff[d].wins}/{s.byDiff[d].games}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-slate-500 p-2">
                난이도 칸 표기 = 승리/판수
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="text-3xl font-black mt-1">{value}</div>
    </div>
  )
}
