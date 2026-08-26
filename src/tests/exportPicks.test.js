import * as XLSX from 'xlsx'
import { picksToRows, buildBucketWorkbook, buildAllWorkbook } from '../board/exportPicks.js'

const PICKS = [
  { id: 'a', work_snapshot: { title: '풀', author: '김수영', genre: '시', curriculum: ['2007개정', '7차', '1차'] } },
  { id: 'b', work_snapshot: { title: '춘향전', author: '미상', genre: '고전산문', curriculum: ['2022개정'] } },
  { id: 'c', work_snapshot: { title: '동백꽃', author: '김유정', genre: '소설', curriculum: [] } },
]

test('picksToRows: 4개 열, 교육과정은 차수→개정 순', () => {
  const rows = picksToRows(PICKS)
  expect(rows[0]).toEqual({
    '작품명': '풀', '작가명': '김수영', '갈래': '시', '수록 교육과정': '1차, 7차, 2007개정',
  })
  expect(Object.keys(rows[0])).toEqual(['작품명', '작가명', '갈래', '수록 교육과정'])
})

test('buildBucketWorkbook: 시트 1개, 헤더와 값이 들어간다', () => {
  const wb = buildBucketWorkbook([PICKS[0]], '현대시')
  expect(wb.SheetNames).toEqual(['현대시'])
  const ws = wb.Sheets['현대시']
  expect(ws['A1'].v).toBe('작품명')
  expect(ws['A2'].v).toBe('풀')
  expect(ws['D2'].v).toBe('1차, 7차, 2007개정')
})

test('buildAllWorkbook: 갈래별 시트로 분리, 빈 갈래 생략, 순서 유지', () => {
  const wb = buildAllWorkbook(PICKS)
  expect(wb.SheetNames).toEqual(['현대시', '현대소설', '고전산문'])
  expect(wb.Sheets['고전산문']['A2'].v).toBe('춘향전')
})

test('시트 이름 금지 문자를 치환한다', () => {
  const wb = buildBucketWorkbook([], '금지/문자:테스트')
  expect(wb.SheetNames[0]).toBe('금지·문자·테스트')
  expect(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])).toEqual([])
})
