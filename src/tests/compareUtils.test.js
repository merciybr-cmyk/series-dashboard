import {
  buildCompareColumns, compareSummary, totalOf, volumesByWork,
  compareWarnings, WARNING_LABELS, expectedPartOf,
} from '../board/compareUtils.js'

const VOLUMES = [
  { id: 'v2', number: 2, title: '성장' },
  { id: 'v1', number: 1, title: '삶' },
]
const snap = (title, genre) => ({ title, author: '', genre })
const VW = [
  { id: 'a', volume_id: 'v1', work_id: 'W1', part_id: 'p2', sort_order: 10, selection_status: 'candidate', work_snapshot: snap('소나기', '소설') },
  { id: 'b', volume_id: 'v1', work_id: 'W2', part_id: 'p2', sort_order: 20, selection_status: 'candidate', work_snapshot: snap('홍길동전', '고전소설') },
  { id: 'c', volume_id: 'v1', work_id: 'W3', part_id: 'p2', sort_order: 30, selection_status: 'excluded', work_snapshot: snap('구운몽', '고전소설') },
  { id: 'd', volume_id: 'v1', work_id: 'W4', part_id: null, sort_order: 40, selection_status: 'confirmed', work_snapshot: snap('원고지', '극본') },
  { id: 'e', volume_id: 'v2', work_id: 'W5', part_id: null, sort_order: 10, selection_status: 'candidate', work_snapshot: snap('춘향전', '고전소설') },
]
const PARTS = [
  { id: 'p2', volume_id: 'v1', number: 2, title: '소설' },
  { id: 'p1', volume_id: 'v1', number: 1, title: '시' },
]

test('buildCompareColumns: 권 번호순, 부 안은 고전 → 현대, 편수는 제외 상태를 뺀다', () => {
  const cols = buildCompareColumns({ volumes: VOLUMES, allVw: VW, allParts: PARTS, confirmedOnly: false })
  expect(cols.map(c => c.volume.number)).toEqual([1, 2])
  const [v1, v2] = cols
  expect(v1.groups.map(g => g.label)).toEqual(['2부 소설', '1부 시', '미배정']) // 부 순서는 listAllParts(번호순) 그대로 따른다
  expect(v1.groups[0].works.map(w => w.id)).toEqual(['b', 'c', 'a'])
  expect(v1.groups[0].counts).toEqual({ '고전': 1, '현대': 1, '기타': 0 })
  expect(v1.counts).toEqual({ '고전': 1, '현대': 2, '기타': 0 })
  expect(v2.groups).toHaveLength(1)
  expect(v2.groups[0].label).toBe('') // 부가 없는 권
})

test("buildCompareColumns: '확정만 보기'면 확정 작품만 담고 센다", () => {
  const [v1] = buildCompareColumns({ volumes: VOLUMES, allVw: VW, allParts: PARTS, confirmedOnly: true })
  expect(v1.groups.flatMap(g => g.works).map(w => w.id)).toEqual(['d'])
  expect(v1.counts).toEqual({ '고전': 0, '현대': 1, '기타': 0 })
})

test('compareSummary: 행 = 부(번호순, 미배정·부 없음은 끝), 칸 = 권별 편수, 해당 부가 없으면 null', () => {
  const cols = buildCompareColumns({ volumes: VOLUMES, allVw: VW, allParts: [...PARTS].sort((a, b) => a.number - b.number), confirmedOnly: false })
  const rows = compareSummary(cols)
  expect(rows.map(r => r.label)).toEqual(['1부 시', '2부 소설', '미배정', '부 없음'])
  expect(rows[0].cells).toEqual([{ '고전': 0, '현대': 0, '기타': 0 }, null])
  expect(rows[1].cells[0]).toEqual({ '고전': 1, '현대': 1, '기타': 0 })
  expect(rows[3].cells).toEqual([null, { '고전': 1, '현대': 0, '기타': 0 }])
})

test('totalOf: 고전·현대·기타 합', () => {
  expect(totalOf({ '고전': 15, '현대': 5, '기타': 1 })).toBe(21)
})

describe('compareWarnings', () => {
  const VOLS = [{ id: 'v1', number: 1, curricula: ['1차', '2차', '3차'] }, { id: 'v2', number: 2, curricula: [] }]
  const PARTS2 = [{ id: 'p1', volume_id: 'v1', number: 1 }, { id: 'p2', volume_id: 'v1', number: 2 }]
  const r = (id, snap, extra = {}) => ({
    id, volume_id: 'v1', part_id: 'p1', selection_status: 'candidate',
    work_snapshot: { genre: '시', author: `작가${id}`, curriculum: ['1차'], ...snap }, ...extra,
  })

  test('수록 이력 없음: 작품 교육과정과 권 교육과정이 안 겹칠 때만 (어느 쪽이든 비면 판정 안 함)', () => {
    const rows = [r('a', { curriculum: ['2022개정'] }), r('b', { curriculum: [] }), r('c', { curriculum: ['2022개정'] }, { volume_id: 'v2', part_id: null })]
    const w = compareWarnings(rows, VOLS, PARTS2)
    expect(w.get('a')).toEqual(['noHistory'])
    expect(w.has('b')).toBe(false)
    expect(w.has('c')).toBe(false)
  })

  test('부와 갈래 다름: 소설이 1부면 경고, 2부·미배정·고전산문은 아님', () => {
    const rows = [
      r('a', { genre: '소설' }), r('b', { genre: '소설' }, { part_id: 'p2' }),
      r('c', { genre: '소설' }, { part_id: null }), r('d', { genre: '고전산문' }),
    ]
    const w = compareWarnings(rows, VOLS, PARTS2)
    expect(w.get('a')).toEqual(['partMismatch'])
    expect(w.has('b') || w.has('c') || w.has('d')).toBe(false)
    expect(expectedPartOf('소설')).toBe(2)
    expect(expectedPartOf('고전산문')).toBeNull()
  })

  test('같은 작가 3편 이상: 제외·뺀 행과 작가 미상은 세지 않는다', () => {
    const same = { author: '백석' }
    expect(compareWarnings([r('a', same), r('b', same), r('c', same, { selection_status: 'excluded' }), r('d', same, { _removed: true })], VOLS, PARTS2).size).toBe(0)
    expect(compareWarnings([r('a', same), r('b', same), r('e', same)], VOLS, PARTS2).get('e')).toEqual(['authorOver'])
    expect(compareWarnings([r('a', { author: '' }), r('b', { author: '' }), r('e', { author: '작자 미상' })], VOLS, PARTS2).size).toBe(0)
  })

  test('경고 문구', () => {
    expect(WARNING_LABELS).toEqual({ noHistory: '수록 이력 없음', partMismatch: '부 확인', authorOver: '작가 3편' })
  })
})

test('편집 중 뺀 행은 목록에 남기되 편수와 겹침에서는 뺀다', () => {
  const vols = [{ id: 'v1', number: 1 }, { id: 'v2', number: 2 }]
  const rows = [
    { id: 'a', volume_id: 'v1', work_id: 'W1', part_id: null, sort_order: 10, selection_status: 'candidate', work_snapshot: { genre: '시' }, _removed: true },
    { id: 'b', volume_id: 'v2', work_id: 'W1', part_id: null, sort_order: 10, selection_status: 'candidate', work_snapshot: { genre: '시' } },
  ]
  const [c1] = buildCompareColumns({ volumes: vols, allVw: rows, allParts: [], confirmedOnly: false })
  expect(c1.groups[0].works.map(w => w.id)).toEqual(['a'])
  expect(c1.counts['현대']).toBe(0)
  expect(c1.groups[0].counts['현대']).toBe(0)
  expect(volumesByWork(rows).get('W1')).toEqual(['v2'])
})

test('volumesByWork: work_id가 없는 행(registry에 없는 새로 넣은 작품)은 겹침 판정에서 뺀다', () => {
  const rows = [
    { id: 'a', volume_id: 'v1', work_id: null, _key: 'k1', selection_status: 'candidate', work_snapshot: { genre: '시' } },
    { id: 'b', volume_id: 'v2', work_id: null, _key: 'k2', selection_status: 'candidate', work_snapshot: { genre: '시' } },
    { id: 'c', volume_id: 'v2', work_id: undefined, selection_status: 'candidate', work_snapshot: { genre: '시' } },
    { id: 'd', volume_id: 'v1', work_id: 'W1', selection_status: 'candidate', work_snapshot: { genre: '시' } },
  ]
  const map = volumesByWork(rows)
  expect(map.has(null)).toBe(false)
  expect(map.has(undefined)).toBe(false)
  expect(map.get('W1')).toEqual(['v1'])
})
