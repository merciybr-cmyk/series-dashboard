import { render, screen, waitFor } from '@testing-library/react'
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
}))
const api = await import('../board/volumeApi.js')
const { default: GenrePicksPage } = await import('../board/GenrePicksPage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

function renderPage() {
  return render(<ToastProvider><GenrePicksPage /></ToastProvider>)
}

test('후보를 갈래 탭으로 분류해 보여준다', async () => {
  api.listPicks.mockResolvedValue([
    { id: 'p1', work_id: 'W1', work_snapshot: { title: '진달래꽃', author: '김소월', genre: '시' } },
    { id: 'p2', work_id: 'W2', work_snapshot: { title: '춘향전', author: '미상', genre: '고전산문' } },
  ])
  renderPage()
  await waitFor(() => expect(screen.getByRole('button', { name: /현대시 \(1\)/ })).toBeInTheDocument())
  expect(screen.getByRole('button', { name: /고전산문 \(1\)/ })).toBeInTheDocument()
  // 기본 탭(현대시)의 후보가 보인다 — 후보 행 고유 요소(제거 버튼)로 확인 (검색 패널과 작품명 중복 방지)
  expect(screen.getByRole('button', { name: '진달래꽃 제거' })).toBeInTheDocument()
  expect(screen.queryByText('춘향전')).not.toBeInTheDocument()
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
