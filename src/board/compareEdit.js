// 권별 비교 편집 상태 (설계 2026-10-02 §5): 편집 중 바뀐 내용을 화면에만 모아 둔다. 순수 함수만.
// draft = { moves: { 행id: { volumeId, partId } }, removes: { 행id: true }, adds: [넣을 작품] }
import { bucketOf } from './genreUtils.js'
import { partNumberFor } from './placementUtils.js'
import { snapshotOf } from '../works/workKey.js'

export const EMPTY_DRAFT = { moves: {}, removes: {}, adds: [] }

const isAdd = (draft, id) => draft.adds.some(a => a.tempId === id)
const samePart = (a, b) => (a ?? null) === (b ?? null)

export function changeCount(draft) {
  return Object.keys(draft.moves).length + Object.keys(draft.removes).length + draft.adds.length
}

// baseline(편집 시작 때 읽은 행)에 draft를 반영한 화면용 행. 표시용 플래그(_moved·_removed·_added)를 붙인다.
export function effectiveRows(baseline, draft) {
  const rows = baseline.map(r => {
    if (draft.removes[r.id]) return { ...r, _removed: true }
    const m = draft.moves[r.id]
    if (m) return { ...r, volume_id: m.volumeId, part_id: m.partId, _moved: { fromVolumeId: r.volume_id, fromPartId: r.part_id } }
    return r
  })
  for (const a of draft.adds) {
    rows.push({
      id: a.tempId, volume_id: a.volumeId, part_id: a.partId, work_id: a.workId,
      sort_order: Number.MAX_SAFE_INTEGER, selection_status: 'candidate',
      work_snapshot: a.snapshot, _added: true, _key: a.key,
    })
  }
  return rows
}

export function moveRow(draft, baseline, rowId, volumeId, partId) {
  if (isAdd(draft, rowId)) {
    return { ...draft, adds: draft.adds.map(a => (a.tempId === rowId ? { ...a, volumeId, partId: partId ?? null } : a)) }
  }
  const base = baseline.find(r => r.id === rowId)
  if (!base) return draft
  const moves = { ...draft.moves }
  if (base.volume_id === volumeId && samePart(base.part_id, partId)) delete moves[rowId]
  else moves[rowId] = { volumeId, partId: partId ?? null }
  return { ...draft, moves }
}

export function removeRow(draft, rowId) {
  if (isAdd(draft, rowId)) return { ...draft, adds: draft.adds.filter(a => a.tempId !== rowId) }
  const moves = { ...draft.moves }
  delete moves[rowId]
  return { ...draft, moves, removes: { ...draft.removes, [rowId]: true } }
}

export function revertRow(draft, rowId) {
  if (isAdd(draft, rowId)) return removeRow(draft, rowId)
  const moves = { ...draft.moves }
  const removes = { ...draft.removes }
  delete moves[rowId]
  delete removes[rowId]
  return { ...draft, moves, removes }
}

// 검색 패널에서 넣기. workId는 registry에 있으면 그 ID, 없으면 null(저장 때 발급)
export function addWork(draft, { tempId, workId, key, work, curricula, volumeId, partId }) {
  return {
    ...draft,
    adds: [...draft.adds, {
      tempId, workId: workId ?? null, key, work, curricula,
      snapshot: snapshotOf(work, curricula), volumeId, partId: partId ?? null,
    }],
  }
}

// 같은 권에 같은 작품이 있는가 (DB unique(volume_id, work_id) — 제외 상태 행도 자리를 차지한다).
// rows는 effectiveRows 결과. 뺀 행과 자기 자신은 세지 않는다. registry에 없는 넣기 작품은 키로 비교.
export function canPlace(rows, { workId = null, key = null, selfId = null }, volumeId) {
  for (const r of rows) {
    if (r._removed || r.id === selfId || r.volume_id !== volumeId) continue
    const same = (workId && r.work_id === workId) || (key && r._key === key)
    if (!same) continue
    return { ok: false, reason: r.selection_status === 'excluded' ? 'excluded' : 'exists' }
  }
  return { ok: true, reason: null }
}

export function placeErrorText(reason, volumeNumber) {
  if (reason === 'excluded') return `${volumeNumber}권에 제외 상태로 있습니다. 권 보드에서 지운 뒤 옮겨 주세요`
  return `이미 ${volumeNumber}권에 있는 작품입니다`
}

// 갈래로 정해지는 부(자동 배치와 같은 규칙). 그 번호의 부가 그 권에 없으면 null
export function defaultPartFor(genre, volumeParts) {
  const n = partNumberFor(bucketOf(genre), genre)
  if (n == null) return null
  return volumeParts.find(p => p.number === n)?.id ?? null
}

// 끌어다 놓기 결과. 놓을 수 없으면 draft는 그대로 두고 error 문구를 돌려준다.
export function resolveDrop({ draft, baseline, active, over, volumeNumberOf, newTempId }) {
  if (!active || !over) return { draft, error: null }
  const rows = effectiveRows(baseline, draft)
  if (active.type === 'row') {
    const row = rows.find(r => r.id === active.rowId)
    if (!row || row._removed) return { draft, error: null }
    if (row.volume_id === over.volumeId && samePart(row.part_id, over.partId)) return { draft, error: null }
    const check = canPlace(rows, { workId: row.work_id, key: row._key, selfId: row.id }, over.volumeId)
    if (!check.ok) return { draft, error: placeErrorText(check.reason, volumeNumberOf(over.volumeId)) }
    return { draft: moveRow(draft, baseline, row.id, over.volumeId, over.partId), error: null }
  }
  if (active.type === 'sheet') {
    const check = canPlace(rows, { workId: active.workId, key: active.key }, over.volumeId)
    if (!check.ok) return { draft, error: placeErrorText(check.reason, volumeNumberOf(over.volumeId)) }
    return {
      draft: addWork(draft, {
        tempId: newTempId(), workId: active.workId, key: active.key, work: active.work,
        curricula: active.curricula, volumeId: over.volumeId, partId: over.partId,
      }),
      error: null,
    }
  }
  return { draft, error: null }
}

// 검색 결과 끌기 데이터 → resolveDrop용 (work_id는 registry에서, 교육과정은 이때 계산)
export function toDropActive(data, registryMap) {
  if (data?.type !== 'sheet') return data
  return { type: 'sheet', key: data.key, work: data.work, workId: registryMap.get(data.key) ?? null, curricula: data.getCurricula() }
}

// 저장 확인 창 목록. place(volumeId, partId) → '5권 2부'
export function describeDraft(draft, baseline, place) {
  const byId = new Map(baseline.map(r => [r.id, r]))
  const items = []
  for (const [id, m] of Object.entries(draft.moves)) {
    const r = byId.get(id)
    items.push({ kind: 'move', rowId: id, title: r?.work_snapshot?.title, from: place(r?.volume_id, r?.part_id), to: place(m.volumeId, m.partId) })
  }
  for (const a of draft.adds) {
    items.push({ kind: 'add', rowId: a.tempId, title: a.snapshot?.title, to: place(a.volumeId, a.partId) })
  }
  for (const id of Object.keys(draft.removes)) {
    const r = byId.get(id)
    items.push({ kind: 'remove', rowId: id, title: r?.work_snapshot?.title, from: place(r?.volume_id, r?.part_id) })
  }
  return items
}
