import { GENRE_BUCKETS, bucketOf, groupPicksByBucket } from '../board/genreUtils.js'

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
