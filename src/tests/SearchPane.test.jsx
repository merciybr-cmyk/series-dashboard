import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const { default: SearchPane } = await import('../board/SearchPane.jsx')
const { workKeyOf } = await import('../works/workKey.js')

const WORKS = [
  { '작품명': '소나기', '지은이': '황순원', _authorBase: '황순원', '장르': '소설', '교육과정': '7차', _titleChosung: 'ㅅㄴㄱ', _authorChosung: 'ㅎㅅㅇ' },
  { '작품명': '소나기', '지은이': '황순원', _authorBase: '황순원', '장르': '소설', '교육과정': '2015', _titleChosung: 'ㅅㄴㄱ', _authorChosung: 'ㅎㅅㅇ' },
  { '작품명': '별 헤는 밤', '지은이': '윤동주', _authorBase: '윤동주', '장르': '현대시', '교육과정': '2015', _titleChosung: 'ㅂ ㅎㄴ ㅂ', _authorChosung: 'ㅇㄷㅈ' },
]

test('작품 단위로 묶어 보여주고, 추가 시 대표 행과 교육과정 목록을 넘긴다', async () => {
  const onAdd = vi.fn()
  render(<SearchPane works={WORKS} duplicatesByKey={new Map()} onAdd={onAdd} />)
  // 소나기는 2행이지만 1건으로 묶임
  expect(screen.getAllByRole('button', { name: '추가' })).toHaveLength(2)
  await userEvent.click(screen.getAllByRole('button', { name: '추가' })[0])
  expect(onAdd).toHaveBeenCalledWith(
    expect.objectContaining({ '작품명': '소나기' }),
    ['2015', '7차'],
  )
})

test('검색어로 거른다', async () => {
  render(<SearchPane works={WORKS} duplicatesByKey={new Map()} onAdd={() => {}} />)
  await userEvent.type(screen.getByPlaceholderText(/작품명·작가/), '윤동주')
  await waitFor(() => expect(screen.getAllByRole('button', { name: '추가' })).toHaveLength(1))
  expect(screen.getByText('별 헤는 밤')).toBeInTheDocument()
})

test('이미 수록된 작품에는 선정 상태를 포함한 권 뱃지를 단다', () => {
  const dup = new Map([[workKeyOf(WORKS[0]), [
    { volumeNumber: 2, selection_status: 'confirmed' },
    { volumeNumber: 4, selection_status: 'candidate' },
  ]]])
  render(<SearchPane works={WORKS} duplicatesByKey={dup} onAdd={() => {}} />)
  expect(screen.getByText('2권 확정')).toBeInTheDocument()
  expect(screen.getByText('4권 후보')).toBeInTheDocument()
})

test('작품별 수록 횟수를 표시한다', () => {
  render(<SearchPane works={WORKS} duplicatesByKey={new Map()} onAdd={() => {}} />)
  expect(screen.getByText('수록 2회')).toBeInTheDocument()  // 소나기
  expect(screen.getByText('수록 1회')).toBeInTheDocument()  // 별 헤는 밤
})

test('필터가 걸려도 수록 횟수는 전체 기준이다', async () => {
  render(<SearchPane works={WORKS} duplicatesByKey={new Map()} onAdd={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /교육과정/ }))
  await userEvent.click(screen.getByLabelText('7차'))
  expect(screen.getByText('수록 2회')).toBeInTheDocument()
})
