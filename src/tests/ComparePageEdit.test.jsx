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

async function startEdit() {
  await userEvent.click(await screen.findByRole('button', { name: '편집' }))
  await screen.findByText(/편집 중/)
}
async function openMenu(regionName, title) {
  await userEvent.click(within(region(regionName)).getByRole('button', { name: `「${title}」 메뉴` }))
  return screen.getByRole('dialog', { name: `「${title}」 메뉴` })
}

test('편집을 누르면 새로 읽고, 편집 중 바와 작품 메뉴가 나오며 엑셀·확정만 보기는 숨긴다', async () => {
  renderPage()
  await startEdit()
  expect(api.listAllVolumeWorks).toHaveBeenCalledTimes(2)
  expect(screen.getByText('편집 중 · 바뀐 작품 0건')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '엑셀로 저장' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('확정만 보기')).not.toBeInTheDocument()
  expect(within(region('1권 첫 장면')).getByRole('button', { name: '「소나기」 메뉴' })).toBeInTheDocument()
  expect(within(region('1권 첫 장면')).queryByRole('link')).not.toBeInTheDocument() // 편집 중엔 권 보드 링크 끔
})

test('메뉴로 다른 권에 옮기면 그 권에 표시되고 편수가 바뀐다 (부는 갈래로 미리 고름)', async () => {
  renderPage()
  await startEdit()
  const dlg = await openMenu('1권 첫 장면', '소나기')
  await userEvent.selectOptions(within(dlg).getByLabelText('권'), 'v2')
  expect(within(dlg).getByLabelText('부')).toHaveValue('q2')
  await userEvent.click(within(dlg).getByRole('button', { name: '옮기기' }))
  expect(within(region('2권 오래 남을')).getByText('소나기')).toBeInTheDocument()
  expect(within(region('2권 오래 남을')).getByText('1권에서')).toBeInTheDocument()
  expect(within(region('1권 첫 장면')).queryByText('소나기')).not.toBeInTheDocument()
  expect(within(region('1권 첫 장면')).getByText('1편 · 현대 1 · 기획')).toBeInTheDocument()
  expect(screen.getByText('편집 중 · 바뀐 작품 1건')).toBeInTheDocument()
})

test('같은 작품이 있는 권은 메뉴에서 고를 수 없다', async () => {
  renderPage()
  await startEdit()
  const dlg = await openMenu('1권 첫 장면', '산유화')
  expect(within(dlg).getByRole('option', { name: '2권 (이미 있음)' })).toBeDisabled()
})

test('빼면 취소선과 되돌리기가 생기고, 되돌리면 원래대로', async () => {
  renderPage()
  await startEdit()
  const dlg = await openMenu('1권 첫 장면', '소나기')
  await userEvent.click(within(dlg).getByRole('button', { name: '권에서 빼기' }))
  expect(within(region('1권 첫 장면')).getByText('소나기').parentElement).toHaveClass('line-through')
  expect(screen.getByText('편집 중 · 바뀐 작품 1건')).toBeInTheDocument()
  await userEvent.click(within(region('1권 첫 장면')).getByRole('button', { name: '되돌리기' }))
  expect(screen.getByText('편집 중 · 바뀐 작품 0건')).toBeInTheDocument()
})

test('바뀐 것이 있을 때 취소하면 확인을 묻는다', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  renderPage()
  await startEdit()
  await userEvent.click(within(await openMenu('1권 첫 장면', '소나기')).getByRole('button', { name: '권에서 빼기' }))
  await userEvent.click(screen.getByRole('button', { name: '취소' }))
  expect(confirm).toHaveBeenCalledWith('저장하지 않은 변경 1건이 있습니다. 나가면 사라집니다.')
  expect(screen.getByText(/편집 중/)).toBeInTheDocument()
  confirm.mockReturnValue(true)
  await userEvent.click(screen.getByRole('button', { name: '취소' }))
  expect(screen.getByRole('button', { name: '편집' })).toBeInTheDocument()
  expect(within(region('1권 첫 장면')).getByText('소나기').parentElement).not.toHaveClass('line-through')
  confirm.mockRestore()
})

test('저장하지 않고 다른 화면으로 가려 하면 확인을 묻는다', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const router = renderPage()
  await startEdit()
  await userEvent.click(within(await openMenu('1권 첫 장면', '소나기')).getByRole('button', { name: '권에서 빼기' }))
  await act(async () => { router.navigate('/') })
  expect(confirm).toHaveBeenCalled()
  expect(screen.getByText(/편집 중/)).toBeInTheDocument()
  confirm.mockReturnValue(true)
  await act(async () => { router.navigate('/') })
  expect(await screen.findByText('홈 화면')).toBeInTheDocument()
  confirm.mockRestore()
})

// 확인 창의 저장 버튼은 딸린 자료 조회가 끝나야 켜진다
async function clickSaveIn(confirmBox) {
  const btn = within(confirmBox).getByRole('button', { name: '저장' })
  await waitFor(() => expect(btn).toBeEnabled())
  await userEvent.click(btn)
}

test('저장: 확인 창에 요약·목록·딸린 업무 경고를 보이고, 저장하면 반영한 뒤 결과를 알린다', async () => {
  api.listAttachmentRefs.mockResolvedValue({ tasks: ['d'], comments: [], files: [] })
  renderPage()
  await startEdit()
  let dlg = await openMenu('1권 첫 장면', '소나기')
  await userEvent.selectOptions(within(dlg).getByLabelText('권'), 'v2')
  await userEvent.click(within(dlg).getByRole('button', { name: '옮기기' }))
  dlg = await openMenu('2권 오래 남을', '산유화')
  await userEvent.click(within(dlg).getByRole('button', { name: '권에서 빼기' }))

  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  const confirmBox = await screen.findByRole('dialog', { name: '저장 확인' })
  expect(within(confirmBox).getByText('옮기기 1 · 넣기 0 · 빼기 1')).toBeInTheDocument()
  expect(within(confirmBox).getByText('〈소나기〉 1권 2부 → 2권 2부')).toBeInTheDocument()
  expect(within(confirmBox).getByText('〈산유화〉 2권 1부에서 빼기')).toBeInTheDocument()
  expect(await within(confirmBox).findByText('업무 1건이 함께 지워집니다')).toBeInTheDocument()
  expect(api.listAttachmentRefs).toHaveBeenCalledWith(['d'])

  await clickSaveIn(confirmBox)
  expect(await screen.findByText('반영했습니다: 옮기기 1 · 넣기 0 · 빼기 1')).toBeInTheDocument()
  expect(api.deleteVolumeWork).toHaveBeenCalledWith('d')
  expect(api.updateVolumeWork).toHaveBeenCalledWith('a', { volume_id: 'v2', part_id: 'q2', sort_order: 20 })
  expect(screen.getByRole('button', { name: '편집' })).toBeInTheDocument()
  expect(api.listAllVolumeWorks).toHaveBeenCalledTimes(4) // 처음·편집 시작·저장 직전·저장 뒤
})

test('저장 직전 다시 읽기에 실패하면 편집을 유지한다', async () => {
  renderPage()
  await startEdit()
  await userEvent.click(within(await openMenu('1권 첫 장면', '소나기')).getByRole('button', { name: '권에서 빼기' }))
  api.listAllVolumeWorks.mockRejectedValueOnce(new Error('연결이 끊겼습니다'))
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  await clickSaveIn(await screen.findByRole('dialog', { name: '저장 확인' }))
  expect(await screen.findByText('연결이 끊겼습니다')).toBeInTheDocument()
  expect(screen.getByText('편집 중 · 바뀐 작품 1건')).toBeInTheDocument()
  expect(api.deleteVolumeWork).not.toHaveBeenCalled()
})

test('작품 넣기 패널: 미배치 후보가 보이고, 넣기 메뉴로 넣으면 새로 표시되며 저장 때 추가된다', async () => {
  renderPage()
  await startEdit()
  await userEvent.click(screen.getByRole('button', { name: '작품 넣기' }))
  const panel = await screen.findByRole('complementary', { name: '작품 넣기 패널' })
  expect(await within(panel).findByText('돌다리')).toBeInTheDocument()
  expect(within(panel).queryByText('소나기')).not.toBeInTheDocument() // 이미 1권에 있음(미배치만)

  await userEvent.click(within(panel).getByRole('button', { name: '「돌다리」 넣기' }))
  const dlg = screen.getByRole('dialog', { name: '「돌다리」 넣기' })
  await userEvent.selectOptions(within(dlg).getByLabelText('권'), 'v2')
  expect(within(dlg).getByLabelText('부')).toHaveValue('q2')
  await userEvent.click(within(dlg).getByRole('button', { name: '넣기' }))
  expect(within(region('2권 오래 남을')).getByText('돌다리')).toBeInTheDocument()
  expect(within(region('2권 오래 남을')).getByText('새로')).toBeInTheDocument()
  expect(within(panel).queryByText('돌다리')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  const confirmBox = await screen.findByRole('dialog', { name: '저장 확인' })
  expect(within(confirmBox).getByText('〈돌다리〉 → 2권 2부 (새로)')).toBeInTheDocument()
  await clickSaveIn(confirmBox)
  await screen.findByText('반영했습니다: 옮기기 0 · 넣기 1 · 빼기 0')
  expect(api.insertPlacedWork).toHaveBeenCalledWith({
    volumeId: 'v2', workId: 'W9', workSnapshot: { title: '돌다리', author: '이태준', genre: '소설', curriculum: ['4차'] },
    partId: 'q2', batchId: null, sortOrder: 30,
  })
  expect(api.ensureWorkId).not.toHaveBeenCalled()
})

test('작품 데이터를 못 불러오면 패널에 오류와 다시 시도', async () => {
  const retry = vi.fn()
  sheetState.current = { works: [], loading: false, error: '작품 데이터를 불러올 수 없습니다 (HTTP 500)', retry }
  renderPage()
  await startEdit()
  await userEvent.click(screen.getByRole('button', { name: '작품 넣기' }))
  const panel = await screen.findByRole('complementary', { name: '작품 넣기 패널' })
  expect(within(panel).getByText('작품 데이터를 불러올 수 없습니다 (HTTP 500)')).toBeInTheDocument()
  await userEvent.click(within(panel).getByRole('button', { name: '다시 시도' }))
  expect(retry).toHaveBeenCalled()
})

test('편집 중에는 작품마다 끌기 손잡이가 있고, 뺀 작품과 보기 모드에는 없다', async () => {
  renderPage()
  await screen.findByText('1권 첫 장면')
  expect(screen.queryAllByRole('button', { name: /끌기$/ })).toHaveLength(0)
  await startEdit()
  expect(screen.getAllByRole('button', { name: /끌기$/ })).toHaveLength(4)
  await userEvent.click(within(await openMenu('1권 첫 장면', '소나기')).getByRole('button', { name: '권에서 빼기' }))
  expect(screen.getAllByRole('button', { name: /끌기$/ })).toHaveLength(3)
})

test('검색 패널 결과에도 끌기 손잡이가 있다', async () => {
  renderPage()
  await startEdit()
  await userEvent.click(screen.getByRole('button', { name: '작품 넣기' }))
  const panel = await screen.findByRole('complementary', { name: '작품 넣기 패널' })
  expect(await within(panel).findByRole('button', { name: '「돌다리」 끌기' })).toBeInTheDocument()
})
