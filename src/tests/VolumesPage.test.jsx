import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  listVolumes: vi.fn(),
  createVolume: vi.fn(),
}))
const api = await import('../board/volumeApi.js')
const { default: VolumesPage } = await import('../board/VolumesPage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

function renderPage() {
  return render(<ToastProvider><HashRouter><VolumesPage /></HashRouter></ToastProvider>)
}

test('권 목록을 보여준다', async () => {
  api.listVolumes.mockResolvedValue([
    { id: 'v1', number: 1, title: '가족', status: '선정중' },
    { id: 'v2', number: 2, title: '성장', status: '기획' },
  ])
  renderPage()
  await waitFor(() => expect(screen.getByText('가족')).toBeInTheDocument())
  expect(screen.getByText('성장')).toBeInTheDocument()
  expect(screen.getByText('선정중')).toBeInTheDocument()
})

test('새 권을 추가하면 목록에 나타난다', async () => {
  api.listVolumes.mockResolvedValue([])
  api.createVolume.mockResolvedValue({ id: 'v9', number: 9, title: '자연', status: '기획' })
  renderPage()
  await waitFor(() => screen.getByRole('button', { name: '새 권 추가' }))
  await userEvent.type(screen.getByLabelText('권 번호'), '9')
  await userEvent.type(screen.getByLabelText('주제명'), '자연')
  await userEvent.click(screen.getByRole('button', { name: '새 권 추가' }))
  expect(api.createVolume).toHaveBeenCalledWith({ number: 9, title: '자연' })
  await waitFor(() => expect(screen.getByText('자연')).toBeInTheDocument())
})
