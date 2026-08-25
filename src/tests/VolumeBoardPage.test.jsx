import { render, screen, waitFor } from '@testing-library/react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../works/useWorksData.js', () => ({
  useWorksData: () => ({
    works: [{ '작품명': '소나기', '지은이': '황순원', _authorBase: '황순원', '장르': '소설', '교육과정': '7차', _titleChosung: 'ㅅㄴㄱ', _authorChosung: 'ㅎㅅㅇ' }],
    loading: false, error: null, retry: () => {},
  }),
}))
vi.mock('../board/volumeApi.js', () => ({
  getBoard: vi.fn().mockResolvedValue({
    volume: { id: 'v1', number: 3, title: '성장', status: '선정중' },
    works: [], tasks: [], parts: [],
  }),
  listMembers: vi.fn().mockResolvedValue([]),
  listRegistry: vi.fn().mockResolvedValue([]),
  listAllVolumeWorks: vi.fn().mockResolvedValue([]),
  listAllFiles: vi.fn().mockResolvedValue([]),
  subscribeBoard: vi.fn(() => () => {}),
  updateVolume: vi.fn(),
  addWorkToVolume: vi.fn(), updateVolumeWork: vi.fn(), deleteVolumeWork: vi.fn(),
  applySortSwap: vi.fn(), addTasks: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn(),
  listActivityFor: vi.fn().mockResolvedValue([]),
  createPart: vi.fn(), updatePart: vi.fn(), deletePart: vi.fn(),
}))
const { default: VolumeBoardPage } = await import('../board/VolumeBoardPage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')
const api = await import('../board/volumeApi.js')

test('권 헤더·검색 패널·수록 목록이 함께 렌더링된다', async () => {
  window.location.hash = '#/volumes/v1'
  render(
    <ToastProvider>
      <HashRouter>
        <Routes><Route path="/volumes/:id" element={<VolumeBoardPage />} /></Routes>
      </HashRouter>
    </ToastProvider>,
  )
  await waitFor(() => expect(screen.getByText(/3권/)).toBeInTheDocument())
  expect(screen.getByText('성장')).toBeInTheDocument()
  expect(screen.getByPlaceholderText(/작품명·작가/)).toBeInTheDocument()
  expect(screen.getByText('표시할 작품이 없습니다')).toBeInTheDocument()
})

test('부 관리 버튼이 보드에 렌더링된다', async () => {
  window.location.hash = '#/volumes/v1'
  render(
    <ToastProvider>
      <HashRouter>
        <Routes><Route path="/volumes/:id" element={<VolumeBoardPage />} /></Routes>
      </HashRouter>
    </ToastProvider>,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: '부 관리' })).toBeInTheDocument())
})

test("권 상태가 '제작중'(legacy)이어도 표시되고 옵션은 4종+legacy", async () => {
  api.getBoard.mockResolvedValue({
    volume: { id: 'v1', number: 3, title: '성장', status: '제작중' },
    parts: [], works: [], tasks: [],
  })
  window.location.hash = '#/volumes/v1'
  render(
    <ToastProvider>
      <HashRouter>
        <Routes><Route path="/volumes/:id" element={<VolumeBoardPage />} /></Routes>
      </HashRouter>
    </ToastProvider>,
  )
  const select = await screen.findByLabelText('권 상태')
  expect(select).toHaveValue('제작중')
  const labels = [...select.options].map(o => o.textContent)
  expect(labels).toEqual(['제작중', '기획', '선정중', '확정', '완료'])
})
