// 권별 비교 엑셀 (2026-09-28): 화면의 권별 비교를 회의 자료로 — 전체 배치(권=열, 부별) + 전체 목록
// 2026-10-01: 화면과 같이 부 안은 고전 → 현대 순, 부 머리줄에 고전·현대 편수, 전체 목록에 '고전/현대' 열
// 2026-10-01: '제외' 작품은 전체 배치·부별 탭에서 뺀다 (전체 목록에는 남는다). 2026-10-14부터 전체 배치 작품 칸에 '· 상태'를 붙인다.
// 2026-10-14: 부별 탭(화면의 '보는 부'와 짝) — 권=열, 열 안은 확정 → 후보 → 보류 띠, 띠 안은 고전 → 현대. 띠 줄은 권끼리 맞춘다.
//   전체 배치도 부 띠를 권끼리 같은 행에 맞춘다.
//   탭 순서: 부별 탭들 → 전체 배치(옛 '한눈에 보기') → 전체 목록
import * as XLSX from 'xlsx-js-style'
import { SELECTION_LABELS } from './constants.js'
import { eraOf, eraSummary, countEras } from './genreUtils.js'
import { buildCompareColumns, compareSummary, volumesByWork as buildVolumesByWork, partOptions, filterColumnsByPart } from './compareUtils.js'
import { today } from './exportPicks.js'

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
}
const PART_STYLE = { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'DDEBF7' } } }
const DUP_STYLE = { fill: { patternType: 'solid', fgColor: { rgb: 'FFF2CC' } } } // 화면의 노란 겹침 강조
// 부별 탭의 상태 띠: 확정(파랑) → 후보(회색) → 보류(살구)
const STATUS_BANDS = [
  { key: 'confirmed', style: PART_STYLE },
  { key: 'candidate', style: { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'EDEDED' } } } },
  { key: 'hold', style: { font: { bold: true }, fill: { patternType: 'solid', fgColor: { rgb: 'FCE4D6' } } } },
]

// 권별 → 부 그룹 → 작품 (묶음·순서·편수는 화면과 같은 compareUtils). 겹침 판정은 화면과 같이 '제외' 상태를 뺀다.
function buildColumns(args) {
  const volumesByWork = buildVolumesByWork(args.allVw)
  const numberOf = Object.fromEntries(args.volumes.map(v => [v.id, v.number]))
  return buildCompareColumns(args).map(({ volume, groups }) => ({
    volume,
    groups: groups.map(g => ({
      part: g.part,
      label: g.label,
      counts: g.counts,
      works: g.works.map(w => ({
        title: w.work_snapshot?.title || '',
        author: w.work_snapshot?.author || '',
        genre: w.work_snapshot?.genre || '',
        era: eraOf(w.work_snapshot?.genre) || '기타',
        statusKey: w.selection_status,
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

const cellText = w => (w.author ? `${w.title} (${w.author})` : w.title)

// 열마다 [텍스트, 스타일] 줄 목록을 받아 권=열 시트로 만든다 (머리줄은 권 이름)
function columnsSheet(columns, lines) {
  const height = Math.max(0, ...lines.map(l => l.length))
  const aoa = [columns.map(c => `${c.volume.number}권 ${c.volume.title}`)]
  for (let r = 0; r < height; r++) aoa.push(lines.map(l => (l[r] ? l[r][0] : '')))
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = columns.map(() => ({ wch: 32 }))
  columns.forEach((_, c) => {
    ws[XLSX.utils.encode_cell({ r: 0, c })].s = HEADER_STYLE
    lines[c].forEach(([, style], r) => {
      const addr = XLSX.utils.encode_cell({ r: r + 1, c })
      if (!style) return
      if (!ws[addr]) ws[addr] = { t: 's', v: '' } // 빈 띠 칸에도 색을 입힌다
      ws[addr].s = style
    })
  })
  return ws
}

// 띠(부 또는 상태)마다 가장 긴 권에 맞춰 비워, 띠 줄이 모든 권에서 같은 행에 오게 한다.
// sections: [{ style, cells: [{ text, works }] (권 순) }] → 열마다 [텍스트, 스타일] 줄 목록
function alignedLines(sections, textOf = cellText) {
  const lines = sections[0]?.cells.map(() => []) ?? []
  for (const sec of sections) {
    const depth = Math.max(0, ...sec.cells.map(c => c.works.length))
    sec.cells.forEach((cell, c) => {
      lines[c].push([cell.text, sec.style])
      for (let i = 0; i < depth; i++) {
        const w = cell.works[i]
        lines[c].push(w ? [textOf(w), w.others.length ? DUP_STYLE : null] : ['', null])
      }
    })
  }
  return lines
}

// 전체 배치: 권=열, 부 띠(번호순, 미배정·부 없음은 끝)가 모든 권에서 같은 행에 — 그 부가 없는 권은 띠 글자 없이 색만 (2026-10-14)
// 여기엔 상태 띠가 없으니 작품 칸에 '· 상태'를 붙인다 (사용자 결정 2026-10-14). 부별 탭은 띠가 상태라 안 붙인다.
function overviewSheet(columns) {
  const labels = compareSummary(columns).map(r => r.label)
  const sections = labels.map(label => ({
    style: PART_STYLE,
    cells: columns.map(col => {
      const g = col.groups.find(x => (x.label || '부 없음') === label)
      if (!g) return { text: '', works: [] }
      return { text: `[${label}] ${eraSummary(g.counts)}`.trim(), works: g.works.filter(w => !w.excluded) }
    }),
  }))
  return columnsSheet(columns, alignedLines(sections, w => `${cellText(w)} · ${w.status}`))
}

// 부 하나의 탭: 권마다 그 부의 작품을 상태별로 나누고, 확정 → 후보 → 보류 띠를 권끼리 같은 행에 맞춘다.
// 확정 띠는 늘 넣고, 후보·보류 띠는 어느 권에든 그 상태 작품이 있을 때만. 그 부가 없는 권은 띠 글자 없이 색만.
// 작품 칸에는 상태를 따로 적지 않는다 — 띠가 상태다 (사용자 결정 2026-10-14)
function partSheet(columns, partKey) {
  const perVolume = filterColumnsByPart(columns, partKey).map(col => {
    const works = col.groups.flatMap(g => g.works).filter(w => !w.excluded)
    const hasPart = col.groups.length > 0
    return { hasPart, byStatus: Object.fromEntries(STATUS_BANDS.map(b => [b.key, works.filter(w => w.statusKey === b.key)])) }
  })
  const bands = STATUS_BANDS.filter(b => b.key === 'confirmed' || perVolume.some(v => v.byStatus[b.key].length))
  const sections = bands.map(band => ({
    style: band.style,
    cells: perVolume.map(v => {
      const ws = v.byStatus[band.key]
      const counts = countEras(ws.map(w => ({ work_snapshot: { genre: w.genre } })))
      const text = v.hasPart ? `[${SELECTION_LABELS[band.key]}] ${ws.length}편${ws.length ? ` · ${eraSummary(counts)}` : ''}` : ''
      return { text, works: ws }
    }),
  }))
  return columnsSheet(columns, alignedLines(sections))
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

// 엑셀 탭 이름 규칙: 31자 이내, []:*?/\ 금지
const BAD_SHEET_CHARS = ['[', ']', ':', '*', '?', '/', String.fromCharCode(92)]
const sheetName = label => [...label].map(ch => (BAD_SHEET_CHARS.includes(ch) ? ' ' : ch)).join('').slice(0, 31)

export function buildCompareWorkbook(args) {
  const wb = XLSX.utils.book_new()
  const columns = buildColumns(args)
  for (const o of partOptions(columns)) XLSX.utils.book_append_sheet(wb, partSheet(columns, o.key), sheetName(o.label))
  XLSX.utils.book_append_sheet(wb, overviewSheet(columns), '전체 배치')
  XLSX.utils.book_append_sheet(wb, listSheet(compareRows(args)), '전체 목록')
  return wb
}

export function downloadCompareExcel(args) {
  const suffix = args.confirmedOnly ? '_확정만' : ''
  XLSX.writeFile(buildCompareWorkbook(args), `권별 비교${suffix}_${today()}.xlsx`)
}
