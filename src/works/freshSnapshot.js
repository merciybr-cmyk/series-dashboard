// 저장된 work_snapshot을 지금 시트 값으로 덮어 보여 준다 (설계 v2: 표시용 정보는 현재 시트, snapshot은 대비용)
// 2026-10-25: 시트에서 작품명을 고쳐 다른 행과 합쳐져도(예: 청산은 어찌하여 → 도산십이곡)
// 대시보드가 등록 당시 교육과정·작품명에 머물던 문제. DB는 건드리지 않고 불러올 때만 바꾼다.
import { keyOf, workKeyOf, sortCurricula } from './workKey.js'

// 시트 키 → 시트 행 목록
export function buildSheetIndex(works) {
  const index = new Map()
  for (const w of works) {
    const k = workKeyOf(w)
    if (!index.has(k)) index.set(k, [])
    index.get(k).push(w)
  }
  return index
}

// registry 키(별칭 포함)로 시트 행을 모아 snapshot을 새로 만든다. 시트에서 못 찾으면 저장된 snapshot 그대로.
export function freshSnapshot(snapshot, registryRow, index) {
  if (!registryRow) return snapshot
  const primary = index.get(keyOf(registryRow.title, registryRow.author_base)) || []
  const aliasRows = (registryRow.aliases || []).flatMap(a => index.get(keyOf(a.title, a.author_base)) || [])
  const rows = [...primary, ...aliasRows]
  if (!rows.length) return snapshot
  const head = primary[0] || rows[0]
  const genres = [...new Set(rows.map(w => w['장르']).filter(Boolean))]
  const keepGenre = genres.includes(snapshot?.genre)
  return {
    ...snapshot,
    title: head['작품명'],
    author: head['지은이'],
    genre: keepGenre ? snapshot.genre : (genres[0] ?? snapshot?.genre),
    curriculum: sortCurricula([...new Set(rows.map(w => w['교육과정']).filter(Boolean))]),
  }
}

// work_id·work_snapshot을 가진 행들(권 수록·갈래 후보)을 새 snapshot으로. 업무 행처럼 volume_works가 중첩돼 있어도 처리.
export function freshenRows(rows, registryById, index) {
  const one = row => {
    if (!row) return row
    let out = row
    if (row.work_id && row.work_snapshot) {
      const snap = freshSnapshot(row.work_snapshot, registryById.get(row.work_id), index)
      if (snap !== row.work_snapshot) out = { ...out, work_snapshot: snap }
    }
    if (row.volume_works) {
      const nested = one(row.volume_works)
      if (nested !== row.volume_works) out = { ...out, volume_works: nested }
    }
    return out
  }
  return rows.map(one)
}
