import { render, screen, waitFor, within } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: () => ({ member: { id: 'm1', name: '윤보라' }, session: {}, loading: false }),
}))
vi.mock('../board/volumeApi.js', () => ({
  listVolumes: vi.fn(),
  listAllVolumeWorks: vi.fn(),
  listAllTasks: vi.fn(),
  listAllFiles: vi.fn(),
  listActivity: vi.fn(),
  listMembers: vi.fn(),
  listSchedules: vi.fn().mockResolvedValue([]),
  subscribeBoard: vi.fn(() => () => {}),
}))
const api = await import('../board/volumeApi.js')
const { default: HomePage } = await import('../pages/HomePage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

const VWROW = {
  id: 'vw1', volume_id: 'v1', work_id: 'W1', selection_status: 'confirmed',
  work_snapshot: { title: '소나기', author: '황순원' }, volumes: { number: 1, title: '삶' },
}

// due_date는 실행 시점 기준 항상 미래여야 한다 (과거이면 '주의 필요'의 지연 규칙과 충돌해
// '내 할 일'과 텍스트가 중복 표시된다). 고정 날짜 대신 상대 계산으로 날짜 드리프트를 방지한다.
function futureDateStr(daysAhead) {
  const d = new Date()
  d.setDate(d.getDate() + daysAhead)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function setup({ tasks = [], vworks = [VWROW], files = [], activity = [], schedules = [] } = {}) {
  api.listVolumes.mockResolvedValue([{ id: 'v1', number: 1, title: '삶', status: '선정중' }])
  api.listAllVolumeWorks.mockResolvedValue(vworks)
  api.listAllTasks.mockResolvedValue(tasks)
  api.listAllFiles.mockResolvedValue(files)
  api.listActivity.mockResolvedValue(activity)
  api.listMembers.mockResolvedValue([{ id: 'm1', name: '윤보라' }])
  api.listSchedules.mockResolvedValue(schedules)
  return render(<ToastProvider><HashRouter><HomePage /></HashRouter></ToastProvider>)
}

test('내 할 일이 우선순위와 딥링크로 표시된다', async () => {
  setup({
    tasks: [
      { id: 't1', title: '해제 작성', status: 'todo', assignee_id: 'm1', due_date: futureDateStr(30), volume_works: VWROW },
      { id: 't2', title: '남의 업무', status: 'todo', assignee_id: 'm2', due_date: futureDateStr(30), volume_works: VWROW },
    ],
  })
  await waitFor(() => expect(screen.getByText(/해제 작성/)).toBeInTheDocument())
  expect(screen.queryByText(/남의 업무/)).not.toBeInTheDocument()
  const link = screen.getByRole('link', { name: /해제 작성/ })
  expect(link).toHaveAttribute('href', '#/volumes/v1?vw=vw1')
})

test('주의 필요: 확정인데 업무·자료 없음이 표시된다', async () => {
  setup()
  await waitFor(() => expect(screen.getByText(/확정 작품인데 업무가 없습니다/)).toBeInTheDocument())
  expect(screen.getByText(/확정 작품인데 자료가 없습니다/)).toBeInTheDocument()
})

test('권별 진행 현황과 최근 활동 문구가 나온다', async () => {
  setup({
    tasks: [{ id: 't1', title: 'x', status: 'done', assignee_id: null, due_date: null, volume_works: VWROW }],
    activity: [{ id: 1, table_name: 'volume_works', action: 'insert', diff: { work_snapshot: { title: '소나기' } }, actor_id: 'm1', created_at: '2026-08-25T09:00:00Z' }],
  })
  await waitFor(() => expect(screen.getByText(/1권 삶/)).toBeInTheDocument())
  expect(screen.getByText(/윤보라님이 「소나기」을\(를\) 추가했습니다/)).toBeInTheDocument()
})

test('할 일이 없으면 빈 안내가 나온다', async () => {
  setup({ vworks: [] })
  await waitFor(() => expect(screen.getByText(/오늘 처리할 업무가 없습니다/)).toBeInTheDocument())
})

test('확인 대상자인 일정이 내 할 일에 📅로 뜬다', async () => {
  setup({
    schedules: [
      { id: 's1', title: '편집회의', kind: '회의', due_date: futureDateStr(3), volume_id: null, attendee_ids: ['m1'], done: false },
      { id: 's2', title: '남의 회의', kind: '회의', due_date: futureDateStr(3), volume_id: null, attendee_ids: ['m2'], done: false },
    ],
  })
  await waitFor(() => expect(screen.getByText('내 할 일')).toBeInTheDocument())
  const myCard = screen.getByText('내 할 일').closest('section')
  await waitFor(() => expect(within(myCard).getByText(/📅 회의 · 편집회의/)).toBeInTheDocument())
  expect(screen.queryAllByText(/남의 회의/).length).toBeGreaterThan(0) // 다가오는 마감에는 전체 표시
  expect(within(myCard).queryByText(/남의 회의/)).not.toBeInTheDocument()
})
