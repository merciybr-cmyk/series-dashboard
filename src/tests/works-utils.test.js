import { toChosung, isChosungQuery } from '../works/chosung.js'
import { parseCSV, extractAuthorBase } from '../works/parseCSV.js'
import { filterWorks, getUniqueValues } from '../works/filterWorks.js'

const CSV = [
  '교육과정,체제,구분,학년,학기,교과서명,출판사,장르,작품명,지은이',
  '7차,국정,중등,1,1,중학 국어 1-1,,소설,소나기,황순원',
  '2015,검정,고등,1,1,문학,지학사,현대시,"별 헤는 밤",윤동주',
  '2015,검정,고등,1,1,문학,지학사,소설,소나기,황순원',
].join('\n')

test('toChosung: 한글을 초성으로 바꾼다', () => {
  expect(toChosung('김소월')).toBe('ㄱㅅㅇ')
})

test('isChosungQuery: 초성만이면 true', () => {
  expect(isChosungQuery('ㅅㄴㄱ')).toBe(true)
  expect(isChosungQuery('소나기')).toBe(false)
})

test('extractAuthorBase: 괄호 주석을 제거한다', () => {
  expect(extractAuthorBase('황순원(黃順元)')).toBe('황순원')
})

test('parseCSV: 행을 객체로 만들고 파생 필드를 붙인다', () => {
  const works = parseCSV(CSV)
  expect(works).toHaveLength(3)
  expect(works[0]['작품명']).toBe('소나기')
  expect(works[0]._authorBase).toBe('황순원')
  expect(works[1]._titleChosung).toBe('ㅂ ㅎㄴ ㅂ')
})

test('filterWorks: 교육과정·장르·검색어(초성 포함)로 거른다', () => {
  const works = parseCSV(CSV)
  expect(filterWorks(works, { curriculum: ['7차'] })).toHaveLength(1)
  expect(filterWorks(works, { genre: ['현대시'] })).toHaveLength(1)
  expect(filterWorks(works, { query: '소나기' })).toHaveLength(2)
  expect(filterWorks(works, { query: 'ㅅㄴㄱ' })).toHaveLength(2)
  expect(filterWorks(works, { query: '윤동주' })).toHaveLength(1)
})

test('getUniqueValues: 중복 없이 정렬해 돌려준다', () => {
  const works = parseCSV(CSV)
  expect(getUniqueValues(works, '장르')).toEqual(['소설', '현대시'])
})
