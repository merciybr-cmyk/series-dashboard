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

beforeEach(() => vi.clearAllMocks())

function renderPage() {
  return render(<ToastProvider><LibraryPage /></ToastProvider>)
}

const UPLOAD = { id: 'f1', kind: 'upload', name: '8월 회의록.pdf', uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', storage_path: 'library/x' }
const LINK = { id: 'f2', kind: 'link', name: '원고 드라이브 폴더', uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', url: 'https://drive.example.com' }

test('회의록과 드라이브 링크가 섹션으로 분리된다', async () => {
  api.listLibraryFiles.mockResolvedValue([UPLOAD, LINK])
  renderPage()
  await waitFor(() => expect(screen.getByText(/8월 회의록\.pdf/)).toBeInTheDocument())
  expect(screen.getByRole('heading', { name: '회의록' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '드라이브 링크' })).toBeInTheDocument()
  expect(screen.getByText(/원고 드라이브 폴더/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '8월 회의록.pdf 미리보기' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '8월 회의록.pdf 다운로드' })).toBeInTheDocument()
})

test('미리보기를 누르면 오른쪽 패널에 표시된다 (PDF → iframe)', async () => {
  api.listLibraryFiles.mockResolvedValue([UPLOAD])
  api.getFileUrl.mockResolvedValue('https://signed.example.com/x.pdf')
  renderPage()
  await waitFor(() => screen.getByRole('button', { name: '8월 회의록.pdf 미리보기' }))
  await userEvent.click(screen.getByRole('button', { name: '8월 회의록.pdf 미리보기' }))
  expect(api.getFileUrl).toHaveBeenCalledWith('library/x') // 인라인용 — 다운로드 이름 없이
  const frame = await screen.findByTitle('8월 회의록.pdf 미리보기')
  // PDF는 썸네일 사이드바·툴바 숨김 + 페이지 폭 맞춤 프래그먼트를 붙인다
  expect(frame).toHaveAttribute('src', 'https://signed.example.com/x.pdf#toolbar=0&navpanes=0&view=FitH')
  // 닫기
  await userEvent.click(screen.getByRole('button', { name: '미리보기 닫기' }))
  expect(screen.queryByTitle('8월 회의록.pdf 미리보기')).not.toBeInTheDocument()
})

test('미지원 형식(hwp)은 안내와 다운로드를 보여준다', async () => {
  const hwp = { ...UPLOAD, id: 'f3', name: '회의록.hwp' }
  api.listLibraryFiles.mockResolvedValue([hwp])
  renderPage()
  await waitFor(() => screen.getByRole('button', { name: '회의록.hwp 미리보기' }))
  await userEvent.click(screen.getByRole('button', { name: '회의록.hwp 미리보기' }))
  expect(screen.getByText(/브라우저 미리보기를 지원하지 않습니다/)).toBeInTheDocument()
  expect(api.getFileUrl).not.toHaveBeenCalled()
})

test('다운로드 버튼은 원본 파일명으로 서명 URL을 연다', async () => {
  api.listLibraryFiles.mockResolvedValue([UPLOAD])
  api.getFileUrl.mockResolvedValue('https://signed.example.com/dl')
  const openSpy = vi.spyOn(window, 'open').mockImplementation(() => {})
  renderPage()
  await waitFor(() => screen.getByRole('button', { name: '8월 회의록.pdf 다운로드' }))
  await userEvent.click(screen.getByRole('button', { name: '8월 회의록.pdf 다운로드' }))
  await waitFor(() => expect(api.getFileUrl).toHaveBeenCalledWith('library/x', '8월 회의록.pdf'))
  openSpy.mockRestore()
})

test('드라이브 링크를 등록한다', async () => {
  api.listLibraryFiles.mockResolvedValue([])
  api.addLibraryLink.mockResolvedValue({ ...LINK, id: 'f9', name: '원고 폴더', url: 'https://d.com' })
  renderPage()
  await waitFor(() => screen.getByRole('button', { name: '드라이브 링크 등록' }))
  await userEvent.click(screen.getByRole('button', { name: '드라이브 링크 등록' }))
  await userEvent.type(screen.getByPlaceholderText('자료 이름'), '원고 폴더')
  await userEvent.type(screen.getByPlaceholderText('https://…'), 'https://d.com')
  await userEvent.click(screen.getByRole('button', { name: '등록' }))
  expect(api.addLibraryLink).toHaveBeenCalledWith('원고 폴더', 'https://d.com', null)
  await waitFor(() => expect(screen.getByText(/원고 폴더/)).toBeInTheDocument())
})
