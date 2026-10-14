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

// 2026-10-14: 부 하나만 보기 — 회의 때 1부 줄에서 모든 권을 한 화면에 모아 본다
test("'보는 부'에서 부를 고르면 그 부만 남고, 그 부가 없는 권은 안내만 보인다; 요약표는 그대로", async () => {
  mockData()
  renderPage()
  await waitFor(() => screen.getByText('산유화'))
  const group = screen.getByRole('radiogroup', { name: '보는 부' })
  expect(within(group).getAllByRole('radio').map(r => r.textContent)).toEqual(['전체', '1부 시', '미배정'])
  expect(within(group).getByRole('radio', { name: '전체' })).toHaveAttribute('aria-checked', 'true')

  await userEvent.click(within(group).getByRole('radio', { name: '1부 시' }))
  expect(screen.queryByText('산유화')).not.toBeInTheDocument()          // 1권 미배정
  expect(screen.getAllByText('소나기')).toHaveLength(1)                   // 2권(부 없음)의 소나기는 숨김
  expect(within(screen.getByRole('region', { name: '2권 성장' })).getByText('이 권에는 1부 시가 없습니다')).toBeInTheDocument()
  const table = screen.getByRole('table', { name: '구성 요약' })
  expect(within(table).getAllByRole('row')).toHaveLength(4)
  expect(within(table).getByRole('row', { name: /1부 시/ })).toHaveAttribute('aria-current', 'true')
  expect(document.querySelector('[data-compare-grid]').className).toMatch(/grid-cols-8/) // 넓은 화면에선 8권 한 줄

  await userEvent.click(within(group).getByRole('radio', { name: '미배정' }))
  expect(screen.getByText('산유화')).toBeInTheDocument()
  expect(screen.queryByText('소나기')).not.toBeInTheDocument()

  await userEvent.click(within(group).getByRole('radio', { name: '전체' }))
  expect(screen.getAllByText('소나기')).toHaveLength(2)
})

test("편집 중에도 '보는 부'를 쓸 수 있고, 보이지 않는 부로 옮기면 안내가 뜬다", async () => {
  mockData()
  renderPage()
  await waitFor(() => screen.getByText('산유화'))
  await userEvent.click(screen.getByRole('button', { name: '편집' }))
  await screen.findByText(/편집 중/)
  const group = screen.getByRole('radiogroup', { name: '보는 부' })
  await userEvent.click(within(group).getByRole('radio', { name: '1부 시' }))
  expect(screen.queryByText('산유화')).not.toBeInTheDocument()

  const v1 = screen.getByRole('region', { name: '1권 삶' })
  await userEvent.click(within(v1).getByRole('button', { name: '「홍길동전」 메뉴' }))
  const dlg = screen.getByRole('dialog', { name: '「홍길동전」 메뉴' })
  await userEvent.selectOptions(within(dlg).getByLabelText('권'), 'v2')
  await userEvent.click(within(dlg).getByRole('button', { name: '옮기기' }))
  expect(screen.queryByText('홍길동전')).not.toBeInTheDocument()          // 2권은 부가 없어 1부 보기에서 숨김
  expect(await screen.findByText(/「홍길동전」.*화면에서는 안 보입니다/)).toBeInTheDocument()
  expect(screen.getByText(/바뀐 작품 1건/)).toBeInTheDocument()
})
