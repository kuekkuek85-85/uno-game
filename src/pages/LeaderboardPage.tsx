// ──────────────────────────────────────────────────────────────
// 순위 화면 (스펙 6장 #3) — leaderboard 뷰를 score 내림차순 표시
// ──────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchLeaderboard,
  isSupabaseConfigured,
  type LeaderboardRow,
} from '../lib/supabase'

function winRate(wins: number, games: number): string {
  if (games === 0) return '0%'
  return `${Math.round((wins / games) * 100)}%`
}

const MEDAL = ['🥇', '🥈', '🥉']

export function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetchLeaderboard().then((r) => {
      setRows(r)
      setLoading(false)
    })
  }

  useEffect(load, [])

  return (
    <div className="min-h-full max-w-2xl mx-auto w-full p-4">
      <header className="flex items-center justify-between mb-5">
        <Link to="/" className="text-slate-400 hover:text-white text-sm">
          ← 처음으로
        </Link>
        <h1 className="text-2xl font-black">🏆 순위</h1>
        <button onClick={load} className="text-slate-400 hover:text-white text-sm">
          새로고침
        </button>
      </header>

      {!isSupabaseConfigured && (
        <div className="text-sm bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-lg p-3 mb-4">
          Supabase가 연결되지 않아 순위 데이터가 없습니다.
        </div>
      )}

      {loading ? (
        <p className="text-center text-slate-500 py-10">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-center text-slate-500 py-10">아직 기록이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-slate-300">
              <tr>
                <th className="px-3 py-2 text-left">순위</th>
                <th className="px-3 py-2 text-left">이름</th>
                <th className="px-3 py-2 text-right">총점</th>
                <th className="px-3 py-2 text-right">승</th>
                <th className="px-3 py-2 text-right">판수</th>
                <th className="px-3 py-2 text-right">승률</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.student_id}
                  className={i % 2 ? 'bg-slate-900/50' : 'bg-slate-900/20'}
                >
                  <td className="px-3 py-2 font-bold">{MEDAL[i] ?? i + 1}</td>
                  <td className="px-3 py-2">
                    <span className="font-semibold">{r.name}</span>
                    <span className="text-slate-500 text-xs ml-1">{r.student_no}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-uno-yellow">
                    {r.score}
                  </td>
                  <td className="px-3 py-2 text-right">{r.total_wins}</td>
                  <td className="px-3 py-2 text-right">{r.total_games}</td>
                  <td className="px-3 py-2 text-right text-slate-300">
                    {winRate(r.total_wins, r.total_games)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-500 mt-4 text-center">
        점수 = 승리 × 난이도 가중치 (쉬움 1 · 보통 2 · 어려움 3)
      </p>
    </div>
  )
}
