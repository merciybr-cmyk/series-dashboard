import { render, screen, within, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

const sheetState = vi.hoisted(() => ({ current: null }))
vi.mock('../works/useWorksData.js', () => ({ useWorksData: () => sheetState.current }))
vi.mock('../board/volumeApi.js', () => ({
  listVolumes: vi.fn(), listAllVolumeWorks: vi.fn(), listAllParts: vi.fn(),
  listAttachmentRefs: vi.fn(), updateVolumeWork: vi.fn(), deleteVolumeWork: vi.fn(),
  ensureWorkId: vi.fn(), insertPlacedWork: vi.fn(), listRegistry: vi.fn(), listPicks: vi.fn(),
}))
vi.mock('../board/exportCompare.js', () => ({ downloadCompareExcel: vi.fn() }))
const api = await import('../board/volumeApi.js')
const { default: ComparePage } = await import('../board/ComparePage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

const VOLUMES = [
  { id: 'v1', number: 1, title: '첫 장면', status: '기획', curricula: ['1차', '2차', '3차'] },
  { id: 'v2', number: 2, title: '오래 남을', status: '기획', curricula: ['4차'] },
]
const PARTS = [
  { id: 'p1', volume_id: 'v1', number: 1, title: '시', sort_order: 10 },
  { id: 'p2', volume_id: 'v1', number: 2, title: '소설', sort_order: 20 },
  { id: 'q1', volume_id: 'v2', number: 1, title: '시', sort_order: 10 },
  { id: 'q2', volume_id: 'v2', number: 2, title: '소설', sort_order: 20 },
]
const snap = (title, author, genre, curriculum) => ({ title, author, genre, curriculum })
const VW = [
  { id: 'a', volume_id: 'v1', work_id: 'W1', part_id: 'p2', sort_order: 10, selection_status: 'candidate', work_snapshot: snap('소나기', '황순원', '소설', ['2차', '4차']) },
  { id: 'b', volume_id: 'v1', work_id: 'W2', part_id: 'p1', sort_order: 20, selection_status: 'candidate', work_snapshot: snap('산유화', '김소월', '시', ['1차']) },
  { id: 'c', volume_id: 'v2', work_id: 'W3', part_id: 'q2', sort_order: 10, selection_status: 'confirmed', work_snapshot: snap('학', '황순원', '소설', ['5차']) },
  { id: 'd', volume_id: 'v2', work_id: 'W2', part_id: 'q1', sort_order: 20, selection_status: 'candidate', work_snapshot: snap('산유화', '김소월', '시', ['1차', '4차']) },
]
const SHEET = [
  { '작품명': '돌다리', '지은이': '이태준', '장르': '소설', '교육과정': '4차', _authorBase: '이태준' },
  { '작품명': '소나기', '지은이': '황순원', '장르': '소설', '교육과정': '2차', _authorBase: '황순원' },
]
const REGISTRY = [
  { work_id: 'W1', title: '소나기', author_base: '황순원', aliases: [] },
  { work_id: 'W9', title: '돌다리', author_base: '이태준', aliases: [] },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.listVolumes.mockResolvedValue(VOLUMES)
  api.listAllVolumeWorks.mockResolvedValue(VW)
  api.listAllParts.mockResolvedValue(PARTS)
  api.listAttachmentRefs.mockResolvedValue({ tasks: [], comments: [], files: [] })
  api.updateVolumeWork.mockResolvedValue({})
  api.deleteVolumeWork.mockResolvedValue()
  api.insertPlacedWork.mockResolvedValue({ id: 'new' })
  api.listRegistry.mockResolvedValue(REGISTRY)
  api.listPicks.mockResolvedValue([{ work_id: 'W1' }, { work_id: 'W9' }])
  sheetState.current = { works: SHEET, loading: false, error: null, retry: vi.fn() }
})

function renderPage() {
  const router = createMemoryRouter(
    [{ path: '/compare', element: <ComparePage /> }, { path: '/', element: <p>홈 화면</p> }],
    { initialEntries: ['/compare'] },
  )
  render(<ToastProvider><RouterProvider router={router} /></ToastProvider>)
  return router
}
const region = name => screen.getByRole('region', { name })

test('보기 모드에서도 경고 뱃지를 보여 준다', async () => {
  renderPage()
  await screen.findByText('2권 오래 남을')
  expect(within(region('2권 오래 남을')).getByText('⚠ 수록 이력 없음')).toBeInTheDocument() // 학(5차)은 2권(4차)에 이력 없음
  expect(within(region('1권 첫 장면')).queryByText(/⚠ 부 확인/)).not.toBeInTheDocument()
})
