// 권별 비교 저장 (설계 2026-10-02 §3.2): 최신 상태와 맞춰 실행 목록을 세우고(planSave), 한 건씩 반영한다(runSave).
import { nextSortOrder } from './boardUtils.js'
import { assignSortOrders, groupKeyOfRow } from './compareOrder.js'

const MOVED_AWAY = '그사이 다른 분이 옮기거나 뺐습니다'
const TAKEN = '그사이 같은 작품이 들어왔습니다'
const PART_GONE = '옮길 부가 삭제되었습니다'

const slot = (volumeId, workId) => `${volumeId}|${workId}`

export function planSave({ draft, baseline, latestRows, latestParts }) {
  const latestById = new Map(latestRows.map(r => [r.id, r]))
  const baseById = new Map(baseline.map(r => [r.id, r]))
  const titleOf = id => baseById.get(id)?.work_snapshot?.title

  // 편집을 시작한 뒤 다른 분이 권·부를 바꾼 행인가 (옮기기·빼기 모두 이런 행은 건드리지 않는다)
  const changedSince = (base, latest) =>
    !base || latest.volume_id !== base.volume_id || (latest.part_id ?? null) !== (base.part_id ?? null)

  const skipped = []
  const removes = []
  let alreadyRemoved = 0
  for (const id of Object.keys(draft.removes)) {
    const latest = latestById.get(id)
    if (!latest) alreadyRemoved++
    else if (changedSince(baseById.get(id), latest)) skipped.push({ title: titleOf(id), reason: MOVED_AWAY })
    else removes.push({ id, title: titleOf(id) })
  }
  const removing = new Set(removes.map(r => r.id)) // 실제로 지울 행만 자리를 비운다
  const partOk = (volumeId, partId) =>
    partId == null || latestParts.some(p => p.id === partId && p.volume_id === volumeId)
  // 저장 뒤에도 남을 행이 차지하는 (권, 작품) 자리
  const occupied = new Set(latestRows.filter(r => !removing.has(r.id)).map(r => slot(r.volume_id, r.work_id)))

  const candidates = []
  for (const [id, target] of Object.entries(draft.moves)) {
    const latest = latestById.get(id)
    const title = titleOf(id)
    if (!latest || changedSince(baseById.get(id), latest)) {
      skipped.push({ title, reason: MOVED_AWAY })
      continue
    }
    if (!partOk(target.volumeId, target.partId)) {
      skipped.push({ title, reason: PART_GONE })
      continue
    }
    candidates.push({ id, title, workId: latest.work_id, from: latest.volume_id, volumeId: target.volumeId, partId: target.partId })
  }
  // 옮겨 가는 행은 원래 자리를 비운다 (맞바꾸기·빼고 채우기 허용)
  for (const c of candidates) occupied.delete(slot(c.from, c.workId))

  // 같은 작품 자리 판정 — 받아들인 옮기기·넣기만 남긴다
  const accepted = []
  for (const c of candidates) {
    const s = slot(c.volumeId, c.workId)
    if (occupied.has(s)) {
      skipped.push({ title: c.title, reason: TAKEN })
      occupied.add(slot(c.from, c.workId)) // 못 옮긴 행은 제자리에 남는다
      continue
    }
    occupied.add(s)
    accepted.push(c)
  }
  const acceptedAdds = []
  for (const a of draft.adds) {
    const title = a.snapshot?.title
    if (!partOk(a.volumeId, a.partId)) {
      skipped.push({ title, reason: PART_GONE })
      continue
    }
    if (a.workId) {
      const s = slot(a.volumeId, a.workId)
      if (occupied.has(s)) {
        skipped.push({ title, reason: TAKEN })
        continue
      }
      occupied.add(s)
    }
    acceptedAdds.push(a)
  }

  // 순서 번호 (설계 compare-order §2·§4): 저장 뒤 남는 행(home) + 옮겨 오는 행 + 넣는 행으로 배정한다.
  // 그사이 다른 분이 넣은 작품은 순서 목록에 없으므로 묶음 뒤에 붙고, 그사이 빠진 작품은 무시된다.
  const movingIds = new Set(accepted.map(c => c.id))
  const live = [
    ...latestRows.filter(r => !removing.has(r.id) && !movingIds.has(r.id)).map(r => ({ ...r, home: true })),
    ...accepted.map(c => ({ ...latestById.get(c.id), volume_id: c.volumeId, part_id: c.partId, home: false })),
    ...acceptedAdds.map(a => ({ id: a.tempId, volume_id: a.volumeId, part_id: a.partId, sort_order: null, work_snapshot: a.snapshot, home: false })),
  ]
  const orders = draft.orders || {}
  const freshStart = volumeId => nextSortOrder(latestRows.filter(r => r.volume_id === volumeId && !removing.has(r.id)))
  const assigned = assignSortOrders(live, { orders, freshStart })

  const moves = accepted.map(c => ({ id: c.id, title: c.title, volumeId: c.volumeId, partId: c.partId, sortOrder: assigned.get(c.id) }))
  const adds = acceptedAdds.map(a => ({ ...a, title: a.snapshot?.title, sortOrder: assigned.get(a.tempId) }))
  // 순서를 바꾼 묶음에서 남는 행 중 번호가 달라지는 행만 고친다
  const reorders = Object.keys(orders).map(groupKey => ({
    groupKey,
    ops: live
      .filter(r => r.home && groupKeyOfRow(r) === groupKey && assigned.get(r.id) !== r.sort_order)
      .sort((a, b) => assigned.get(a.id) - assigned.get(b.id))
      .map(r => ({ id: r.id, title: r.work_snapshot?.title, sortOrder: assigned.get(r.id) })),
  }))

  return { removes, moves, adds, reorders, skipped, alreadyRemoved }
}

const isDuplicate = err => /duplicate key|23505/i.test(err?.message || '')

// api = { deleteVolumeWork, updateVolumeWork, ensureWorkId, insertPlacedWork } (volumeApi.js)
// 한 건이 실패해도 나머지는 계속한다.
export async function runSave(plan, api, { registryMap }) {
  const result = { removed: plan.alreadyRemoved, moved: 0, added: 0, reordered: 0, skipped: [...plan.skipped], failed: [] }

  for (const r of plan.removes) {
    try {
      await api.deleteVolumeWork(r.id)
      result.removed++
    } catch (err) {
      result.failed.push({ title: r.title, reason: err.message })
    }
  }

  let pending = plan.moves
  for (let pass = 0; pass < 2 && pending.length; pass++) {
    const retry = []
    for (const m of pending) {
      try {
        // 옮긴 행은 사람이 고친 것이다 — 자동 배치 되돌리기가 새 권에서 지우지 않도록 묶음에서 뺀다
        await api.updateVolumeWork(m.id, {
          volume_id: m.volumeId, part_id: m.partId, sort_order: m.sortOrder, placement_batch_id: null,
        })
        result.moved++
      } catch (err) {
        if (pass === 0 && isDuplicate(err)) retry.push(m) // 다른 옮기기가 자리를 비운 뒤 다시
        else result.failed.push({ title: m.title, reason: isDuplicate(err) ? '옮길 권에 같은 작품이 있습니다' : err.message })
      }
    }
    pending = retry
  }

  for (const a of plan.adds) {
    try {
      const workId = a.workId || await api.ensureWorkId(a.work, a.curricula, registryMap)
      const row = await api.insertPlacedWork({
        volumeId: a.volumeId, workId, workSnapshot: a.snapshot, partId: a.partId, batchId: null, sortOrder: a.sortOrder,
      })
      if (row) result.added++
      else result.skipped.push({ title: a.title, reason: TAKEN })
    } catch (err) {
      result.failed.push({ title: a.title, reason: err.message })
    }
  }

  // 순서 바꾸기: 한 묶음의 op가 모두 성공하면 1건 (설계 compare-order §4)
  for (const g of plan.reorders || []) {
    let ok = true
    for (const op of g.ops) {
      try {
        await api.updateVolumeWork(op.id, { sort_order: op.sortOrder })
      } catch (err) {
        ok = false
        result.failed.push({ title: op.title, reason: err.message })
      }
    }
    if (ok) result.reordered++
  }
  return result
}

// listAttachmentRefs 결과(각 배열은 volume_work_id 목록) → 행별 개수
export function countAttachments({ tasks = [], comments = [], files = [] }) {
  const map = new Map()
  const bump = (id, field) => {
    if (!map.has(id)) map.set(id, { tasks: 0, comments: 0, files: 0 })
    map.get(id)[field]++
  }
  for (const id of tasks) bump(id, 'tasks')
  for (const id of comments) bump(id, 'comments')
  for (const id of files) bump(id, 'files')
  return map
}

export function attachmentText(c) {
  if (!c) return ''
  const gone = [c.tasks && `업무 ${c.tasks}건`, c.comments && `의견 ${c.comments}건`].filter(Boolean)
  const parts = []
  if (gone.length) parts.push(`${gone.join('·')}이 함께 지워집니다`)
  if (c.files) parts.push(`자료 ${c.files}건은 작품 연결이 끊겨 자료실로 갑니다`)
  return parts.join(' / ')
}

export function resultSummary({ moved, added, removed, reordered = 0 }) {
  return `반영했습니다: 옮기기 ${moved} · 넣기 ${added} · 빼기 ${removed} · 순서 ${reordered}`
}
