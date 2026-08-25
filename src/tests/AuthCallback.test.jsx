import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
  },
}))

const { default: App } = await import('../App.jsx')

test('초대 링크의 access_token 해시가 빈 화면 대신 홈으로 이동한다', async () => {
  // 초대/매직링크 클릭 직후의 주소 형태 재현
  window.location.hash = '#access_token=abc&refresh_token=xyz&type=invite'
  render(<App />)
  // 라우터가 모르는 경로 → 빈 화면이 아니라 처리 중 안내가 보여야 한다
  expect(screen.getByText('로그인 처리 중…')).toBeInTheDocument()
  // 세션 처리(loading 종료) 후 홈으로 이동
  await waitFor(() => expect(window.location.hash).toBe('#/'))
})
