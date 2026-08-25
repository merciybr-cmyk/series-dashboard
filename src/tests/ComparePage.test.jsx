import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  listVolumes: vi.fn(),
  listAllVolumeWorks: vi.fn(),
  listAllParts: vi.fn(),
}))
const api = await import('../board/volumeApi.js')
const { default: ComparePage } = await import('../board/ComparePage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

const VOLUMES = [
  { id: 'v1', number: 1, title: '삶', status: '선정중' },
  { id: 'v2', number: 2, title: '성장', status: '기획' },
]
const VW = [
  { id: 'a', volume_id: 'v1', work_id: 'W1', part_id: 'p1', sort_order: 10, selection_status: 'confirmed', work_snapshot: { title: '소나기', author: '황순원' } },
  { id: 'b', volume_id: 'v1', work_id: 'W2', part_id: null, sort_order: 20, selection_status: 'candidate', work_snapshot: { title: '산유화', author: '김소월' } },
  { id: 'c', volume_id: 'v2', work_id: 'W1', part_id: null, sort_order: 10, selection_status: 'candidate', work_snapshot: { title: '소나기', author: '황순원' } },
]
const PARTS = [{ id: 'p1', volume_id: 'v1', number: 1, title: '시', sort_order: 10 }]

function renderPage() {
  return render(<ToastProvider><HashRouter><ComparePage /></HashRouter></ToastProvider>)
}

test('권별 카드에 부 그룹·작품·중복 강조를 표시한다', async () => {
  api.listVolumes.mockResolvedValue(VOLUMES)
  api.listAllVolumeWorks.mockResolvedValue(VW)
  api.listAllParts.mockResolvedValue(PARTS)
  renderPage()
  await waitFor(() => expect(screen.getByText('1권 삶')).toBeInTheDocument())
  expect(screen.getByText('2권 성장')).toBeInTheDocument()
  expect(screen.getByText('1부 시')).toBeInTheDocument()
  expect(screen.getAllByText('소나기')).toHaveLength(2)      // 두 권 모두
  expect(screen.getAllByText(/⚠/)).toHaveLength(2)          // 겹침 강조 2곳
  expect(screen.getByText('산유화')).toBeInTheDocument()
})

test("'확정만 보기'가 후보를 숨긴다", async () => {
  api.listVolumes.mockResolvedValue(VOLUMES)
  api.listAllVolumeWorks.mockResolvedValue(VW)
  api.listAllParts.mockResolvedValue(PARTS)
  renderPage()
  await waitFor(() => screen.getByText('산유화'))
  await userEvent.click(screen.getByLabelText('확정만 보기'))
  expect(screen.queryByText('산유화')).not.toBeInTheDocument()
  expect(screen.getAllByText('소나기')).toHaveLength(1)      // v1의 확정본만
})
