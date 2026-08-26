import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  listSchedules: vi.fn(),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  listVolumes: vi.fn().mockResolvedValue([{ id: 'v1', number: 1, title: '삶', status: '선정중' }]),
  listMembers: vi.fn().mockResolvedValue([{ id: 'm1', name: '윤보라' }, { id: 'm2', name: '김위원' }]),
}))
const api = await import('../board/volumeApi.js')
const { default: SchedulePage } = await import('../board/SchedulePage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')
const { ymd } = await import('../board/calendarUtils.js')

const TODAY = ymd(new Date())

function renderPage() {
  return render(<ToastProvider><SchedulePage /></ToastProvider>)
}

test('오늘 날짜의 일정이 캘린더와 목록에 보인다', async () => {
  api.listSchedules.mockResolvedValue([
    { id: 's1', title: '편집회의', kind: '회의', due_date: TODAY, volume_id: null, attendee_ids: ['m2'], done: false },
  ])
  renderPage()
  await waitFor(() => expect(screen.getAllByText('편집회의').length).toBeGreaterThanOrEqual(1))
  expect(screen.getByText(/김위원/)).toBeInTheDocument() // 목록의 확인 대상자
})

test('일정을 등록하면 createSchedule이 호출된다', async () => {
  api.listSchedules.mockResolvedValue([])
  api.createSchedule.mockResolvedValue({ id: 's9', title: '원고 마감', kind: '마감', due_date: TODAY, volume_id: null, attendee_ids: [], done: false })
  renderPage()
  await waitFor(() => screen.getByLabelText('일정 제목'))
  await userEvent.type(screen.getByLabelText('일정 제목'), '원고 마감')
  await userEvent.selectOptions(screen.getByLabelText('종류'), '마감')
  await userEvent.click(screen.getByRole('button', { name: '일정 등록' }))
  expect(api.createSchedule).toHaveBeenCalledWith(expect.objectContaining({
    title: '원고 마감', kind: '마감', due_date: TODAY,
  }))
  await waitFor(() => expect(screen.getAllByText('원고 마감').length).toBeGreaterThanOrEqual(1))
})

test('완료 체크와 삭제가 동작한다', async () => {
  api.listSchedules.mockResolvedValue([
    { id: 's1', title: '편집회의', kind: '회의', due_date: TODAY, volume_id: null, attendee_ids: [], done: false },
  ])
  api.updateSchedule.mockResolvedValue({ id: 's1', title: '편집회의', kind: '회의', due_date: TODAY, volume_id: null, attendee_ids: [], done: true })
  api.deleteSchedule.mockResolvedValue()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderPage()
  await waitFor(() => screen.getByRole('checkbox', { name: /편집회의 완료/ }))
  await userEvent.click(screen.getByRole('checkbox', { name: /편집회의 완료/ }))
  expect(api.updateSchedule).toHaveBeenCalledWith('s1', { done: true })
  await userEvent.click(screen.getByRole('button', { name: '편집회의 삭제' }))
  expect(api.deleteSchedule).toHaveBeenCalledWith('s1')
  window.confirm.mockRestore()
})
