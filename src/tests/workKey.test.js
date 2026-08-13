import { normText, keyOf, workKeyOf, buildRegistryMap, snapshotOf, curriculaOf } from '../works/workKey.js'

test('normText: 연속 공백을 하나로, 앞뒤 공백 제거, 소문자화', () => {
  expect(normText('  별  헤는   밤 ')).toBe('별 헤는 밤')
  expect(normText('THE Road')).toBe('the road')
})

test('keyOf: 표기 공백 차이가 있어도 같은 키', () => {
  expect(keyOf('별헤는 밤', '윤동주')).toBe(keyOf('별헤는  밤', '윤동주'))
  expect(keyOf('소나기', '황순원')).not.toBe(keyOf('소나기', '피천득'))
})

test('workKeyOf: 시트 행에서 키를 만든다', () => {
  expect(workKeyOf({ '작품명': '소나기', _authorBase: '황순원' })).toBe(keyOf('소나기', '황순원'))
})

test('buildRegistryMap: 대표 표기와 별칭 모두 등록한다', () => {
  const map = buildRegistryMap([
    {
      work_id: 'W000001', title: '별 헤는 밤', author_base: '윤동주',
      aliases: [{ title: '별헤는 밤', author_base: '윤동주' }],
    },
  ])
  expect(map.get(keyOf('별 헤는 밤', '윤동주'))).toBe('W000001')
  expect(map.get(keyOf('별헤는 밤', '윤동주'))).toBe('W000001')
  expect(map.get(keyOf('없는 작품', '윤동주'))).toBeUndefined()
})

test('snapshotOf / curriculaOf', () => {
  const works = [
    { '작품명': '소나기', '지은이': '황순원', _authorBase: '황순원', '장르': '소설', '교육과정': '7차' },
    { '작품명': '소나기', '지은이': '황순원', _authorBase: '황순원', '장르': '소설', '교육과정': '2015' },
  ]
  const curricula = curriculaOf(works, workKeyOf(works[0]))
  expect(curricula).toEqual(['2015', '7차'])
  expect(snapshotOf(works[0], curricula)).toEqual({
    title: '소나기', author: '황순원', genre: '소설', curriculum: ['2015', '7차'],
  })
})
