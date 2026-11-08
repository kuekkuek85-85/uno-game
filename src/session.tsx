// ──────────────────────────────────────────────────────────────
// 입장 세션(학생 정보 + 선택 난이도) 전역 보관
// 로그인 없이 학번·이름으로 입장 (스펙 1장)
// ──────────────────────────────────────────────────────────────

import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Difficulty } from './game/types'
import type { Student } from './lib/supabase'

export type Session = {
  student: Student | null // Supabase 미설정 시 null 가능(연습 모드)
  studentNo: string
  name: string
  difficulty: Difficulty
}

type SessionContextValue = {
  session: Session | null
  setSession: (s: Session | null) => void
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined)

const STORAGE_KEY = 'uno.session'

function load(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(load)

  const setSession = (s: Session | null) => {
    setSessionState(s)
    try {
      if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  return (
    <SessionContext.Provider value={{ session, setSession }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
