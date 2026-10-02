// 권별 비교 저장 (설계 2026-10-02 §3.2): 최신 상태와 맞춰 실행 목록을 세우고(planSave), 한 건씩 반영한다(runSave).
import { nextSortOrder } from './boardUtils.js'

const MOVED_AWAY = '그사이 다른 분이 옮기거나 뺐습니다'
const TAKEN = '그사이 같은 작품이 들어왔습니다'
const PART_GONE = '옮길 부가 삭제되었습니다'

const slot = (volumeId, workId) => `${volumeId}|${workId}`

export function planSave({ draft, baseline, latestRows, latestParts }) {
  const latestById = new Map(latestRows.map(r => [r.id, r]))
  const baseById = new Map(baseline.map(r => [r.id, r]))
  const titleOf = id => baseById.get(id)?.work_snapshot?.title

  const removes = []
  let alreadyRemoved = 0
  for (const id of Object.keys(draft.removes)) {
    if (latestById.has(id)) removes.push({ id, title: titleOf(id) })
    else alreadyRemoved++
  }
  const removing = new Set(removes.map(r => r.id))
  const partOk = (volumeId, partId) =>
    partId == null || latestParts.some(p => p.id === partId && p.volume_id === volumeId)
  // 저장 뒤에도 남을 행이 차지하는 (권, 작품) 자리
  const occupied = new Set(latestRows.filter(r => !removing.has(r.id)).map(r => slot(r.volume_id, r.work_id)))

  const skipped = []
  const candidates = []
  for (const [id, target] of Object.entries(draft.moves)) {
    const base = baseById.get(id)
    const latest = latestById.get(id)
    const title = titleOf(id)
    if (!base || !latest || latest.volume_id !== base.volume_id || (latest.part_id ?? null) !== (base.part_id ?? null)) {
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

  const nextOrder = new Map()
  const takeOrder = volumeId => {
    if (!nextOrder.has(volumeId)) {
      nextOrder.set(volumeId, nextSortOrder(latestRows.filter(r => r.volume_id === volumeId && !removing.has(r.id))))
    }
    const n = nextOrder.get(volumeId)
    nextOrder.set(volumeId, n + 10)
    return n
  }

  const moves = []
  for (const c of candidates) {
    const s = slot(c.volumeId, c.workId)
    if (occupied.has(s)) {
      skipped.push({ title: c.title, reason: TAKEN })
      occupied.add(slot(c.from, c.workId)) // 못 옮긴 행은 제자리에 남는다
      continue
    }
    occupied.add(s)
    moves.push({ id: c.id, title: c.title, volumeId: c.volumeId, partId: c.partId, sortOrder: takeOrder(c.volumeId) })
  }

  const adds = []
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
    adds.push({ ...a, title, sortOrder: takeOrder(a.volumeId) })
  }

  return { removes, moves, adds, skipped, alreadyRemoved }
}

const isDuplicate = err => /duplicate key|23505/i.test(err?.message || '')

// api = { deleteVolumeWork, updateVolumeWork, ensureWorkId, insertPlacedWork } (volumeApi.js)
// 한 건이 실패해도 나머지는 계속한다.
export async function runSave(plan, api, { registryMap }) {
  const result = { removed: plan.alreadyRemoved, moved: 0, added: 0, skipped: [...plan.skipped], failed: [] }

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
        await api.updateVolumeWork(m.id, { volume_id: m.volumeId, part_id: m.partId, sort_order: m.sortOrder })
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

export function resultSummary({ moved, added, removed }) {
  return `반영했습니다: 옮기기 ${moved} · 넣기 ${added} · 빼기 ${removed}`
}
