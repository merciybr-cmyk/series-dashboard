import { buildCompareColumns, compareSummary, totalOf } from '../board/compareUtils.js'

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
