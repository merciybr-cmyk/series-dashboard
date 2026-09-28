// 자동 배치안 엑셀 (설계 2026-09-28 §3.4) — 2026-09-28 수동 배치안 엑셀과 같은 구성
import * as XLSX from 'xlsx-js-style'
import { sortCurricula } from '../works/workKey.js'
import { firstCurriculum, WEIGHTS, AUTHOR_LIMIT } from './autoPlace.js'
import { REASON_LABELS, UNPLACEABLE_LABELS } from './placementUtils.js'
import { today } from './exportPicks.js'

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
}
const SUBHEAD_STYLE = {
  font: { bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'DDEBF7' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
}
const DUP_STYLE = { fill: { patternType: 'solid', fgColor: { rgb: 'FCE4D6' } } }

const isDup = p => p.warnings.includes('authorDup') || p.warnings.includes('authorOver')

function noteOf(p) {
  const n = []
  if (isDup(p)) n.push(`작가 중복(${p.work.author}) — 2차 조정 대상`)
  if (p.warnings.includes('ineligible')) n.push('수록 이력 없는 권(직접 조정)')
  return n.join(' / ')
}

export function placementRows({ columns }) {
  const rows = []
  for (const col of columns) {
    col.proposed.forEach((p, i) => rows.push({
      '권': col.volume.number,
      '교육과정기': (col.volume.curricula || []).join('·'),
      '권 내 번호': i + 1,
      '작품명': p.work.title,
      '작가명': p.work.author,
      '수록 교육과정': sortCurricula(p.work.curricula).join(', '),
      '첫 수록 시기': firstCurriculum(p.work.curricula) || '',
      '배치 근거': p.reasons.map(r => REASON_LABELS[r]).join(' · '),
      '비고': noteOf(p),
    }))
  }
  return rows
}

function overviewSheet(columns) {
  const aoa = [
    ['권', ...columns.map(c => `${c.volume.number}권`)],
    ['교육과정기', ...columns.map(c => (c.volume.curricula || []).join('·'))],
    ['권 제목', ...columns.map(c => c.volume.title)],
    ['편수', ...columns.map(c => `기존 ${c.existing.length} + 신규 ${c.proposed.length}`)],
  ]
  const maxN = Math.max(0, ...columns.map(c => c.proposed.length))
  for (let k = 0; k < maxN; k++) {
    aoa.push([k + 1, ...columns.map(c => (c.proposed[k] ? `${c.proposed[k].work.title} (${c.proposed[k].work.author})` : ''))])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 12 }, ...columns.map(() => ({ wch: 28 }))]
  for (let c = 0; c <= columns.length; c++) {
    const top = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (top) top.s = HEADER_STYLE
    for (let r = 1; r <= 3; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (cell) cell.s = c === 0 ? HEADER_STYLE : SUBHEAD_STYLE
    }
  }
  columns.forEach((col, ci) => col.proposed.forEach((p, k) => {
    const cell = ws[XLSX.utils.encode_cell({ r: 4 + k, c: ci + 1 })]
    if (cell && isDup(p)) cell.s = DUP_STYLE
  }))
  return ws
}

function listSheet(columns) {
  const ws = XLSX.utils.json_to_sheet(placementRows({ columns }))
  ws['!cols'] = [6, 15, 9, 30, 12, 52, 12, 18, 34].map(wch => ({ wch }))
  for (let c = 0; c < 9; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (cell) cell.s = HEADER_STYLE
  }
  return ws
}

function criteriaSheet(bucket) {
  const aoa = [
    [`${bucket} 자동 배치 기준`],
    ['수록 이력', '작품이 실제로 실린 교육과정기의 권에만 배치(권의 교육과정기는 권 목록에서 설정).'],
    ['첫 수록', `작품이 처음 교과서에 실린 시기의 권에 가점 +${WEIGHTS.debut}.`],
    ['콘셉트', `갈래별 후보의 '어울리는 권' 태그에 있는 권에 가점 +${WEIGHTS.concept}.`],
    ['작가 중복', `같은 권 같은 작가는 감점 ${WEIGHTS.authorDup}, 권당 최대 ${AUTHOR_LIMIT}편.`],
    ['분량', `권별 편수가 평균 ±${WEIGHTS.balanceBand}편을 벗어나면 1편당 ${WEIGHTS.balancePenalty}.`],
    ['배치 근거', "'첫 수록'·'콘셉트'에 해당하지 않으면 '균형'(분량을 맞추려고 배치) — 2차 논의 때 우선 검토 대상."],
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 14 }, { wch: 100 }]
  ws['A1'].s = { font: { bold: true, sz: 13 } }
  return ws
}

function heldSheet(held, holdReasons) {
  const ws = XLSX.utils.json_to_sheet(held.map(w => ({
    '작품명': w.title,
    '작가명': w.author,
    '수록 교육과정': sortCurricula(w.curricula).join(', '),
    '이유': UNPLACEABLE_LABELS[holdReasons.get(w.workId) || 'manual'],
  })))
  ws['!cols'] = [30, 12, 52, 30].map(wch => ({ wch }))
  for (let c = 0; c < 4; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (cell) cell.s = HEADER_STYLE
  }
  return ws
}

export function buildPlacementWorkbook({ bucket, columns, held, holdReasons }) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, overviewSheet(columns), '한눈에 보기')
  XLSX.utils.book_append_sheet(wb, listSheet(columns), '권별 배치안')
  XLSX.utils.book_append_sheet(wb, criteriaSheet(bucket), '배치 기준')
  if (held.length) XLSX.utils.book_append_sheet(wb, heldSheet(held, holdReasons), '보류함')
  return wb
}

export function downloadPlacementExcel(args) {
  XLSX.writeFile(buildPlacementWorkbook(args), `${args.bucket}_권별 배치안_${today()}.xlsx`)
}
