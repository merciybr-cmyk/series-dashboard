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
  // 소나기는 2행이지만 1건으로 묶임 (가나다순으로 별 헤는 밤 다음 = 두 번째)
  expect(screen.getAllByRole('button', { name: '추가' })).toHaveLength(2)
  await userEvent.click(screen.getAllByRole('button', { name: '추가' })[1])
  expect(onAdd).toHaveBeenCalledWith(
    expect.objectContaining({ '작품명': '소나기' }),
    ['7차', '2015'],
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

test('기본 정렬은 작품명 가나다순이다 (시트 순서 무관)', () => {
  // 시트 순서상 '소나기'가 먼저지만, 가나다순으로 '별 헤는 밤'이 앞에 와야 한다.
  render(<SearchPane works={WORKS} duplicatesByKey={new Map()} onAdd={() => {}} />)
  const titles = screen.getAllByRole('listitem').map(li => li.textContent)
  expect(titles[0]).toContain('별 헤는 밤')
  expect(titles[1]).toContain('소나기')
})

test("'수록 많은 순'을 켜면 횟수 내림차순으로 정렬된다", async () => {
  // 가나다순 기본에서는 별 헤는 밤(1회)이 앞 — 토글을 켜면 소나기(2회)가 앞으로.
  render(<SearchPane works={WORKS} duplicatesByKey={new Map()} onAdd={() => {}} />)
  const firstTitle = () => screen.getAllByRole('listitem')[0].textContent
  expect(firstTitle()).toContain('별 헤는 밤')
  await userEvent.click(screen.getByLabelText('수록 많은 순'))
  expect(firstTitle()).toContain('소나기')
  // 끄면 원래 순서로 복귀
  await userEvent.click(screen.getByLabelText('수록 많은 순'))
  expect(firstTitle()).toContain('별 헤는 밤')
})

test("pickKeys가 있으면 '갈래 후보만'이 기본 적용되고 해제 시 전체가 보인다", async () => {
  const pickKeys = new Set([workKeyOf(WORKS[0])]) // 소나기만 후보
  render(<SearchPane works={WORKS} duplicatesByKey={new Map()} onAdd={() => {}} pickKeys={pickKeys} />)
  expect(screen.getAllByRole('button', { name: '추가' })).toHaveLength(1)
  expect(screen.queryByText('별 헤는 밤')).not.toBeInTheDocument()
  await userEvent.click(screen.getByLabelText('갈래 후보만'))
  expect(screen.getAllByRole('button', { name: '추가' })).toHaveLength(2)
})

test("'미배치만'을 켜면 제외 외 상태로 권에 들어간 작품을 숨긴다", async () => {
  const works = [
    ...WORKS,
    { '작품명': '진달래꽃', '지은이': '김소월', _authorBase: '김소월', '장르': '현대시', '교육과정': '2015', _titleChosung: 'ㅈㄷㄹㄲ', _authorChosung: 'ㄱㅅㅇ' },
  ]
  const dup = new Map([
    [workKeyOf(WORKS[0]), [{ volumeNumber: 1, selection_status: 'candidate' }]], // 소나기: 배치됨
    [workKeyOf(works[3]), [{ volumeNumber: 2, selection_status: 'excluded' }]],  // 진달래꽃: 제외만 → 미배치
  ])
  render(<SearchPane works={works} duplicatesByKey={dup} onAdd={() => {}} />)
  expect(screen.getAllByRole('button', { name: '추가' })).toHaveLength(3)
  await userEvent.click(screen.getByLabelText('미배치만'))
  expect(screen.getAllByRole('button', { name: '추가' })).toHaveLength(2)
  expect(screen.queryByText('소나기')).not.toBeInTheDocument()
  expect(screen.getByText('진달래꽃')).toBeInTheDocument()
})

test("defaultOnlyUnplaced면 '미배치만'이 켜진 채로 시작한다", () => {
  const dup = new Map([[workKeyOf(WORKS[0]), [{ volumeNumber: 2, selection_status: 'candidate' }]]])
  render(<SearchPane works={WORKS} duplicatesByKey={dup} onAdd={() => {}} defaultOnlyUnplaced />)
  expect(screen.getByLabelText('미배치만')).toBeChecked()
  expect(screen.queryByText('소나기')).not.toBeInTheDocument()
  expect(screen.getByText('별 헤는 밤')).toBeInTheDocument()
})

test('renderAction과 itemComponent로 버튼과 줄을 바꿀 수 있다', async () => {
  const seen = []
  const Item = ({ itemKey, work, getCurricula, className, children }) => {
    seen.push([itemKey, work['작품명'], getCurricula()])
    return <li className={className} data-testid="custom-item">{children}</li>
  }
  render(
    <SearchPane works={WORKS} duplicatesByKey={new Map()}
      renderAction={(work, getCurricula) => <span>넣기:{work['작품명']}:{getCurricula().join(',')}</span>}
      itemComponent={Item} />,
  )
  expect(screen.getAllByTestId('custom-item')).toHaveLength(2)
  expect(screen.queryByRole('button', { name: '추가' })).not.toBeInTheDocument()
  expect(screen.getByText('넣기:소나기:7차,2015')).toBeInTheDocument()
  expect(seen).toContainEqual([workKeyOf(WORKS[0]), '소나기', ['7차', '2015']])
})
