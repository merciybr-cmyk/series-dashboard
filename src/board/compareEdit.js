// 권별 비교 편집 상태 (설계 2026-10-02 §5): 편집 중 바뀐 내용을 화면에만 모아 둔다. 순수 함수만.
// draft = { moves: { 행id: { volumeId, partId } }, removes: { 행id: true }, adds: [넣을 작품], orders: { 묶음키: 행id[] } }
// orders(2026-10-02 compare-order): 같은 부·같은 시대 묶음 안의 원하는 순서
import { bucketOf, eraOf } from './genreUtils.js'
import { partNumberFor } from './placementUtils.js'
import { snapshotOf } from '../works/workKey.js'
import { nextSortOrder } from './boardUtils.js'
import { assignSortOrders, groupKeyOf, groupKeyOfRow, eraKeyOf } from './compareOrder.js'

export const EMPTY_DRAFT = { moves: {}, removes: {}, adds: [], orders: {} }

const isAdd = (draft, id) => draft.adds.some(a => a.tempId === id)
const samePart = (a, b) => (a ?? null) === (b ?? null)
const ordersOf = draft => draft.orders || {}
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

export function changeCount(draft) {
  return Object.keys(draft.moves).length + Object.keys(draft.removes).length + draft.adds.length
    + Object.keys(ordersOf(draft)).length
}

// baseline(편집 시작 때 읽은 행)에 draft를 반영한 화면용 행. 표시용 플래그(_moved·_removed·_added)를 붙이고,
// 살아 있는 행의 sort_order를 순서 배정 규칙(compareOrder)으로 다시 매겨 화면 순서를 만든다.
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
  const freshStart = v => nextSortOrder(baseline.filter(r => r.volume_id === v && !draft.removes[r.id]))
  const assigned = assignSortOrders(orderInput(rows, draft), { orders: ordersOf(draft), freshStart })
  return rows.map(r => (assigned.has(r.id) && assigned.get(r.id) !== r.sort_order ? { ...r, sort_order: assigned.get(r.id) } : r))
}

// 순서 배정 입력: 살아 있는 행. home = 옮기지도 넣지도 않은 행. 순서는 home → 옮긴 행(draft 순) → 넣은 행 (저장과 같은 규칙)
function orderInput(rows, draft) {
  const live = rows.filter(r => !r._removed)
  const moveOrder = Object.keys(draft.moves)
  return [
    ...live.filter(r => !r._moved && !r._added).map(r => ({ ...r, home: true })),
    ...live.filter(r => r._moved).sort((a, b) => moveOrder.indexOf(a.id) - moveOrder.indexOf(b.id)).map(r => ({ ...r, home: false })),
    ...live.filter(r => r._added).map(r => ({ ...r, home: false })),
  ]
}

// 묶음의 지금 화면 순서 (rows = effectiveRows 결과, 뺀 행 제외)
export function groupOrder(rows, groupKey) {
  return rows
    .filter(r => !r._removed && groupKeyOfRow(r) === groupKey)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(r => r.id)
}

// 원래 순서와 같아졌거나 구성원이 없어진 묶음 순서는 지운다 — 되돌리면 '바뀐 작품'이 줄어든다
function normalizeOrders(draft, baseline) {
  const orders = ordersOf(draft)
  const keys = Object.keys(orders)
  if (!keys.length) return draft
  const withOrders = effectiveRows(baseline, draft)
  const natural = effectiveRows(baseline, { ...draft, orders: {} })
  const kept = {}
  for (const k of keys) {
    const want = groupOrder(withOrders, k)
    if (want.length && !sameList(want, groupOrder(natural, k))) kept[k] = orders[k]
  }
  return { ...draft, orders: kept }
}

export function moveRow(draft, baseline, rowId, volumeId, partId) {
  if (isAdd(draft, rowId)) {
    return normalizeOrders({ ...draft, adds: draft.adds.map(a => (a.tempId === rowId ? { ...a, volumeId, partId: partId ?? null } : a)) }, baseline)
  }
  const base = baseline.find(r => r.id === rowId)
  if (!base) return draft
  const moves = { ...draft.moves }
  if (base.volume_id === volumeId && samePart(base.part_id, partId)) delete moves[rowId]
  else moves[rowId] = { volumeId, partId: partId ?? null }
  return normalizeOrders({ ...draft, moves }, baseline)
}

export function removeRow(draft, rowId, baseline = null) {
  let next
  if (isAdd(draft, rowId)) next = { ...draft, adds: draft.adds.filter(a => a.tempId !== rowId) }
  else {
    const moves = { ...draft.moves }
    delete moves[rowId]
    next = { ...draft, moves, removes: { ...draft.removes, [rowId]: true } }
  }
  return baseline ? normalizeOrders(next, baseline) : next
}

export function revertRow(draft, rowId, baseline = null) {
  if (isAdd(draft, rowId)) return removeRow(draft, rowId, baseline)
  const moves = { ...draft.moves }
  const removes = { ...draft.removes }
  delete moves[rowId]
  delete removes[rowId]
  const next = { ...draft, moves, removes }
  return baseline ? normalizeOrders(next, baseline) : next
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

// 행을 그 묶음 안 anchorId 앞(before)/뒤(after)로. anchor가 없거나 다른 묶음이면 맨 끝 (설계 compare-order §3)
export function placeInGroup(draft, baseline, rowId, { anchorId = null, position = 'after' } = {}) {
  const rows = effectiveRows(baseline, draft)
  const row = rows.find(r => r.id === rowId)
  if (!row || row._removed) return draft
  const key = groupKeyOfRow(row)
  const ids = groupOrder(rows, key).filter(id => id !== rowId)
  let at = ids.length
  const anchor = anchorId && anchorId !== rowId ? rows.find(r => r.id === anchorId) : null
  if (anchor && !anchor._removed && groupKeyOfRow(anchor) === key) {
    const i = ids.indexOf(anchorId)
    at = position === 'before' ? i : i + 1
  }
  ids.splice(at, 0, rowId)
  return normalizeOrders({ ...draft, orders: { ...ordersOf(draft), [key]: ids } }, baseline)
}

// 같은 묶음 안에서 한 칸 위(-1)·아래(+1). 끝이면 그대로
export function moveInGroup(draft, baseline, rowId, dir) {
  const rows = effectiveRows(baseline, draft)
  const row = rows.find(r => r.id === rowId)
  if (!row || row._removed) return draft
  const key = groupKeyOfRow(row)
  const ids = groupOrder(rows, key)
  const i = ids.indexOf(rowId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return draft
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  return normalizeOrders({ ...draft, orders: { ...ordersOf(draft), [key]: ids } }, baseline)
}

export function revertGroupOrder(draft, groupKey) {
  const orders = { ...ordersOf(draft) }
  delete orders[groupKey]
  return { ...draft, orders }
}

// 놓을 자리 해석 — 화면의 파란 선과 실제 놓기가 같은 규칙을 쓴다.
// 같은 (권, 부, 시대) 묶음의 줄이면 그 줄 앞·뒤, 아니면 그 묶음 마지막 줄 뒤, 묶음이 비면 anchor 없음.
// 자기 자신 위면 null, 자기 줄이 이미 있는 부의 띠·빈 곳(줄 위가 아님)에 놓아도 null — 같은 부에 놓으면 변화 없음.
export function resolveAnchor({ rows, era, selfId = null, over }) {
  if (!over) return null
  if (over.anchorId && over.anchorId === selfId) return null
  if (!over.anchorId && selfId) {
    const self = rows.find(r => r.id === selfId)
    if (self && self.volume_id === over.volumeId && samePart(self.part_id, over.partId)) return null
  }
  const key = groupKeyOf(over.volumeId, over.partId, era)
  const anchor = over.anchorId ? rows.find(r => r.id === over.anchorId) : null
  if (anchor && !anchor._removed && groupKeyOfRow(anchor) === key) {
    return { anchorId: anchor.id, position: over.position === 'before' ? 'before' : 'after' }
  }
  const ids = groupOrder(rows, key).filter(id => id !== selfId)
  return { anchorId: ids.length ? ids[ids.length - 1] : null, position: 'after' }
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
// over: { volumeId, partId, anchorId?, position? } — 줄 위에 놓으면 anchorId·position이 온다 (compare-order)
export function resolveDrop({ draft, baseline, active, over, volumeNumberOf, newTempId }) {
  if (!active || !over) return { draft, error: null }
  const rows = effectiveRows(baseline, draft)
  if (active.type === 'row') {
    const row = rows.find(r => r.id === active.rowId)
    if (!row || row._removed || over.anchorId === row.id) return { draft, error: null }
    let next = draft
    if (!(row.volume_id === over.volumeId && samePart(row.part_id, over.partId))) {
      const check = canPlace(rows, { workId: row.work_id, key: row._key, selfId: row.id }, over.volumeId)
      if (!check.ok) return { draft, error: placeErrorText(check.reason, volumeNumberOf(over.volumeId)) }
      next = moveRow(draft, baseline, row.id, over.volumeId, over.partId)
    }
    // 옮기기 전 행으로 판정한다 — null이면 같은 부에 놓은 것이라 변화 없음 (옮긴 뒤 행으로 보면 다른 부에서 온 줄도 null이 된다)
    const at = resolveAnchor({ rows, era: eraKeyOf(row), selfId: row.id, over })
    if (!at) return { draft: next, error: null }
    return { draft: placeInGroup(next, baseline, row.id, at), error: null }
  }
  if (active.type === 'sheet') {
    const check = canPlace(rows, { workId: active.workId, key: active.key }, over.volumeId)
    if (!check.ok) return { draft, error: placeErrorText(check.reason, volumeNumberOf(over.volumeId)) }
    const tempId = newTempId()
    const next = addWork(draft, {
      tempId, workId: active.workId, key: active.key, work: active.work,
      curricula: active.curricula, volumeId: over.volumeId, partId: over.partId,
    })
    if (!over.anchorId) return { draft: next, error: null }
    const era = eraOf(active.work?.['장르']) || '기타'
    const at = resolveAnchor({ rows: effectiveRows(baseline, next), era, selfId: tempId, over })
    return { draft: placeInGroup(next, baseline, tempId, at || {}), error: null }
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
  for (const key of Object.keys(ordersOf(draft))) {
    const [volumeId, partKey, era] = key.split('|')
    items.push({ kind: 'order', rowId: key, title: null, to: `${place(volumeId, partKey === 'none' ? null : partKey)} ${era}` })
  }
  return items
}
