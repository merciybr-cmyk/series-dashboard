import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const { default: PartControls } = await import('../board/PartControls.jsx')

const PARTS = [
  { id: 'p1', number: 1, title: null },
  { id: 'p2', number: 2, title: '현대시' },
]

test('탭: 전체/부/미배정을 렌더링하고 클릭을 전달한다', async () => {
  const onSelect = vi.fn()
  render(<PartControls parts={PARTS} activePart="all" onSelect={onSelect}
    onAddPart={() => {}} onRenamePart={() => {}} onRemovePart={() => {}} />)
  expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '2부 현대시' }))
  expect(onSelect).toHaveBeenCalledWith('p2')
  await userEvent.click(screen.getByRole('button', { name: '미배정' }))
  expect(onSelect).toHaveBeenCalledWith('none')
})

test('부가 없으면 탭 없이 부 추가만 가능하다', async () => {
  const onAddPart = vi.fn()
  render(<PartControls parts={[]} activePart="all" onSelect={() => {}}
    onAddPart={onAddPart} onRenamePart={() => {}} onRemovePart={() => {}} />)
  expect(screen.queryByRole('button', { name: '미배정' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '부 관리' }))
  await userEvent.click(screen.getByRole('button', { name: '부 추가' }))
  expect(onAddPart).toHaveBeenCalled()
})

test('팝오버에서 이름 변경(blur)과 삭제(confirm)를 전달한다', async () => {
  const onRenamePart = vi.fn()
  const onRemovePart = vi.fn()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<PartControls parts={PARTS} activePart="all" onSelect={() => {}}
    onAddPart={() => {}} onRenamePart={onRenamePart} onRemovePart={onRemovePart} />)
  await userEvent.click(screen.getByRole('button', { name: '부 관리' }))
  const input = screen.getByLabelText('1부 제목')
  await userEvent.type(input, '소설')
  await userEvent.tab() // blur
  expect(onRenamePart).toHaveBeenCalledWith('p1', '소설')
  await userEvent.click(screen.getByRole('button', { name: '1부 삭제' }))
  expect(onRemovePart).toHaveBeenCalledWith('p1')
  window.confirm.mockRestore()
})
