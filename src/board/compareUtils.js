// 권별 비교 화면과 엑셀이 함께 쓰는 열 구성 (2026-10-01):
// 권(번호순) → 부 그룹(그룹 안은 고전 → 현대 순) → 작품, 그리고 그룹·권별 고전/현대 편수
import { groupByPart, partLabel } from './boardUtils.js'
import { orderByEra, countEras, bucketOf } from './genreUtils.js'
import { partNumberFor } from './placementUtils.js'
import { isKnownAuthor } from './autoPlace.js'
import { normText } from '../works/workKey.js'

// 편집 중 뺀 행(_removed)은 화면에는 취소선으로 남지만 편수·겹침에서는 뺀다 (2026-10-02)
const live = w => !w._removed

// work_id → 수록 권 id 목록 (제외 상태·뺀 행은 겹침 판정에서 뺀다)
export function volumesByWork(allVw) {
  const map = new Map()
  for (const w of allVw) {
    if (w.selection_status === 'excluded' || w._removed) continue
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
      counts: countEras(g.works.filter(live)),
    }))
    return { volume, groups, counts: countEras(works.filter(live)) }
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

// 작품 줄 경고 (설계 2026-10-02 §4.2) — 막지 않고 표시만. 보기·편집 모드 공통.
export const AUTHOR_WARN_AT = 3
export const WARNING_LABELS = { noHistory: '수록 이력 없음', partMismatch: '부 확인', authorOver: `작가 ${AUTHOR_WARN_AT}편` }

export function expectedPartOf(genre) {
  return partNumberFor(bucketOf(genre), genre)
}

// 행 id → 경고 키 목록. 제외 상태와 편집 중 뺀 행은 계산에서 뺀다.
export function compareWarnings(rows, volumes, parts) {
  const volById = new Map(volumes.map(v => [v.id, v]))
  const partById = new Map(parts.map(p => [p.id, p]))
  const active = rows.filter(r => r.selection_status !== 'excluded' && live(r))
  const authorKey = r => `${r.volume_id}|${normText(r.work_snapshot?.author)}`
  const authorCount = new Map()
  for (const r of active) {
    if (!isKnownAuthor(r.work_snapshot?.author)) continue
    authorCount.set(authorKey(r), (authorCount.get(authorKey(r)) || 0) + 1)
  }
  const out = new Map()
  for (const r of active) {
    const list = []
    const cur = r.work_snapshot?.curriculum || []
    const vcur = volById.get(r.volume_id)?.curricula || []
    if (cur.length && vcur.length && !cur.some(c => vcur.includes(c))) list.push('noHistory')
    const expected = expectedPartOf(r.work_snapshot?.genre)
    const part = partById.get(r.part_id)
    if (expected != null && part && part.number !== expected) list.push('partMismatch')
    if (isKnownAuthor(r.work_snapshot?.author) && authorCount.get(authorKey(r)) >= AUTHOR_WARN_AT) list.push('authorOver')
    if (list.length) out.set(r.id, list)
  }
  return out
}
