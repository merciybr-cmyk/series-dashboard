import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router-dom'
import { vi } from 'vitest'

// works 배열은 팩토리 안에서 한 번만 만든다 — 렌더마다 새 배열이면 페이지의 계산 effect가 무한 반복된다
vi.mock('../works/useWorksData.js', () => {
  const row = (title, author, cur) => ({ '작품명': title, '지은이': author, _authorBase: author, '장르': '시', '교육과정': cur })
  const works = [
    row('진달래꽃', '김소월', '1차'), row('진달래꽃', '김소월', '4차'),
    row('서시', '윤동주', '4차'),
    row('해에게서 소년에게', '최남선', '3차'),
  ]
  return { useWorksData: () => ({ works, loading: false, error: null, retry: () => {} }) }
})
vi.mock('../board/volumeApi.js', () => ({
  listVolumes: vi.fn(), listPicks: vi.fn(), listAllVolumeWorks: vi.fn(), listRegistry: vi.fn(),
  listMembers: vi.fn(), listPlacementBatches: vi.fn(), listAllParts: vi.fn(),
  createPlacementBatch: vi.fn(), updatePlacementBatch: vi.fn(), createPart: vi.fn(), insertPlacedWork: vi.fn(),
  listBatchWorks: vi.fn(), listAttachmentRefs: vi.fn(), deleteVolumeWorks: vi.fn(),
  listNonEmptyPartIds: vi.fn(), deletePart: vi.fn(),
  isMissingSchemaError: err => /placement_batches|does not exist/.test(err?.message || ''),
}))
vi.mock('../board/exportPlacement.js', () => ({ downloadPlacementExcel: vi.fn() }))
const api = await import('../board/volumeApi.js')
const { default: AutoPlacePage } = await import('../board/AutoPlacePage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

const VOLUMES = [
  { id: 'v1', number: 1, title: '첫 장면', curricula: ['1차', '2차', '3차'] },
  { id: 'v2', number: 2, title: '정전', curricula: ['4차'] },
]
const pick = (id, workId, title, author) => ({ id, work_id: workId, concept_volume_ids: [], work_snapshot: { title, author, genre: '시', curriculum: [] } })

beforeEach(() => {
  vi.clearAllMocks()
  api.listVolumes.mockResolvedValue(VOLUMES)
  api.listPicks.mockResolvedValue([
    pick('p1', 'W1', '진달래꽃', '김소월'),
    pick('p2', 'W2', '서시', '윤동주'),
    pick('p3', 'W3', '해에게서 소년에게', '최남선'),
  ])
  api.listAllVolumeWorks.mockResolvedValue([])
  api.listRegistry.mockResolvedValue([
    { work_id: 'W1', title: '진달래꽃', author_base: '김소월', aliases: [] },
    { work_id: 'W2', title: '서시', author_base: '윤동주', aliases: [] },
    { work_id: 'W3', title: '해에게서 소년에게', author_base: '최남선', aliases: [] },
  ])
  api.listMembers.mockResolvedValue([{ id: 'm1', name: '윤보라' }])
  api.listPlacementBatches.mockResolvedValue([])
  api.listAllParts.mockResolvedValue([])
})

function renderPage() {
  return render(<ToastProvider><HashRouter><AutoPlacePage /></HashRouter></ToastProvider>)
}
const column = n => screen.getByRole('region', { name: `${n}권 배치안` })

test('현대시 배치안을 권별 열로 보여 준다', async () => {
  renderPage()
  await waitFor(() => expect(within(column(1)).getByText('진달래꽃')).toBeInTheDocument())
  expect(within(column(1)).getByText('해에게서 소년에게')).toBeInTheDocument()
  expect(within(column(2)).getByText('서시')).toBeInTheDocument()
  expect(within(column(1)).getByText('기존 0 + 신규 2')).toBeInTheDocument()
  expect(within(column(2)).getAllByText('첫 수록').length).toBeGreaterThan(0)
})

test('권 이동과 빼기가 즉시 반영된다', async () => {
  renderPage()
  await waitFor(() => within(column(1)).getByText('진달래꽃'))
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '진달래꽃 권 이동' }), 'v2')
  expect(within(column(1)).getByText('기존 0 + 신규 1')).toBeInTheDocument()
  expect(within(column(2)).getByText('진달래꽃')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '서시 빼기' }))
  const tray = screen.getByRole('region', { name: '보류함' })
  expect(within(tray).getByText('서시')).toBeInTheDocument()
  expect(within(tray).getByText('직접 뺌')).toBeInTheDocument()
})

test('적용하면 부를 확보하고 한 편씩 추가한 뒤 요약을 보여 준다', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  api.createPlacementBatch.mockResolvedValue({ id: 'b1' })
  api.createPart.mockImplementation(vid => Promise.resolve({ id: `part-${vid}` }))
  api.insertPlacedWork.mockResolvedValue({ id: 'row' })
  api.updatePlacementBatch.mockResolvedValue({})
  renderPage()
  await waitFor(() => within(column(1)).getByText('진달래꽃'))
  await userEvent.click(screen.getByRole('button', { name: '적용' }))
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('현대시 3편 → 1권 2 · 2권 1'))
  await waitFor(() => expect(screen.getByText(/3편을 추가했습니다/)).toBeInTheDocument())
  expect(api.createPart).toHaveBeenCalledWith('v1', 1, '시')
  expect(api.insertPlacedWork).toHaveBeenCalledWith(expect.objectContaining({ workId: 'W2', volumeId: 'v2', partId: 'part-v2', batchId: 'b1' }))
})

test('적용 기록에서 되돌리면 요약을 보여 준다', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  api.listPlacementBatches.mockResolvedValue([
    { id: 'b1', genre: '현대시', item_count: 2, created_by: 'm1', created_at: '2026-09-28T01:00:00Z', undone_at: null, created_part_ids: [] },
  ])
  api.listBatchWorks.mockResolvedValue([
    { id: 'r1', selection_status: 'candidate', work_snapshot: { title: '풀' }, volumes: { number: 3 } },
    { id: 'r2', selection_status: 'confirmed', work_snapshot: { title: '서시' }, volumes: { number: 2 } },
  ])
  api.listAttachmentRefs.mockResolvedValue({ tasks: [], comments: [], files: [] })
  api.deleteVolumeWorks.mockResolvedValue()
  api.listNonEmptyPartIds.mockResolvedValue([])
  api.updatePlacementBatch.mockResolvedValue({})
  renderPage()
  const history = await screen.findByRole('region', { name: '적용 기록' })
  expect(within(history).getByText(/윤보라/)).toBeInTheDocument()
  await userEvent.click(within(history).getByRole('button', { name: '되돌리기' }))
  await waitFor(() => expect(screen.getByText('1편을 뺐습니다. 1편은 남겼습니다: 〈서시〉(2권 확정)')).toBeInTheDocument())
  expect(api.deleteVolumeWorks).toHaveBeenCalledWith(['r1'])
})

test('phase5.sql 미실행이면 안내한다', async () => {
  api.listPlacementBatches.mockRejectedValue(new Error('relation "public.placement_batches" does not exist'))
  renderPage()
  await waitFor(() => expect(screen.getByText(/phase5\.sql/)).toBeInTheDocument())
})
