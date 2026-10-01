// 권별 비교 화면과 엑셀이 함께 쓰는 열 구성 (2026-10-01):
// 권(번호순) → 부 그룹(그룹 안은 고전 → 현대 순) → 작품, 그리고 그룹·권별 고전/현대 편수
import { groupByPart, partLabel } from './boardUtils.js'
import { orderByEra, countEras } from './genreUtils.js'

// work_id → 수록 권 id 목록 (제외 상태는 겹침 판정에서 뺀다)
export function volumesByWork(allVw) {
  const map = new Map()
  for (const w of allVw) {
    if (w.selection_status === 'excluded') continue
    if (!map.has(w.work_id)) map.set(w.work_id, [])
    map.get(w.work_id).push(w.volume_id)
  }
  return map
}

export function totalOf(counts) {
  return counts['고전'] + counts['현대'] + counts['기타']
}

export function buildCompareColumns({ volumes, allVw, allParts, confirmedOnly }) {
  return [...volumes].sort((a, b) => a.number - b.number).map(volume => {
    const works = allVw
      .filter(w => w.volume_id === volume.id)
      .filter(w => !confirmedOnly || w.selection_status === 'confirmed')
      .sort((a, b) => a.sort_order - b.sort_order)
    const parts = allParts.filter(p => p.volume_id === volume.id)
    const groups = groupByPart(works, parts).map(g => ({
      part: g.part,
      label: g.part ? partLabel(g.part) : (parts.length ? '미배정' : ''),
      works: orderByEra(g.works),
      counts: countEras(g.works),
    }))
    return { volume, groups, counts: countEras(works) }
  })
}

// 구성 요약표: 행 = 부 이름(부 번호순, 미배정·부 없음은 끝), 칸 = 권별 편수. 그 권에 없는 부는 null.
export function compareSummary(columns) {
  const order = new Map()
  for (const col of columns) {
    for (const g of col.groups) {
      const label = g.label || '부 없음'
      if (!order.has(label)) order.set(label, g.part ? g.part.number : Number.MAX_SAFE_INTEGER)
    }
  }
  const labels = [...order].sort((a, b) => a[1] - b[1]).map(([label]) => label)
  return labels.map(label => ({
    label,
    cells: columns.map(col => col.groups.find(g => (g.label || '부 없음') === label)?.counts ?? null),
  }))
}
