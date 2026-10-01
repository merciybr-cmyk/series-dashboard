// 권별 비교 엑셀 (2026-09-28): 화면의 권별 비교를 회의 자료로 — 한눈에 보기(권=열, 부별) + 전체 목록
// 2026-10-01: 화면과 같이 부 안은 고전 → 현대 순, 부 머리줄에 고전·현대 편수, 전체 목록에 '고전/현대' 열
// 2026-10-01: 한눈에 보기는 작품명·작가명만(상태 표시 없음) — 그래서 '제외' 작품은 한눈에 보기에서 뺀다. 상태는 전체 목록에서 본다.
import * as XLSX from 'xlsx-js-style'
import { SELECTION_LABELS } from './constants.js'
import { eraOf, eraSummary } from './genreUtils.js'
import { buildCompareColumns, volumesByWork as buildVolumesByWork } from './compareUtils.js'
import { today } from './exportPicks.js'

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
}
const PART_STYLE = { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'DDEBF7' } } }
const DUP_STYLE = { fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } } } // 화면의 노란 겹침 강조

// 권별 → 부 그룹 → 작품 (묶음·순서·편수는 화면과 같은 compareUtils). 겹침 판정은 화면과 같이 '제외' 상태를 뺀다.
function buildColumns(args) {
  const volumesByWork = buildVolumesByWork(args.allVw)
  const numberOf = Object.fromEntries(args.volumes.map(v => [v.id, v.number]))
  return buildCompareColumns(args).map(({ volume, groups }) => ({
    volume,
    groups: groups.map(g => ({
      label: g.label,
      counts: g.counts,
      works: g.works.map(w => ({
        title: w.work_snapshot?.title || '',
        author: w.work_snapshot?.author || '',
        genre: w.work_snapshot?.genre || '',
        era: eraOf(w.work_snapshot?.genre) || '기타',
        status: SELECTION_LABELS[w.selection_status] || w.selection_status,
        excluded: w.selection_status === 'excluded',
        others: (volumesByWork.get(w.work_id) || []).filter(id => id !== volume.id).map(id => numberOf[id]).sort((a, b) => a - b),
      })),
    })),
  }))
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
          '고전/현대': w.era,
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
      if (g.label) out.push([`[${g.label}] ${eraSummary(g.counts)}`.trim(), PART_STYLE])
      for (const w of g.works) {
        if (w.excluded) continue
        out.push([w.author ? `${w.title} (${w.author})` : w.title, w.others.length ? DUP_STYLE : null])
      }
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
  ws['!cols'] = [6, 28, 12, 6, 28, 12, 8, 9, 8, 12].map(wch => ({ wch }))
  for (let c = 0; c < 10; c++) {
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
