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

test('buildCompareWorkbook: 부별 탭 → 전체 배치(권=열, 부 머리줄) → 전체 목록', () => {
  const wb = buildCompareWorkbook({ volumes: VOLUMES, allVw: VW, allParts: PARTS, confirmedOnly: false })
  expect(wb.SheetNames).toEqual(['1부 시', '미배정', '전체 배치', '전체 목록'])
  const ov = wb.Sheets['전체 배치']
  expect(ov['A1'].v).toBe('1권 삶')
  expect(ov['B1'].v).toBe('2권 성장')
  expect(ov['A1'].s.fill.fgColor.rgb).toBe('4472C4')
  expect(ov['A2'].v).toBe('[1부 시] 현대 1')
  expect(ov['A3'].v).toBe('소나기 (황순원)')                // 상태 표시 없이 작품명·작가명만
  expect(ov['A3'].s.fill.fgColor.rgb).toBe('FFF2CC') // 다른 권과 겹침
  expect(ov['A4'].v).toBe('[미배정] 현대 1')
  expect(ov['B2'].v).toBe('소나기 (황순원)')
  expect(ov['B3']?.v ?? '').toBe('')                         // '제외' 작품(풀)은 전체 배치에서 뺀다
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
  const ov = buildCompareWorkbook(args).Sheets['전체 배치']
  expect(ov['A2'].v).toBe('[1부 시] 고전 1 · 현대 1')
  expect(ov['A3'].v).toBe('홍길동전 (허균)')
})

test('전체 배치: 작가명이 비어 있으면 작품명만', () => {
  const vw = [{ id: 'a', volume_id: 'v1', work_id: 'W1', part_id: 'p1', sort_order: 10, selection_status: 'candidate', work_snapshot: { title: '청산별곡', author: '', genre: '고전운문' } }]
  const ov = buildCompareWorkbook({ volumes: VOLUMES.slice(0, 1), allVw: vw, allParts: PARTS, confirmedOnly: false }).Sheets['전체 배치']
  expect(ov['A3'].v).toBe('청산별곡')
})

// 2026-10-14: 부별 탭 — 회의 때 1부 줄에서 8권을 비교하려고. 각 권 열 안은 확정 → 후보 → 보류 띠로 나누고, 띠 안은 화면처럼 고전 → 현대
test('부별 탭: 권=열, 확정 띠가 먼저 오고 후보·보류 띠는 그 부에 있을 때만, 띠 줄은 권끼리 맞춘다', () => {
  const vw = [
    { id: 'a', volume_id: 'v1', work_id: 'W1', part_id: 'p1', sort_order: 10, selection_status: 'candidate', work_snapshot: { title: '소나기', author: '황순원', genre: '소설' } },
    { id: 'b', volume_id: 'v1', work_id: 'W2', part_id: 'p1', sort_order: 20, selection_status: 'confirmed', work_snapshot: { title: '산유화', author: '김소월', genre: '시' } },
    { id: 'c', volume_id: 'v1', work_id: 'W3', part_id: 'p1', sort_order: 30, selection_status: 'confirmed', work_snapshot: { title: '홍길동전', author: '허균', genre: '고전소설' } },
    { id: 'd', volume_id: 'v1', work_id: 'W4', part_id: 'p1', sort_order: 40, selection_status: 'excluded', work_snapshot: { title: '풀', author: '김수영', genre: '시' } },
    { id: 'e', volume_id: 'v2', work_id: 'W5', part_id: 'p2', sort_order: 10, selection_status: 'hold', work_snapshot: { title: '청산별곡', author: '', genre: '고전운문' } },
    { id: 'f', volume_id: 'v2', work_id: 'W1', part_id: 'p2', sort_order: 20, selection_status: 'candidate', work_snapshot: { title: '소나기', author: '황순원', genre: '소설' } },
  ]
  const parts = [
    { id: 'p1', volume_id: 'v1', number: 1, title: '시', sort_order: 10 },
    { id: 'p2', volume_id: 'v2', number: 1, title: '시', sort_order: 10 },
  ]
  const wb = buildCompareWorkbook({ volumes: VOLUMES, allVw: vw, allParts: parts, confirmedOnly: false })
  expect(wb.SheetNames).toEqual(['1부 시', '전체 배치', '전체 목록'])
  const ws = wb.Sheets['1부 시']
  const col = c => Array.from({ length: 9 }, (_, r) => ws[`${c}${r + 1}`]?.v ?? '')
  expect(col('A')).toEqual([
    '1권 삶',
    '[확정] 2편 · 고전 1 · 현대 1', '홍길동전 (허균) · 확정', '산유화 (김소월) · 확정',
    '[후보] 1편 · 현대 1', '소나기 (황순원) · 후보',
    '[보류] 0편', '',                                 // 2권의 보류 띠에 맞춰 줄을 비워 둔다
    '',
  ])
  expect(col('B')).toEqual([
    '2권 성장',
    '[확정] 0편', '', '',
    '[후보] 1편 · 현대 1', '소나기 (황순원) · 후보',
    '[보류] 1편 · 고전 1', '청산별곡 · 보류',
    '',
  ])
  expect(ws['A1'].s.fill.fgColor.rgb).toBe('4472C4')
  expect(ws['A2'].s.fill.fgColor.rgb).toBe('DDEBF7')   // 확정 띠
  expect(ws['A5'].s.fill.fgColor.rgb).toBe('EDEDED')   // 후보 띠
  expect(ws['A7'].s.fill.fgColor.rgb).toBe('FCE4D6')   // 보류 띠
  expect(ws['A6'].s.fill.fgColor.rgb).toBe('FFF2CC')   // 소나기는 2권과 겹침
  expect(ws['B2'].s.fill.fgColor.rgb).toBe('DDEBF7')   // 띠 색은 모든 권 열에
})

test('부별 탭: 그 부가 없는 권은 띠 칸이 비고, 미배정 탭은 부가 있는 권의 미배정 작품만 담는다', () => {
  const wb = buildCompareWorkbook({ volumes: VOLUMES, allVw: VW, allParts: PARTS, confirmedOnly: false })
  const p1 = wb.Sheets['1부 시']
  expect([p1['A2'].v, p1['A3'].v]).toEqual(['[확정] 1편 · 현대 1', '소나기 (황순원) · 확정'])
  expect(p1['B2']?.v ?? '').toBe('')                   // 2권은 부가 없다 → 띠 글자 없음
  expect(p1['B2']?.s?.fill?.fgColor?.rgb).toBe('DDEBF7') // 그래도 띠 색은 이어진다
  expect(p1['A4']?.v ?? '').toBe('')                   // 1부에 후보가 없으니 후보 띠 없음
  const un = wb.Sheets['미배정']
  expect([un['A2'].v, un['A3'].v, un['A4'].v]).toEqual(['[확정] 0편', '[후보] 1편 · 현대 1', '산유화 (김소월) · 후보'])
  expect(un['B3']?.v ?? '').toBe('')                   // 2권(부 없음)의 소나기는 미배정이 아니다
})

test("부별 탭: '확정만 보기'면 확정 띠만 남는다", () => {
  const wb = buildCompareWorkbook({ volumes: VOLUMES, allVw: VW, allParts: PARTS, confirmedOnly: true })
  expect(wb.SheetNames).toEqual(['1부 시', '전체 배치', '전체 목록']) // 미배정엔 확정이 없어 탭이 빠진다
  const p1 = wb.Sheets['1부 시']
  expect(p1['A2'].v).toBe('[확정] 1편 · 현대 1')
  expect(p1['A4']?.v ?? '').toBe('')
})
