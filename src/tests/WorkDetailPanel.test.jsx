import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  listActivityFor: vi.fn().mockResolvedValue([]),
}))
const { default: WorkDetailPanel } = await import('../board/WorkDetailPanel.jsx')

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
  expect(screen.getByText('1/2')).toBeInTheDocument()
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
  await userEvent.click(screen.getByLabelText('교정'))
  await userEvent.click(screen.getByRole('button', { name: '선택한 업무 추가' }))
  expect(actions.addTasks).toHaveBeenCalledWith('vw1', [
    { task_type: 'commentary', title: '해제 작성', sort_order: 10 },
    { task_type: 'proof', title: '교정', sort_order: 20 },
  ])
})

test('모든 업무 완료 시 제작 완료 제안이 뜬다', async () => {
  const actions = makeActions()
  const tasks = [{ id: 't1', title: '교정', status: 'done' }]
  render(<WorkDetailPanel volumeWork={VW} tasks={tasks} members={MEMBERS} duplicates={[]} actions={actions} onClose={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: '완료로 변경' }))
  expect(actions.setVolumeWork).toHaveBeenCalledWith('vw1', { production_status: 'completed' })
})
