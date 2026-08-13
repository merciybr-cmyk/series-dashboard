import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithOtp: vi.fn(),
    signOut: vi.fn(),
  },
  from: vi.fn(),
}
vi.mock('../lib/supabaseClient', () => ({ supabase: mockSupabase }))

const { AuthProvider, useAuth } = await import('../auth/AuthProvider.jsx')

function Probe() {
  const { session, member, loading } = useAuth()
  if (loading) return <div>로딩</div>
  return (
    <div>
      <div>세션:{session ? '있음' : '없음'}</div>
      <div>구성원:{member ? member.name : '없음'}</div>
    </div>
  )
}

function mockMemberQuery(row) {
  mockSupabase.from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
  })
}

test('세션이 없으면 session·member 모두 null', async () => {
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } })
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(screen.getByText('세션:없음')).toBeInTheDocument())
  expect(screen.getByText('구성원:없음')).toBeInTheDocument()
})

test('세션이 있으면 members에서 내 행을 조회해 제공한다', async () => {
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'auth-1' } } },
  })
  mockMemberQuery({ id: 'm-1', name: '김편집' })
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(screen.getByText('구성원:김편집')).toBeInTheDocument())
  expect(mockSupabase.from).toHaveBeenCalledWith('members')
})

test('세션은 있지만 명부에 없으면 member는 null', async () => {
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'auth-9' } } },
  })
  mockMemberQuery(null)
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(screen.getByText('세션:있음')).toBeInTheDocument())
  expect(screen.getByText('구성원:없음')).toBeInTheDocument()
})
