import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  listLibraryFiles: vi.fn(),
  uploadLibraryFile: vi.fn(),
  addLibraryLink: vi.fn(),
  deleteFile: vi.fn(),
  getFileUrl: vi.fn(),
  listVolumes: vi.fn().mockResolvedValue([{ id: 'v1', number: 1, title: '삶', status: '선정중' }]),
  listMembers: vi.fn().mockResolvedValue([{ id: 'm1', name: '윤보라' }]),
}))
const api = await import('../board/volumeApi.js')
const { default: LibraryPage } = await import('../board/LibraryPage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

function renderPage() {
  return render(<ToastProvider><LibraryPage /></ToastProvider>)
}

test('자료 목록을 등록자·권 태그와 함께 보여준다', async () => {
  api.listLibraryFiles.mockResolvedValue([
    { id: 'f1', kind: 'upload', name: '8월 회의록.hwp', volume_id: null, uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', storage_path: 'library/x' },
    { id: 'f2', kind: 'link', name: '1권 원고 모음', volume_id: 'v1', uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', url: 'https://drive.example.com' },
  ])
  renderPage()
  await waitFor(() => expect(screen.getByText(/8월 회의록\.hwp/)).toBeInTheDocument())
  expect(screen.getByText('공통')).toBeInTheDocument()
  expect(screen.getByText('1권')).toBeInTheDocument()
})

test('권 필터가 목록을 거른다', async () => {
  api.listLibraryFiles.mockResolvedValue([
    { id: 'f1', kind: 'upload', name: '회의록.hwp', volume_id: null, uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', storage_path: 'p' },
    { id: 'f2', kind: 'link', name: '1권 자료', volume_id: 'v1', uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', url: 'https://x.com' },
  ])
  renderPage()
  await waitFor(() => screen.getByText(/회의록\.hwp/))
  await userEvent.selectOptions(screen.getByLabelText('권 필터'), '공통')
  expect(screen.queryByText('1권 자료')).not.toBeInTheDocument()
  expect(screen.getByText(/회의록\.hwp/)).toBeInTheDocument()
})

test('클라우드 링크를 등록한다', async () => {
  api.listLibraryFiles.mockResolvedValue([])
  api.addLibraryLink.mockResolvedValue({ id: 'f9', kind: 'link', name: '원고 폴더', volume_id: null, uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', url: 'https://d.com' })
  renderPage()
  await waitFor(() => screen.getByRole('button', { name: '클라우드 링크 등록' }))
  await userEvent.click(screen.getByRole('button', { name: '클라우드 링크 등록' }))
  await userEvent.type(screen.getByPlaceholderText('자료 이름'), '원고 폴더')
  await userEvent.type(screen.getByPlaceholderText('https://…'), 'https://d.com')
  await userEvent.click(screen.getByRole('button', { name: '등록' }))
  expect(api.addLibraryLink).toHaveBeenCalledWith('원고 폴더', 'https://d.com', null)
  await waitFor(() => expect(screen.getByText('원고 폴더')).toBeInTheDocument())
})
