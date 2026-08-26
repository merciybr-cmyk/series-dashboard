// 갈래별 후보 엑셀 내보내기 (2026-08-26 사용자 요청)
// 양식: 연번 / 작품명 / 작가명 / 갈래 / 수록 교육과정 — 머리행 파란 배경·흰색 볼드
// xlsx-js-style: SheetJS 호환 + 셀 서식 지원 (무료판 xlsx는 서식 미지원)
import * as XLSX from 'xlsx-js-style'
import { GENRE_BUCKETS, groupPicksByBucket } from './genreUtils.js'
import { sortCurricula } from '../works/workKey.js'

export function picksToRows(picks) {
  return picks.map((p, i) => ({
    '연번': i + 1,
    '작품명': p.work_snapshot?.title || '',
    '작가명': p.work_snapshot?.author || '',
    '갈래': p.work_snapshot?.genre || '',
    '수록 교육과정': sortCurricula(p.work_snapshot?.curriculum || []).join(', '),
  }))
}

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '4472C4' } }, // 엑셀 표준 파랑 계열
  alignment: { horizontal: 'center', vertical: 'center' },
}

function sheetOf(picks) {
  const ws = XLSX.utils.json_to_sheet(picksToRows(picks))
  ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 16 }, { wch: 10 }, { wch: 55 }]
  // 머리행(A1~E1) 스타일
  for (const col of ['A', 'B', 'C', 'D', 'E']) {
    const cell = ws[`${col}1`]
    if (cell) cell.s = HEADER_STYLE
  }
  // 연번 열 가운데 정렬
  for (let r = 2; r <= picks.length + 1; r++) {
    const cell = ws[`A${r}`]
    if (cell) cell.s = { alignment: { horizontal: 'center' } }
  }
  return ws
}

// 시트 이름 금지 문자(: \ / ? * [ ]) 방어
function safeSheetName(name) {
  return name.replace(/[:\\/?*[\]]/g, '·').slice(0, 31)
}

export function buildBucketWorkbook(picks, bucket) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetOf(picks), safeSheetName(bucket))
  return wb
}

// 전체: 갈래별 시트로 분리 (빈 갈래는 생략)
export function buildAllWorkbook(picks) {
  const groups = groupPicksByBucket(picks)
  const wb = XLSX.utils.book_new()
  for (const b of [...GENRE_BUCKETS, '기타']) {
    if (!groups[b]?.length) continue
    XLSX.utils.book_append_sheet(wb, sheetOf(groups[b]), safeSheetName(b))
  }
  return wb
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
}

export function downloadBucketExcel(picks, bucket) {
  XLSX.writeFile(buildBucketWorkbook(picks, bucket), `갈래별 후보_${bucket}_${today()}.xlsx`)
}

export function downloadAllExcel(picks) {
  XLSX.writeFile(buildAllWorkbook(picks), `갈래별 후보_전체_${today()}.xlsx`)
}
