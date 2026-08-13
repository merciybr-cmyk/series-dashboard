import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const signIn = vi.fn()
vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: () => ({ session: null, member: null, loading: false, signIn }),
}))

const { default: LoginPage } = await import('../pages/LoginPage.jsx')

test('이메일 제출 시 signIn을 호출하고 안내 문구를 보여준다', async () => {
  signIn.mockResolvedValue({ error: null })
  render(<LoginPage />)
  await userEvent.type(screen.getByLabelText('이메일'), 'test@example.com')
  await userEvent.click(screen.getByRole('button', { name: '로그인 링크 받기' }))
  expect(signIn).toHaveBeenCalledWith('test@example.com')
  expect(await screen.findByText(/메일함을 확인해 주세요/)).toBeInTheDocument()
})

test('미초대 이메일 오류 시 안내 문구를 보여준다', async () => {
  signIn.mockResolvedValue({ error: { message: 'Signups not allowed for otp' } })
  render(<LoginPage />)
  await userEvent.type(screen.getByLabelText('이메일'), 'nobody@example.com')
  await userEvent.click(screen.getByRole('button', { name: '로그인 링크 받기' }))
  expect(await screen.findByText(/초대된 이메일이 아닙니다/)).toBeInTheDocument()
})
