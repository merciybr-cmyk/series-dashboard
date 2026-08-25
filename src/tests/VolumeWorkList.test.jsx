import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const { default: VolumeWorkList } = await import('../board/VolumeWorkList.jsx')

const WORKS = [
  { id: 'vw1', sort_order: 10, selection_status: 'confirmed', production_status: 'in_progress', work_snapshot: { title: '소나기', author: '황순원' } },
  { id: 'vw2', sort_order: 20, selection_status: 'candidate', production_status: 'not_started', work_snapshot: { title: '별 헤는 밤', author: '윤동주' } },
]
const TASKS = { vw1: [{ id: 't1', status: 'done' }, { id: 't2', status: 'todo', due_date: '2099-01-01' }], vw2: [] }

test('행에 배지·진행률을 표시하고 클릭하면 onSelect', async () => {
  const onSelect = vi.fn()
  render(<VolumeWorkList works={WORKS} tasksByVw={TASKS} members={[]} selectedId={null} onSelect={onSelect} onMove={() => {}} />)
  expect(screen.getByText('소나기')).toBeInTheDocument()
  expect(screen.getByText('확정')).toBeInTheDocument()
  expect(screen.getByText('1/2')).toBeInTheDocument()
  await userEvent.click(screen.getByText('소나기'))
  expect(onSelect).toHaveBeenCalledWith('vw1')
})

test('선정 상태 필터가 목록을 거른다', async () => {
  render(<VolumeWorkList works={WORKS} tasksByVw={TASKS} members={[]} selectedId={null} onSelect={() => {}} onMove={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /선정 상태/ }))
  await userEvent.click(screen.getByLabelText('후보'))
  expect(screen.queryByText('소나기')).not.toBeInTheDocument()
  expect(screen.getByText('별 헤는 밤')).toBeInTheDocument()
})

test('▼를 누르면 onMove(id, "down")', async () => {
  const onMove = vi.fn()
  render(<VolumeWorkList works={WORKS} tasksByVw={TASKS} members={[]} selectedId={null} onSelect={() => {}} onMove={onMove} />)
  await userEvent.click(screen.getAllByRole('button', { name: '아래로' })[0])
  expect(onMove).toHaveBeenCalledWith('vw1', 'down')
})

test('parts가 있으면 부별 그룹 헤더를 표시한다', () => {
  const parts = [{ id: 'p1', number: 1, title: '시' }]
  const worksWithPart = [
    { ...WORKS[0], part_id: 'p1' },
    { ...WORKS[1], part_id: null },
  ]
  render(<VolumeWorkList works={worksWithPart} tasksByVw={TASKS} members={[]} parts={parts}
    selectedId={null} onSelect={() => {}} onMove={() => {}} />)
  expect(screen.getByText('1부 시')).toBeInTheDocument()
  expect(screen.getByText('미배정')).toBeInTheDocument()
})

test('부가 없고 필터 결과가 0건이면 빈 문구가 하나만 보인다', async () => {
  render(<VolumeWorkList works={WORKS} tasksByVw={TASKS} members={[]} selectedId={null} onSelect={() => {}} onMove={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /선정 상태/ }))
  await userEvent.click(screen.getByLabelText('보류'))
  expect(screen.getByText('표시할 작품이 없습니다')).toBeInTheDocument()
  expect(screen.queryByText('이 부에 작품이 없습니다')).not.toBeInTheDocument()
})
