// 권별 비교 엑셀 (2026-09-28): 화면의 권별 비교를 회의 자료로 — 한눈에 보기(권=열, 부별) + 전체 목록
import * as XLSX from 'xlsx-js-style'
import { groupByPart, partLabel } from './boardUtils.js'
import { SELECTION_LABELS } from './constants.js'
import { today } from './exportPicks.js'

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
}
const PART_STYLE = { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'DDEBF7' } } }
const DUP_STYLE = { fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } } } // 화면의 노란 겹침 강조

// 권별 → 부 그룹 → 작품. 겹침 판정은 화면과 같이 '제외' 상태를 뺀다.
function buildColumns({ volumes, allVw, allParts, confirmedOnly }) {
  const volumesByWork = new Map()
  for (const w of allVw) {
    if (w.selection_status === 'excluded') continue
    if (!volumesByWork.has(w.work_id)) volumesByWork.set(w.work_id, [])
    volumesByWork.get(w.work_id).push(w.volume_id)
  }
  const numberOf = Object.fromEntries(volumes.map(v => [v.id, v.number]))
  return [...volumes].sort((a, b) => a.number - b.number).map(v => {
    const works = allVw
      .filter(w => w.volume_id === v.id)
      .filter(w => !confirmedOnly || w.selection_status === 'confirmed')
      .sort((a, b) => a.sort_order - b.sort_order)
    const parts = allParts.filter(p => p.volume_id === v.id)
    const groups = groupByPart(works, parts).map(g => ({
      label: parts.length ? (g.part ? partLabel(g.part) : '미배정') : '',
      works: g.works.map(w => ({
        title: w.work_snapshot?.title || '',
        author: w.work_snapshot?.author || '',
        genre: w.work_snapshot?.genre || '',
        status: SELECTION_LABELS[w.selection_status] || w.selection_status,
        others: (volumesByWork.get(w.work_id) || []).filter(id => id !== v.id).map(id => numberOf[id]).sort((a, b) => a - b),
      })),
    }))
    return { volume: v, groups }
  })
}

export function compareRows(args) {
  const rows = []
  for (const col of buildColumns(args)) {
    let n = 0
    for (const g of col.groups) {
      for (const w of g.works) {
        rows.push({
          '권': col.volume.number,
          '권 제목': col.volume.title,
          '부': g.label,
          '순서': ++n,
          '작품명': w.title,
          '작가': w.author,
          '갈래': w.genre,
          '상태': w.status,
          '다른 권 중복': w.others.length ? `${w.others.join('·')}권` : '',
        })
      }
    }
  }
  return rows
}

function overviewSheet(columns) {
  // 열마다 [텍스트, 스타일] 줄 목록을 만든 뒤 가로로 맞춘다
  const lines = columns.map(col => {
    const out = []
    for (const g of col.groups) {
      if (g.label) out.push([`[${g.label}]`, PART_STYLE])
      for (const w of g.works) out.push([`${w.title} (${w.author}) · ${w.status}`, w.others.length ? DUP_STYLE : null])
    }
    return out
  })
  const height = Math.max(0, ...lines.map(l => l.length))
  const aoa = [columns.map(c => `${c.volume.number}권 ${c.volume.title}`)]
  for (let r = 0; r < height; r++) aoa.push(lines.map(l => (l[r] ? l[r][0] : '')))
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = columns.map(() => ({ wch: 32 }))
  columns.forEach((_, c) => {
    ws[XLSX.utils.encode_cell({ r: 0, c })].s = HEADER_STYLE
    lines[c].forEach(([, style], r) => {
      const cell = ws[XLSX.utils.encode_cell({ r: r + 1, c })]
      if (cell && style) cell.s = style
    })
  })
  return ws
}

function listSheet(rows) {
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [6, 28, 12, 6, 28, 12, 8, 8, 12].map(wch => ({ wch }))
  for (let c = 0; c < 9; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (cell) cell.s = HEADER_STYLE
  }
  return ws
}

export function buildCompareWorkbook(args) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, overviewSheet(buildColumns(args)), '한눈에 보기')
  XLSX.utils.book_append_sheet(wb, listSheet(compareRows(args)), '전체 목록')
  return wb
}

export function downloadCompareExcel(args) {
  const suffix = args.confirmedOnly ? '_확정만' : ''
  XLSX.writeFile(buildCompareWorkbook(args), `권별 비교${suffix}_${today()}.xlsx`)
}
