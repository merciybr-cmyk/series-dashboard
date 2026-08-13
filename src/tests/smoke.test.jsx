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

test('미로그인 상태에서 로그인 화면이 보인다', async () => {
  render(<App />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '로그인 링크 받기' })).toBeInTheDocument(),
  )
})
