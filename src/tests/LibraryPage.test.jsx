import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  listLibraryFiles: vi.fn(),
  uploadLibraryFile: vi.fn(),
  addLibraryLink: vi.fn(),
  deleteFile: vi.fn(),
  getFileUrl: vi.fn(),
  listMembers: vi.fn().mockResolvedValue([{ id: 'm1', name: '윤보라' }]),
}))
const api = await import('../board/volumeApi.js')
const { default: LibraryPage } = await import('../board/LibraryPage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

function renderPage() {
  return render(<ToastProvider><LibraryPage /></ToastProvider>)
}

test('자료 목록을 등록자와 함께 단일 목록으로 보여준다', async () => {
  api.listLibraryFiles.mockResolvedValue([
    { id: 'f1', kind: 'upload', name: '8월 회의록.hwp', uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', storage_path: 'library/x' },
    { id: 'f2', kind: 'link', name: '원고 드라이브 폴더', uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', url: 'https://drive.example.com' },
  ])
  renderPage()
  await waitFor(() => expect(screen.getByText(/8월 회의록\.hwp/)).toBeInTheDocument())
  expect(screen.getByText(/원고 드라이브 폴더/)).toBeInTheDocument()
  expect(screen.getAllByText(/윤보라/)).toHaveLength(2)
  // 권 구분 UI 없음 (2026-08-27 사용자 결정)
  expect(screen.queryByLabelText('권 필터')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('등록할 권')).not.toBeInTheDocument()
})

test('클라우드 링크를 공통 자료로 등록한다', async () => {
  api.listLibraryFiles.mockResolvedValue([])
  api.addLibraryLink.mockResolvedValue({ id: 'f9', kind: 'link', name: '원고 폴더', uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', url: 'https://d.com' })
  renderPage()
  await waitFor(() => screen.getByRole('button', { name: '클라우드 링크 등록' }))
  await userEvent.click(screen.getByRole('button', { name: '클라우드 링크 등록' }))
  await userEvent.type(screen.getByPlaceholderText('자료 이름'), '원고 폴더')
  await userEvent.type(screen.getByPlaceholderText('https://…'), 'https://d.com')
  await userEvent.click(screen.getByRole('button', { name: '등록' }))
  expect(api.addLibraryLink).toHaveBeenCalledWith('원고 폴더', 'https://d.com', null)
  await waitFor(() => expect(screen.getByText('원고 폴더')).toBeInTheDocument())
})

test('삭제는 confirm 후 목록에서 사라진다', async () => {
  api.listLibraryFiles.mockResolvedValue([
    { id: 'f1', kind: 'upload', name: '회의록.hwp', uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', storage_path: 'p' },
  ])
  api.deleteFile.mockResolvedValue()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderPage()
  await waitFor(() => screen.getByRole('button', { name: '회의록.hwp 삭제' }))
  await userEvent.click(screen.getByRole('button', { name: '회의록.hwp 삭제' }))
  expect(api.deleteFile).toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByText(/회의록\.hwp/)).not.toBeInTheDocument())
  window.confirm.mockRestore()
})
