import { Routes, Route } from 'react-router-dom'
import { SessionProvider } from './session'
import { EntryPage } from './pages/EntryPage'
import { GamePage } from './pages/GamePage'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { TeacherPage } from './pages/TeacherPage'

export default function App() {
  return (
    <SessionProvider>
      <div className="min-h-full">
        <Routes>
          <Route path="/" element={<EntryPage />} />
          <Route path="/play" element={<GamePage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/teacher" element={<TeacherPage />} />
          <Route path="*" element={<EntryPage />} />
        </Routes>
      </div>
    </SessionProvider>
  )
}
