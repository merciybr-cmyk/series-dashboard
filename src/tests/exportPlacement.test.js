import { placementRows, buildPlacementWorkbook } from '../board/exportPlacement.js'

const v1 = { id: 'v1', number: 1, title: '교과서 문학의 첫 장면', curricula: ['1차', '2차', '3차'] }
const v2 = { id: 'v2', number: 2, title: '오래 남을 문학의 자리', curricula: ['4차'] }
const w = (workId, title, author, curricula) => ({ workId, title, author, curricula, conceptVolumeIds: [] })
const COLUMNS = [
  { volume: v1, existing: [], total: 1, proposed: [{ work: w('W1', '진달래꽃', '김소월', ['1차', '4차']), reasons: ['debut'], warnings: [] }] },
  { volume: v2, existing: [{ title: '님의 침묵', author: '한용운' }], total: 3, proposed: [
    { work: w('W2', '서시', '윤동주', ['4차']), reasons: ['debut', 'concept'], warnings: ['authorDup'] },
    { work: w('W3', '자화상', '윤동주', ['5차', '4차']), reasons: ['balance'], warnings: ['authorDup'] },
  ] },
]
const HELD = [w('W9', '낯선 시', '작가', ['1995개정'])]

test('placementRows: 권·권 내 번호·근거·비고', () => {
  const rows = placementRows({ columns: COLUMNS })
  expect(rows).toHaveLength(3)
  expect(rows[0]).toEqual({
    '권': 1, '교육과정기': '1차·2차·3차', '권 내 번호': 1, '작품명': '진달래꽃', '작가명': '김소월',
    '수록 교육과정': '1차, 4차', '첫 수록 시기': '1차', '배치 근거': '첫 수록', '비고': '',
  })
  expect(rows[1]['배치 근거']).toBe('첫 수록 · 콘셉트')
  expect(rows[1]['비고']).toBe('작가 중복(윤동주) — 2차 조정 대상')
  expect(rows[2]['권 내 번호']).toBe(2)
})

test('buildPlacementWorkbook: 한눈에 보기 / 권별 배치안 / 배치 기준 / 보류함', () => {
  const wb = buildPlacementWorkbook({ bucket: '현대시', columns: COLUMNS, held: HELD, holdReasons: new Map([['W9', 'noEligibleVolume']]) })
  expect(wb.SheetNames).toEqual(['한눈에 보기', '권별 배치안', '배치 기준', '보류함'])
  const ov = wb.Sheets['한눈에 보기']
  expect(ov['B1'].v).toBe('1권')
  expect(ov['C2'].v).toBe('4차')
  expect(ov['C4'].v).toBe('기존 1 + 신규 2')
  expect(ov['C5'].v).toBe('서시 (윤동주)')
  expect(ov['B1'].s.fill.fgColor.rgb).toBe('4472C4')
  expect(ov['C5'].s.fill.fgColor.rgb).toBe('FCE4D6') // 작가 중복 강조
  expect(wb.Sheets['권별 배치안']['D2'].v).toBe('진달래꽃')
  expect(wb.Sheets['보류함']['D2'].v).toBe('수록 교육과정에 맞는 권 없음')
})

test('보류함이 비면 시트를 만들지 않는다', () => {
  const wb = buildPlacementWorkbook({ bucket: '현대시', columns: COLUMNS, held: [], holdReasons: new Map() })
  expect(wb.SheetNames).toEqual(['한눈에 보기', '권별 배치안', '배치 기준'])
})
