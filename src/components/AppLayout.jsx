import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider.jsx'

const MENU = [
  { to: '/', label: '홈' },
  { to: '/picks', label: '갈래별 후보' },
  { to: '/volumes', label: '권별 작품 목록' },
  { to: '/compare', label: '권별 비교' },
  { to: '/schedule', label: '일정' },
  { to: '/library', label: '자료실' },
]

export default function AppLayout() {
  const { member, signOut } = useAuth()
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-6 border-b border-blue-100 bg-blue-50 px-6 py-3">
        <span className="flex items-center gap-2.5">
          <img src={`${import.meta.env.BASE_URL}mirae-n_logo.png`} alt="미래엔" className="h-6 w-auto shrink-0" />
          <span className="text-xl font-bold">교과서 문학 단행본 시리즈 통합 관리</span>
        </span>
        <nav className="flex gap-4 text-base">
          {MENU.map(m => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.to === '/'}
              className={({ isActive }) => (isActive ? 'font-semibold text-blue-600' : 'text-gray-600')}
            >
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span>{member?.name}</span>
          <button onClick={signOut} className="text-gray-500 underline">로그아웃</button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
