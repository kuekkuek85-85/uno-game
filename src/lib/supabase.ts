// ──────────────────────────────────────────────────────────────
// Supabase 클라이언트 + 데이터 접근 함수
// 스펙 2장(데이터 모델), 5장(순위)
//
// 환경변수(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)가 없으면
// isSupabaseConfigured === false 로 두고, 게임은 "연습 모드"로 동작한다.
// ──────────────────────────────────────────────────────────────

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Difficulty } from '../game/types'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null

// ── 타입 ──────────────────────────────────────────────────────
export type Student = {
  id: string
  student_no: string
  name: string
  created_at?: string
}

export type MatchResult = 'win' | 'lose'

export type LeaderboardRow = {
  student_id: string
  student_no: string
  name: string
  total_wins: number
  total_games: number
  score: number
}

export type MatchRow = {
  id: string
  student_id: string
  difficulty: Difficulty
  result: MatchResult
  turns: number | null
  played_at: string
}

// ── 학생 입장 (upsert) ────────────────────────────────────────
/**
 * (student_no, name) 복합 UNIQUE 기준으로 있으면 재사용, 없으면 생성.
 */
export async function upsertStudent(
  student_no: string,
  name: string,
): Promise<Student | null> {
  if (!supabase) return null

  // 먼저 조회
  const { data: existing } = await supabase
    .from('students')
    .select('*')
    .eq('student_no', student_no)
    .eq('name', name)
    .maybeSingle()

  if (existing) return existing as Student

  const { data, error } = await supabase
    .from('students')
    .insert({ student_no, name })
    .select()
    .single()

  if (error) {
    // 동시 입장 등으로 UNIQUE 충돌 시 재조회
    const { data: retry } = await supabase
      .from('students')
      .select('*')
      .eq('student_no', student_no)
      .eq('name', name)
      .maybeSingle()
    return (retry as Student) ?? null
  }
  return data as Student
}

// ── 경기 결과 기록 ────────────────────────────────────────────
export async function recordMatch(params: {
  student_id: string
  difficulty: Difficulty
  result: MatchResult
  turns?: number
}): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('matches').insert({
    student_id: params.student_id,
    difficulty: params.difficulty,
    result: params.result,
    turns: params.turns ?? null,
  })
  return !error
}

// ── 순위(leaderboard 뷰) 조회 ─────────────────────────────────
export async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('leaderboard')
    .select('*')
    .order('score', { ascending: false })
    .order('total_wins', { ascending: false })
  if (error || !data) return []
  return data as LeaderboardRow[]
}

// ── 교사 대시보드용: 전체 경기 + 학생 조회 ────────────────────
export async function fetchAllMatches(): Promise<MatchRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('played_at', { ascending: false })
  if (error || !data) return []
  return data as MatchRow[]
}

export async function fetchAllStudents(): Promise<Student[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('students').select('*')
  if (error || !data) return []
  return data as Student[]
}
