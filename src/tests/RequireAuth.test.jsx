import { render, screen } from '@testing-library/react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'

const authState = { session: null, member: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }
vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => authState }))

const { default: RequireAuth } = await import('../components/RequireAuth.jsx')

// 이전 테스트의 <Navigate>가 남긴 해시를 초기화해 항상 '/'에서 시작한다
beforeEach(() => {
  window.location.hash = '#/'
})

function renderGuarded() {
  return render(
    <HashRouter>
      <Routes>
        <Route path="/login" element={<div>로그인화면</div>} />
        <Route path="/" element={<RequireAuth><div>보호된내용</div></RequireAuth>} />
      </Routes>
    </HashRouter>,
  )
}

test('미로그인이면 로그인 화면으로 보낸다', () => {
  Object.assign(authState, { session: null, member: null, loading: false })
  renderGuarded()
  expect(screen.getByText('로그인화면')).toBeInTheDocument()
})

test('로그인했지만 명부에 없으면 안내를 보여준다', () => {
  Object.assign(authState, { session: { user: { id: 'a' } }, member: null, loading: false })
  renderGuarded()
  expect(screen.getByText(/구성원 명부에서 확인되지 않았습니다/)).toBeInTheDocument()
})

test('구성원이면 내용을 보여준다', () => {
  Object.assign(authState, { session: { user: { id: 'a' } }, member: { id: 'm', name: '김편집' }, loading: false })
  renderGuarded()
  expect(screen.getByText('보호된내용')).toBeInTheDocument()
})
