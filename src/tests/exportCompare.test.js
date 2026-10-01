import { compareRows, buildCompareWorkbook } from '../board/exportCompare.js'

const VOLUMES = [
  { id: 'v1', number: 1, title: '삶' },
  { id: 'v2', number: 2, title: '성장' },
]
const VW = [
  { id: 'a', volume_id: 'v1', work_id: 'W1', part_id: 'p1', sort_order: 10, selection_status: 'confirmed', work_snapshot: { title: '소나기', author: '황순원', genre: '소설' } },
  { id: 'b', volume_id: 'v1', work_id: 'W2', part_id: null, sort_order: 20, selection_status: 'candidate', work_snapshot: { title: '산유화', author: '김소월', genre: '시' } },
  { id: 'c', volume_id: 'v2', work_id: 'W1', part_id: null, sort_order: 10, selection_status: 'candidate', work_snapshot: { title: '소나기', author: '황순원', genre: '소설' } },
  { id: 'd', volume_id: 'v2', work_id: 'W3', part_id: null, sort_order: 20, selection_status: 'excluded', work_snapshot: { title: '풀', author: '김수영', genre: '시' } },
]
const PARTS = [{ id: 'p1', volume_id: 'v1', number: 1, title: '시', sort_order: 10 }]

test('compareRows: 권·부·순서·상태·다른 권 중복(제외 상태는 겹침에서 뺌)', () => {
  const rows = compareRows({ volumes: VOLUMES, allVw: VW, allParts: PARTS, confirmedOnly: false })
  expect(rows).toEqual([
    { '권': 1, '권 제목': '삶', '부': '1부 시', '순서': 1, '작품명': '소나기', '작가': '황순원', '갈래': '소설', '고전/현대': '현대', '상태': '확정', '다른 권 중복': '2권' },
    { '권': 1, '권 제목': '삶', '부': '미배정', '순서': 2, '작품명': '산유화', '작가': '김소월', '갈래': '시', '고전/현대': '현대', '상태': '후보', '다른 권 중복': '' },
    { '권': 2, '권 제목': '성장', '부': '', '순서': 1, '작품명': '소나기', '작가': '황순원', '갈래': '소설', '고전/현대': '현대', '상태': '후보', '다른 권 중복': '1권' },
    { '권': 2, '권 제목': '성장', '부': '', '순서': 2, '작품명': '풀', '작가': '김수영', '갈래': '시', '고전/현대': '현대', '상태': '제외', '다른 권 중복': '' },
  ])
})

test("compareRows: '확정만 보기'면 확정 작품만", () => {
  const rows = compareRows({ volumes: VOLUMES, allVw: VW, allParts: PARTS, confirmedOnly: true })
  expect(rows.map(r => r['작품명'])).toEqual(['소나기'])
})

test('buildCompareWorkbook: 한눈에 보기(권=열, 부 머리줄)와 전체 목록', () => {
  const wb = buildCompareWorkbook({ volumes: VOLUMES, allVw: VW, allParts: PARTS, confirmedOnly: false })
  expect(wb.SheetNames).toEqual(['한눈에 보기', '전체 목록'])
  const ov = wb.Sheets['한눈에 보기']
  expect(ov['A1'].v).toBe('1권 삶')
  expect(ov['B1'].v).toBe('2권 성장')
  expect(ov['A1'].s.fill.fgColor.rgb).toBe('4472C4')
  expect(ov['A2'].v).toBe('[1부 시] 현대 1')
  expect(ov['A3'].v).toBe('소나기 (황순원) · 확정')
  expect(ov['A3'].s.fill.fgColor.rgb).toBe('FFF2CC') // 다른 권과 겹침
  expect(ov['A4'].v).toBe('[미배정] 현대 1')
  expect(ov['B2'].v).toBe('소나기 (황순원) · 후보')
  const list = wb.Sheets['전체 목록']
  expect(list['E2'].v).toBe('소나기')
  expect(list['A1'].s.font.bold).toBe(true)
})

test('부 안에서는 화면처럼 고전 → 현대 순서, 순서 번호도 그 순서대로', () => {
  const vw = [
    { id: 'a', volume_id: 'v1', work_id: 'W1', part_id: 'p1', sort_order: 10, selection_status: 'candidate', work_snapshot: { title: '소나기', author: '황순원', genre: '소설' } },
    { id: 'b', volume_id: 'v1', work_id: 'W2', part_id: 'p1', sort_order: 20, selection_status: 'candidate', work_snapshot: { title: '홍길동전', author: '허균', genre: '고전소설' } },
  ]
  const args = { volumes: VOLUMES.slice(0, 1), allVw: vw, allParts: PARTS, confirmedOnly: false }
  const rows = compareRows(args)
  expect(rows.map(r => [r['순서'], r['작품명'], r['고전/현대']])).toEqual([[1, '홍길동전', '고전'], [2, '소나기', '현대']])
  const ov = buildCompareWorkbook(args).Sheets['한눈에 보기']
  expect(ov['A2'].v).toBe('[1부 시] 고전 1 · 현대 1')
  expect(ov['A3'].v).toBe('홍길동전 (허균) · 후보')
})
