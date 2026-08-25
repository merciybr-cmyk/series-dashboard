import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  listActivityFor: vi.fn().mockResolvedValue([]),
  listComments: vi.fn().mockResolvedValue([]),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
  listFiles: vi.fn().mockResolvedValue([]),
  uploadFile: vi.fn(),
  addFileLink: vi.fn(),
  deleteFile: vi.fn(),
  getFileUrl: vi.fn(),
}))
const { default: WorkDetailPanel } = await import('../board/WorkDetailPanel.jsx')
const api = await import('../board/volumeApi.js')

const VW = {
  id: 'vw1', selection_status: 'confirmed', production_status: 'in_progress', note: '',
  work_snapshot: { title: '소나기', author: '황순원', genre: '소설', curriculum: ['7차', '2015'] },
}
const MEMBERS = [{ id: 'm1', name: '김편집' }]

function makeActions() {
  return {
    setVolumeWork: vi.fn(), addTasks: vi.fn(), setTask: vi.fn(), removeTask: vi.fn(), removeWork: vi.fn(),
  }
}

test('작품 정보·다른 권 수록·진행률을 보여준다', () => {
  const tasks = [{ id: 't1', title: '해제 작성', status: 'done' }, { id: 't2', title: '교정', status: 'todo' }]
  render(<WorkDetailPanel volumeWork={VW} tasks={tasks} members={MEMBERS}
    duplicates={[{ volumeNumber: 2, selection_status: 'confirmed' }]} actions={makeActions()} onClose={() => {}} />)
  expect(screen.getByText('소나기')).toBeInTheDocument()
  expect(screen.getByText(/2권/)).toBeInTheDocument()
  expect(screen.getByText('업무 (1/2)')).toBeInTheDocument()
})

test('체크박스로 업무를 완료 처리한다', async () => {
  const actions = makeActions()
  const tasks = [{ id: 't1', title: '해제 작성', status: 'todo' }]
  render(<WorkDetailPanel volumeWork={VW} tasks={tasks} members={MEMBERS} duplicates={[]} actions={actions} onClose={() => {}} />)
  await userEvent.click(screen.getByRole('checkbox', { name: /해제 작성/ }))
  expect(actions.setTask).toHaveBeenCalledWith('t1', { status: 'done' })
})

test('프리셋을 골라 업무를 추가한다', async () => {
  const actions = makeActions()
  render(<WorkDetailPanel volumeWork={VW} tasks={[]} members={MEMBERS} duplicates={[]} actions={actions} onClose={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: '업무 추가' }))
  await userEvent.click(screen.getByLabelText('해제 작성'))
  await userEvent.click(screen.getByLabelText('이미지 확보'))
  await userEvent.click(screen.getByRole('button', { name: '선택한 업무 추가' }))
  expect(actions.addTasks).toHaveBeenCalledWith('vw1', [
    { task_type: 'commentary', title: '해제 작성', sort_order: 10 },
    { task_type: 'image', title: '이미지 확보', sort_order: 20 },
  ])
})

test('부가 있으면 부 지정 select를 보여주고 변경을 전달한다', async () => {
  const actions = makeActions()
  const parts = [{ id: 'p1', number: 1, title: '시' }]
  render(<WorkDetailPanel volumeWork={{ ...VW, part_id: null }} tasks={[]} members={MEMBERS}
    duplicates={[]} parts={parts} actions={actions} onClose={() => {}} />)
  const select = screen.getByLabelText('부 지정')
  await userEvent.selectOptions(select, 'p1')
  expect(actions.setVolumeWork).toHaveBeenCalledWith('vw1', { part_id: 'p1' })
})

test('검토 의견을 불러와 작성자 이름과 함께 보여준다', async () => {
  api.listComments.mockResolvedValue([
    { id: 'c1', body: '표현이 좋아 후보로 적극 추천', created_by: 'm1', created_at: '2026-08-25T09:00:00Z' },
  ])
  render(<WorkDetailPanel volumeWork={VW} tasks={[]} members={MEMBERS} duplicates={[]} actions={makeActions()} onClose={() => {}} />)
  expect(await screen.findByText(/후보로 적극 추천/)).toBeInTheDocument()
  expect(screen.getByText(/김편집/)).toBeInTheDocument()
})

test('의견을 입력해 등록한다', async () => {
  api.listComments.mockResolvedValue([])
  api.addComment.mockResolvedValue({ id: 'c9', body: '분량 우려', created_by: 'm1', created_at: '2026-08-25T09:00:00Z' })
  render(<WorkDetailPanel volumeWork={VW} tasks={[]} members={MEMBERS} duplicates={[]} actions={makeActions()} onClose={() => {}} />)
  await userEvent.type(screen.getByPlaceholderText(/검토 의견/), '분량 우려')
  await userEvent.click(screen.getByRole('button', { name: '의견 남기기' }))
  expect(api.addComment).toHaveBeenCalledWith('vw1', '분량 우려')
  expect(await screen.findByText('분량 우려')).toBeInTheDocument()
})

test('자료 목록을 업로더 이름과 함께 보여준다', async () => {
  api.listFiles.mockResolvedValue([
    { id: 'f1', kind: 'upload', name: '해제_소나기.hwp', uploaded_by: 'm1', created_at: '2026-08-25T09:00:00Z', storage_path: 'p' },
  ])
  render(<WorkDetailPanel volumeWork={VW} tasks={[]} members={MEMBERS} duplicates={[]} actions={makeActions()} onClose={() => {}} />)
  expect(await screen.findByText(/해제_소나기\.hwp/)).toBeInTheDocument()
})

test('링크 첨부를 등록한다', async () => {
  api.listFiles.mockResolvedValue([])
  api.addFileLink.mockResolvedValue({ id: 'f2', kind: 'link', name: '해제 초고', url: 'https://ex.com', created_at: '2026-08-25T09:00:00Z' })
  render(<WorkDetailPanel volumeWork={VW} tasks={[]} members={MEMBERS} duplicates={[]} actions={makeActions()} onClose={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: '링크 첨부' }))
  await userEvent.type(screen.getByPlaceholderText('자료 이름'), '해제 초고')
  await userEvent.type(screen.getByPlaceholderText('https://…'), 'https://ex.com')
  await userEvent.click(screen.getByRole('button', { name: '등록' }))
  expect(api.addFileLink).toHaveBeenCalledWith('vw1', '해제 초고', 'https://ex.com')
  expect(await screen.findByText('해제 초고')).toBeInTheDocument()
})

test('파일 업로드 input이 uploadFile을 호출한다', async () => {
  api.listFiles.mockResolvedValue([])
  api.uploadFile.mockResolvedValue({ id: 'f3', kind: 'upload', name: 'a.pdf', created_at: '2026-08-25T09:00:00Z' })
  render(<WorkDetailPanel volumeWork={VW} tasks={[]} members={MEMBERS} duplicates={[]} actions={makeActions()} onClose={() => {}} />)
  const input = screen.getByLabelText('파일 선택')
  const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
  await userEvent.upload(input, file)
  expect(api.uploadFile).toHaveBeenCalledWith('vw1', file)
})
