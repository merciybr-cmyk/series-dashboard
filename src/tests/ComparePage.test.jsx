import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  listVolumes: vi.fn(), listAllVolumeWorks: vi.fn(), listAllParts: vi.fn(),
  listAttachmentRefs: vi.fn(), updateVolumeWork: vi.fn(), deleteVolumeWork: vi.fn(),
  ensureWorkId: vi.fn(), insertPlacedWork: vi.fn(), listRegistry: vi.fn(), listPicks: vi.fn(),
}))
vi.mock('../board/exportCompare.js', () => ({ downloadCompareExcel: vi.fn() }))
const api = await import('../board/volumeApi.js')
const { downloadCompareExcel } = await import('../board/exportCompare.js')
const { default: ComparePage } = await import('../board/ComparePage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

const VOLUMES = [
  { id: 'v1', number: 1, title: '삶', status: '선정중' },
  { id: 'v2', number: 2, title: '성장', status: '기획' },
]
const VW = [
  { id: 'a', volume_id: 'v1', work_id: 'W1', part_id: 'p1', sort_order: 10, selection_status: 'confirmed', work_snapshot: { title: '소나기', author: '황순원', genre: '소설' } },
  { id: 'b', volume_id: 'v1', work_id: 'W2', part_id: null, sort_order: 20, selection_status: 'candidate', work_snapshot: { title: '산유화', author: '김소월', genre: '시' } },
  { id: 'c', volume_id: 'v2', work_id: 'W1', part_id: null, sort_order: 10, selection_status: 'candidate', work_snapshot: { title: '소나기', author: '황순원', genre: '소설' } },
  { id: 'd', volume_id: 'v1', work_id: 'W4', part_id: 'p1', sort_order: 30, selection_status: 'candidate', work_snapshot: { title: '홍길동전', author: '허균', genre: '고전소설' } },
]
const PARTS = [{ id: 'p1', volume_id: 'v1', number: 1, title: '시', sort_order: 10 }]

function renderPage() {
  const router = createMemoryRouter(
    [{ path: '/compare', element: <ComparePage /> }, { path: '/volumes/:id', element: <p>권 보드</p> }],
    { initialEntries: ['/compare'] },
  )
  return render(<ToastProvider><RouterProvider router={router} /></ToastProvider>)
}

function mockData() {
  api.listVolumes.mockResolvedValue(VOLUMES)
  api.listAllVolumeWorks.mockResolvedValue(VW)
  api.listAllParts.mockResolvedValue(PARTS)
}

test('권별 카드에 부 그룹·작품·중복 강조를 표시한다', async () => {
  mockData()
  renderPage()
  await waitFor(() => expect(screen.getByText('1권 삶')).toBeInTheDocument())
  expect(screen.getByText('2권 성장')).toBeInTheDocument()
  const v1 = screen.getByRole('region', { name: '1권 삶' })
  expect(within(v1).getByText('1부 시')).toBeInTheDocument()
  expect(screen.getAllByText('소나기')).toHaveLength(2)      // 두 권 모두
  expect(screen.getAllByText(/^⚠ [\d·]+권$/)).toHaveLength(2)   // 겹침 강조 2곳 (부 확인 경고와 구분)
  expect(screen.getByText('산유화')).toBeInTheDocument()
})

test('부 안에서 고전 작품을 먼저, 현대 작품을 나중에 보여 주고 각 작품에 고전/현대를 표시한다', async () => {
  mockData()
  renderPage()
  const v1 = await screen.findByRole('region', { name: '1권 삶' })
  const items = within(v1).getAllByRole('listitem')
  expect(items.map(li => within(li).queryByText(/소나기|홍길동전|산유화/)?.textContent))
    .toEqual(['홍길동전', '소나기', '산유화'])               // 보드 순서는 소나기(10)→홍길동전(30)이지만 고전이 먼저
  expect(within(items[0]).getByText('고전')).toBeInTheDocument()
  expect(within(items[1]).getByText('현대')).toBeInTheDocument()
})

test('권 머리와 부 띠에 편수와 고전·현대 비중을 보여 준다', async () => {
  mockData()
  renderPage()
  const v1 = await screen.findByRole('region', { name: '1권 삶' })
  expect(within(v1).getByText('3편 · 고전 1 · 현대 2 · 선정중')).toBeInTheDocument()
  const band = within(v1).getByText('1부 시').closest('[data-part-band]')
  expect(within(band).getByText('2편')).toBeInTheDocument()
  expect(within(band).getByText('고전 1 · 현대 1')).toBeInTheDocument()
})

test('부가 정해지지 않은 작품은 미배정 띠로 눈에 띄게 묶는다', async () => {
  mockData()
  renderPage()
  const v1 = await screen.findByRole('region', { name: '1권 삶' })
  const band = within(v1).getByText('미배정').closest('[data-part-band]')
  expect(within(band).getByText(/부를 정해 주세요/)).toBeInTheDocument()
})

test('구성 요약표: 부 × 권으로 편수와 고전·현대 비중을 보여 준다', async () => {
  mockData()
  renderPage()
  const table = await screen.findByRole('table', { name: '구성 요약' })
  const rows = within(table).getAllByRole('row')
  expect(rows.map(r => r.querySelector('th').textContent))
    .toEqual(['구성 요약', '1부 시', '미배정', '부 없음'])
  expect(within(rows[0]).getByText('1권')).toBeInTheDocument()
  expect(within(rows[1]).getByText('고전 1 · 현대 1')).toBeInTheDocument()
  expect(within(rows[3]).getByText('현대 1')).toBeInTheDocument() // 2권(부 없음)의 소나기
})

test("'확정만 보기'가 후보를 숨긴다", async () => {
  mockData()
  renderPage()
  await waitFor(() => screen.getByText('산유화'))
  await userEvent.click(screen.getByLabelText('확정만 보기'))
  expect(screen.queryByText('산유화')).not.toBeInTheDocument()
  expect(screen.getAllByText('소나기')).toHaveLength(1)      // v1의 확정본만
})

test("'엑셀로 저장'은 화면의 '확정만 보기' 상태 그대로 내려받는다", async () => {
  mockData()
  renderPage()
  await waitFor(() => screen.getByText('산유화'))
  await userEvent.click(screen.getByLabelText('확정만 보기'))
  await userEvent.click(screen.getByRole('button', { name: '엑셀로 저장' }))
  expect(downloadCompareExcel).toHaveBeenCalledWith({ volumes: VOLUMES, allVw: VW, allParts: PARTS, confirmedOnly: true })
})
