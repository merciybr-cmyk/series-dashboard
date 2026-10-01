import { GENRE_BUCKETS, bucketOf, groupPicksByBucket, eraOf, orderByEra, countEras, eraSummary } from '../board/genreUtils.js'

test('GENRE_BUCKETS: 5개 분류', () => {
  expect(GENRE_BUCKETS).toEqual(['현대시', '현대소설', '현대수필·극', '고전운문', '고전산문'])
})

test('bucketOf: 시트 갈래 6종 + 레거시 시조를 정확히 분류한다', () => {
  expect(bucketOf('시')).toBe('현대시')
  expect(bucketOf('소설')).toBe('현대소설')
  expect(bucketOf('수필')).toBe('현대수필·극')
  expect(bucketOf('극본')).toBe('현대수필·극')
  expect(bucketOf('고전운문')).toBe('고전운문')
  expect(bucketOf('시조')).toBe('현대시') // 통합 이전 work_snapshot 호환
  expect(bucketOf('고전산문')).toBe('고전산문')
  expect(bucketOf('판소리')).toBeNull()
  expect(bucketOf(null)).toBeNull()
})

test('groupPicksByBucket: 버킷별로 묶고 미분류는 기타로', () => {
  const picks = [
    { id: 'a', work_snapshot: { genre: '시' } },
    { id: 'b', work_snapshot: { genre: '시조' } },
    { id: 'c', work_snapshot: { genre: '판소리' } },
    { id: 'd', work_snapshot: { genre: '극본' } },
  ]
  const g = groupPicksByBucket(picks)
  expect(g['현대시'].map(p => p.id)).toEqual(['a', 'b'])
  expect(g['고전운문']).toEqual([])
  expect(g['현대수필·극'].map(p => p.id)).toEqual(['d'])
  expect(g['기타'].map(p => p.id)).toEqual(['c'])
  expect(g['현대소설']).toEqual([])
})

test('bucketOf: 시트의 고전소설·고전수필·고전극은 고전산문으로 묶는다 (2026-09-30 시트 갈래 세분화)', () => {
  expect(bucketOf('고전소설')).toBe('고전산문')
  expect(bucketOf('고전수필')).toBe('고전산문')
  expect(bucketOf('고전극')).toBe('고전산문')
})

test('eraOf: 고전 갈래는 고전, 나머지 분류된 갈래는 현대, 모르는 갈래는 null', () => {
  for (const g of ['고전운문', '고전산문', '고전소설', '고전수필', '고전극']) expect(eraOf(g)).toBe('고전')
  for (const g of ['시', '시조', '소설', '수필', '극본']) expect(eraOf(g)).toBe('현대')
  expect(eraOf('판소리')).toBeNull()
  expect(eraOf('')).toBeNull()
  expect(eraOf(undefined)).toBeNull()
})

const w = (id, genre, status = 'candidate') => ({ id, selection_status: status, work_snapshot: { genre } })

test('orderByEra: 고전 → 현대 → 미분류 순으로 묶고, 묶음 안에서는 원래 순서를 지킨다', () => {
  const works = [w('a', '소설'), w('b', '고전소설'), w('c', '판소리'), w('d', '극본'), w('e', '고전극')]
  expect(orderByEra(works).map(x => x.id)).toEqual(['b', 'e', 'a', 'd', 'c'])
  expect(works.map(x => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']) // 원본은 그대로
})

test("countEras: 고전·현대·기타 편수를 센다 ('제외' 상태는 뺀다)", () => {
  const works = [w('a', '소설'), w('b', '고전소설'), w('c', '판소리'), w('d', '고전운문', 'excluded'), w('e', '시', 'confirmed')]
  expect(countEras(works)).toEqual({ '고전': 1, '현대': 2, '기타': 1 })
  expect(countEras([])).toEqual({ '고전': 0, '현대': 0, '기타': 0 })
})

test('eraSummary: 0인 항목은 빼고 가운뎃점으로 잇는다', () => {
  expect(eraSummary({ '고전': 15, '현대': 5, '기타': 0 })).toBe('고전 15 · 현대 5')
  expect(eraSummary({ '고전': 0, '현대': 4, '기타': 0 })).toBe('현대 4')
  expect(eraSummary({ '고전': 1, '현대': 0, '기타': 2 })).toBe('고전 1 · 기타 2')
  expect(eraSummary({ '고전': 0, '현대': 0, '기타': 0 })).toBe('')
})
