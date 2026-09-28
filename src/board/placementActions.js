// 자동 배치 적용·되돌리기 절차 (설계 2026-09-28 §3.5·§3.6). api를 주입받아 테스트한다.
import { PART_BY_BUCKET, PART_TITLE, splitUndoable } from './placementUtils.js'
import { SELECTION_LABELS } from './constants.js'

const SORT_STEP = 10
const KEEP_LABEL = { tasks: '업무 있음', comments: '의견 있음', files: '자료 있음' }

// 적용 확인 창용: 새로 만들어야 할 부
export function plannedNewParts({ bucket, items, parts }) {
  const number = PART_BY_BUCKET[bucket]
  if (!number) return []
  return [...new Set(items.map(i => i.volumeId))]
    .filter(vid => !parts.some(p => p.volume_id === vid && p.number === number))
    .map(vid => ({ volumeId: vid, number }))
}

export function applyConfirmText({ bucket, items, volumes, newParts }) {
  const numberOf = id => volumes.find(v => v.id === id)?.number
  const perVol = new Map()
  for (const it of items) perVol.set(it.volumeId, (perVol.get(it.volumeId) || 0) + 1)
  const summary = [...perVol.entries()]
    .sort((a, b) => numberOf(a[0]) - numberOf(b[0]))
    .map(([id, n]) => `${numberOf(id)}권 ${n}`)
    .join(' · ')
  const lines = [`${bucket} ${items.length}편 → ${summary}`, "각 권에 '후보' 상태로 추가합니다."]
  for (const p of newParts) lines.push(`${numberOf(p.volumeId)}권에 '${p.number}부'가 없어 새로 만듭니다.`)
  lines.push('적용 후에도 아래 적용 기록에서 되돌릴 수 있습니다.')
  return lines.join('\n')
}

// items: [{ work: { workId, title, snapshot }, volumeId }] — 화면 순서대로
export async function applyPlacement({ api, bucket, items }) {
  // 1) 최신 상태 재확인: 그사이 배치된 작품, 그 권에서 제외된 작품은 건너뛴다
  const fresh = await api.listAllVolumeWorks()
  const placed = new Set(fresh.filter(r => r.selection_status !== 'excluded').map(r => r.work_id))
  const excludedPairs = new Set(fresh.filter(r => r.selection_status === 'excluded').map(r => `${r.volume_id}|${r.work_id}`))
  const skipped = []
  const todo = []
  for (const it of items) {
    if (placed.has(it.work.workId) || excludedPairs.has(`${it.volumeId}|${it.work.workId}`)) skipped.push(it.work)
    else todo.push(it)
  }
  const result = { batchId: null, added: 0, skipped, failed: [], createdParts: 0 }
  if (!todo.length) return result

  // 2) 묶음을 먼저 만든다 — 도중에 끊겨도 들어간 만큼은 되돌릴 수 있다
  const batch = await api.createPlacementBatch(bucket)
  result.batchId = batch.id

  // 3) 부 확보
  const number = PART_BY_BUCKET[bucket]
  const partByVolume = new Map()
  if (number) {
    const parts = await api.listAllParts()
    const createdIds = []
    for (const vid of [...new Set(todo.map(i => i.volumeId))]) {
      const found = parts.find(p => p.volume_id === vid && p.number === number)
      if (found) { partByVolume.set(vid, found.id); continue }
      try {
        const part = await api.createPart(vid, number, PART_TITLE[number])
        partByVolume.set(vid, part.id)
        createdIds.push(part.id)
      } catch {
        partByVolume.set(vid, null) // 부 생성 실패 — 미배정으로 넣는다
      }
    }
    if (createdIds.length) {
      await api.updatePlacementBatch(batch.id, { created_part_ids: createdIds })
      result.createdParts = createdIds.length
    }
  }

  // 4) 한 편씩 추가 — 권별 기존 정렬 최댓값 뒤로
  const lastSort = new Map()
  for (const r of fresh) lastSort.set(r.volume_id, Math.max(lastSort.get(r.volume_id) ?? 0, r.sort_order ?? 0))
  for (const it of todo) {
    const sortOrder = (lastSort.get(it.volumeId) ?? 0) + SORT_STEP
    lastSort.set(it.volumeId, sortOrder)
    try {
      const row = await api.insertPlacedWork({
        volumeId: it.volumeId,
        workId: it.work.workId,
        workSnapshot: it.work.snapshot,
        partId: partByVolume.get(it.volumeId) ?? null,
        batchId: batch.id,
        sortOrder,
      })
      if (row) result.added++
      else skipped.push(it.work)
    } catch (err) {
      result.failed.push({ work: it.work, message: err.message })
    }
  }
  await api.updatePlacementBatch(batch.id, { item_count: result.added })
  return result
}

export function applySummary({ added, skipped, failed, createdParts }) {
  const parts = [`${added}편을 추가했습니다.`]
  if (skipped.length) parts.push(`${skipped.length}편은 이미 배치되어 건너뛰었습니다: ${skipped.map(w => `〈${w.title}〉`).join(', ')}`)
  if (createdParts) parts.push(`부 ${createdParts}개를 새로 만들었습니다.`)
  if (failed.length) parts.push(`${failed.length}편 실패: ${failed.map(f => `〈${f.work.title}〉(${f.message})`).join(', ')}`)
  return parts.join(' ')
}

export async function undoBatch({ api, batch }) {
  const rows = await api.listBatchWorks(batch.id)
  const refs = await api.listAttachmentRefs(rows.map(r => r.id))
  const { removable, kept } = splitUndoable(rows, refs)
  await api.deleteVolumeWorks(removable.map(r => r.id))
  let removedParts = 0
  const createdParts = batch.created_part_ids || []
  if (createdParts.length) {
    const nonEmpty = new Set(await api.listNonEmptyPartIds(createdParts))
    for (const pid of createdParts) {
      if (nonEmpty.has(pid)) continue
      await api.deletePart(pid)
      removedParts++
    }
  }
  await api.updatePlacementBatch(batch.id, { undone_at: new Date().toISOString() })
  return { removed: removable.length, kept, removedParts }
}

export function undoSummary({ removed, kept }) {
  const head = `${removed}편을 뺐습니다.`
  if (!kept.length) return head
  const items = kept.map(({ row, reason }) => {
    const why = reason === 'status' ? SELECTION_LABELS[row.selection_status] : KEEP_LABEL[reason]
    return `〈${row.work_snapshot?.title}〉(${row.volumes?.number}권 ${why})`
  })
  return `${head} ${kept.length}편은 남겼습니다: ${items.join(', ')}`
}
