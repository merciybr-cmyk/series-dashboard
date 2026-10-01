import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../works/useWorksData.js', () => ({
  useWorksData: () => ({
    works: [{ '작품명': '진달래꽃', '지은이': '김소월', _authorBase: '김소월', '장르': '시', '교육과정': '7차', _titleChosung: 'ㅈㄷㄹㄲ', _authorChosung: 'ㄱㅅㅇ' }],
    loading: false, error: null, retry: () => {},
  }),
}))
vi.mock('../board/volumeApi.js', () => ({
  listPicks: vi.fn(),
  addPick: vi.fn(),
  deletePick: vi.fn(),
  listRegistry: vi.fn().mockResolvedValue([]),
  listAllVolumeWorks: vi.fn().mockResolvedValue([]),
  listVolumes: vi.fn().mockResolvedValue([]),
  updatePickConcept: vi.fn(),
}))
vi.mock('../board/exportPicks.js', () => ({ downloadBucketExcel: vi.fn(), downloadAllExcel: vi.fn() }))
const api = await import('../board/volumeApi.js')
const exportPicks = await import('../board/exportPicks.js')
const { default: GenrePicksPage } = await import('../board/GenrePicksPage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

function renderPage() {
  return render(<ToastProvider><GenrePicksPage /></ToastProvider>)
}

test('후보를 갈래 탭으로 분류해 보여준다', async () => {
  api.listPicks.mockResolvedValue([
    { id: 'p1', work_id: 'W1', work_snapshot: { title: '진달래꽃', author: '김소월', genre: '시', curriculum: ['7차', '2015개정'] } },
    { id: 'p2', work_id: 'W2', work_snapshot: { title: '춘향전', author: '미상', genre: '고전산문' } },
  ])
  renderPage()
  await waitFor(() => expect(screen.getByRole('button', { name: /현대시 \(1\)/ })).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /고전산문 \(1\)/ })).toBeInTheDocument()
  // 기본 탭(현대시)의 후보가 보인다 — 후보 행 고유 요소(제거 버튼)로 확인 (검색 패널과 작품명 중복 방지)
  expect(screen.getByRole('button', { name: '진달래꽃 제거' })).toBeInTheDocument()
  expect(screen.queryByText('춘향전')).not.toBeInTheDocument()
  // 수록 교육과정 표시
  expect(screen.getByText('7차 · 2015개정')).toBeInTheDocument()
  // 탭 전환
  await userEvent.click(screen.getByRole('button', { name: /고전산문/ }))
  expect(screen.getByText('춘향전')).toBeInTheDocument()
})

test('검색에서 추가하면 addPick이 호출되고 목록에 나타난다', async () => {
  api.listPicks.mockResolvedValue([])
  api.addPick.mockResolvedValue({ id: 'p9', work_id: 'W9', work_snapshot: { title: '진달래꽃', author: '김소월', genre: '시' } })
  renderPage()
  await waitFor(() => screen.getAllByRole('button', { name: '추가' }))
  await userEvent.click(screen.getAllByRole('button', { name: '추가' })[0])
  expect(api.addPick).toHaveBeenCalled()
  await waitFor(() => expect(screen.getByRole('button', { name: '진달래꽃 제거' })).toBeInTheDocument())
})

test('추가하면 그 작품의 갈래 탭으로 전환되고 안내 토스트가 뜬다', async () => {
  api.listPicks.mockResolvedValue([])
  api.addPick.mockResolvedValue({ id: 'p9', work_id: 'W9', work_snapshot: { title: '춘향전', author: '미상', genre: '고전산문' } })
  renderPage()
  await waitFor(() => screen.getAllByRole('button', { name: '추가' }))
  // 기본 탭은 현대시 — 고전산문 작품을 추가하면 고전산문 탭으로 자동 전환돼 바로 보인다
  await userEvent.click(screen.getAllByRole('button', { name: '추가' })[0])
  await waitFor(() => expect(screen.getByRole('button', { name: '춘향전 제거' })).toBeInTheDocument())
  expect(screen.getByText(/고전산문 후보에 추가했습니다/)).toBeInTheDocument()
})

test('후보 제거는 confirm 후 목록에서 사라진다', async () => {
  api.listPicks.mockResolvedValue([
    { id: 'p1', work_id: 'W1', work_snapshot: { title: '진달래꽃', author: '김소월', genre: '시' } },
  ])
  api.deletePick.mockResolvedValue()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderPage()
  await waitFor(() => screen.getByRole('button', { name: '진달래꽃 제거' }))
  await userEvent.click(screen.getByRole('button', { name: '진달래꽃 제거' }))
  expect(api.deletePick).toHaveBeenCalledWith('p1')
  await waitFor(() => expect(screen.queryByRole('button', { name: '진달래꽃 제거' })).not.toBeInTheDocument())
  window.confirm.mockRestore()
})

test("'어울리는 권' 칩으로 콘셉트 태그를 편집한다", async () => {
  api.listVolumes.mockResolvedValue([
    { id: 'v7', number: 7, title: '문학과 함께 자라는 우리' },
    { id: 'v8', number: 8, title: '내일을 여는 문학 수업' },
  ])
  api.listPicks.mockResolvedValue([
    { id: 'p1', work_id: 'W1', concept_volume_ids: ['v7'], work_snapshot: { title: '봄 길', author: '정호승', genre: '시', curriculum: [] } },
  ])
  api.updatePickConcept.mockResolvedValue({})
  renderPage()
  const chip = await screen.findByRole('button', { name: '봄 길 어울리는 권' })
  await waitFor(() => expect(chip).toHaveTextContent('7권')) // 권 목록은 후보와 따로 로드된다
  await userEvent.click(chip)
  await userEvent.click(screen.getByRole('checkbox', { name: /8권/ }))
  expect(api.updatePickConcept).toHaveBeenCalledWith('p1', ['v7', 'v8'])
  await waitFor(() => expect(chip).toHaveTextContent('7권 8권'))
})

test('phase5 전(concept_volume_ids 없음)에는 칩을 보이지 않는다', async () => {
  api.listPicks.mockResolvedValue([
    { id: 'p1', work_id: 'W1', work_snapshot: { title: '봄 길', author: '정호승', genre: '시', curriculum: [] } },
  ])
  renderPage()
  await screen.findByRole('button', { name: '봄 길 제거' })
  expect(screen.queryByRole('button', { name: '봄 길 어울리는 권' })).not.toBeInTheDocument()
})

test("'태그 없음' 버튼으로 태그가 빈 후보만 걸러 본다", async () => {
  api.listVolumes.mockResolvedValue([{ id: 'v7', number: 7, title: '온도' }])
  api.listPicks.mockResolvedValue([
    { id: 'p1', work_id: 'W1', concept_volume_ids: ['v7'], work_snapshot: { title: '봄 길', author: '정호승', genre: '시', curriculum: [] } },
    { id: 'p2', work_id: 'W2', concept_volume_ids: [], work_snapshot: { title: '이별가', author: '박목월', genre: '시', curriculum: [] } },
  ])
  renderPage()
  const filter = await screen.findByRole('button', { name: '태그 없음 1' })
  expect(screen.getByRole('button', { name: '봄 길 제거' })).toBeInTheDocument()
  await userEvent.click(filter)
  expect(screen.queryByRole('button', { name: '봄 길 제거' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '이별가 제거' })).toBeInTheDocument()
  await userEvent.click(filter)
  expect(screen.getByRole('button', { name: '봄 길 제거' })).toBeInTheDocument()
})

const AUTHOR_PICKS = [
  { id: 'p1', work_id: 'W1', work_snapshot: { title: '향수', author: '정지용', genre: '시', curriculum: [] } },
  { id: 'p2', work_id: 'W2', work_snapshot: { title: '진달래꽃', author: '김소월', genre: '시', curriculum: [] } },
  { id: 'p3', work_id: 'W3', work_snapshot: { title: '정읍사', author: '', genre: '시', curriculum: [] } },
  { id: 'p4', work_id: 'W4', work_snapshot: { title: '유리창', author: '정지용', genre: '시', curriculum: [] } },
]
const rowOrder = () => screen.getAllByRole('button', { name: / 제거$/ }).map(b => b.getAttribute('aria-label').replace(/ 제거$/, ''))

test('기본은 작가별: 작가 가나다순으로 묶고, 2편 이상인 작가는 머리줄, 작가 미상은 맨 끝', async () => {
  api.listPicks.mockResolvedValue(AUTHOR_PICKS)
  renderPage()
  await screen.findByRole('button', { name: '향수 제거' })
  expect(screen.getByRole('button', { name: '작가별' })).toHaveAttribute('aria-pressed', 'true')
  expect(rowOrder()).toEqual(['진달래꽃', '향수', '유리창', '정읍사'])
  const header = screen.getByText('정지용', { selector: '[data-author-header] *' }).closest('[data-author-header]')
  expect(within(header).getByText('2편')).toBeInTheDocument()
  expect(document.querySelectorAll('[data-author-header]')).toHaveLength(1) // 1편뿐인 김소월·작가 미상은 머리줄 없음
})

test("'선정순'을 누르면 선정한 순서로 돌아가고 머리줄이 사라진다", async () => {
  api.listPicks.mockResolvedValue(AUTHOR_PICKS)
  renderPage()
  await screen.findByRole('button', { name: '향수 제거' })
  await userEvent.click(screen.getByRole('button', { name: '선정순' }))
  expect(rowOrder()).toEqual(['향수', '진달래꽃', '정읍사', '유리창'])
  expect(document.querySelectorAll('[data-author-header]')).toHaveLength(0)
})

test('엑셀도 화면에서 고른 정렬을 따른다', async () => {
  api.listPicks.mockResolvedValue(AUTHOR_PICKS)
  renderPage()
  await screen.findByRole('button', { name: '향수 제거' })
  await userEvent.click(screen.getByRole('button', { name: '현재 갈래 엑셀' }))
  expect(exportPicks.downloadBucketExcel.mock.calls.at(-1)[0].map(p => p.id)).toEqual(['p2', 'p1', 'p4', 'p3'])
  await userEvent.click(screen.getByRole('button', { name: '전체 엑셀 (갈래별 시트)' }))
  expect(exportPicks.downloadAllExcel).toHaveBeenLastCalledWith(AUTHOR_PICKS, { byAuthor: true })
  await userEvent.click(screen.getByRole('button', { name: '선정순' }))
  await userEvent.click(screen.getByRole('button', { name: '현재 갈래 엑셀' }))
  expect(exportPicks.downloadBucketExcel.mock.calls.at(-1)[0].map(p => p.id)).toEqual(['p1', 'p2', 'p3', 'p4'])
  await userEvent.click(screen.getByRole('button', { name: '전체 엑셀 (갈래별 시트)' }))
  expect(exportPicks.downloadAllExcel).toHaveBeenLastCalledWith(AUTHOR_PICKS, { byAuthor: false })
})
