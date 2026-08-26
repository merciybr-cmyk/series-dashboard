// 권 보드의 모든 Supabase 호출. UI는 이 모듈만 통해 서버와 대화한다.
import { supabase } from '../lib/supabaseClient'
import { keyOf, snapshotOf } from '../works/workKey.js'

function unwrap({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

// ---------- volumes ----------

export async function listVolumes() {
  return unwrap(await supabase.from('volumes').select('*').order('number'))
}

export async function createVolume({ number, title }) {
  return unwrap(await supabase.from('volumes').insert({ number, title }).select().single())
}

export async function updateVolume(id, patch) {
  return unwrap(await supabase.from('volumes').update(patch).eq('id', id).select().single())
}

export async function deleteVolume(id) {
  unwrap(await supabase.from('volumes').delete().eq('id', id))
}

// ---------- 보드 로드 ----------

export async function getBoard(volumeId) {
  const volume = unwrap(await supabase.from('volumes').select('*').eq('id', volumeId).single())
  const parts = unwrap(
    await supabase.from('volume_parts').select('*').eq('volume_id', volumeId).order('number'),
  )
  const works = unwrap(
    await supabase.from('volume_works').select('*').eq('volume_id', volumeId).order('sort_order'),
  )
  const ids = works.map(w => w.id)
  const tasks = ids.length
    ? unwrap(await supabase.from('work_tasks').select('*').in('volume_work_id', ids).order('sort_order'))
    : []
  return { volume, parts, works, tasks }
}

// 중복 수록 뱃지용: 전체 권의 수록 현황 (권 번호 포함)
export async function listAllVolumeWorks() {
  return unwrap(
    await supabase.from('volume_works')
      .select('id, volume_id, work_id, part_id, sort_order, selection_status, work_snapshot, volumes(number, title)'),
  )
}

// ---------- works_registry ----------

export async function listRegistry() {
  return unwrap(await supabase.from('works_registry').select('*'))
}

// 맵에서 찾으면 기존 ID. 없으면 insert — 동시 등록 경합(23505)이면 재조회.
export async function ensureWorkId(work, curricula, registryMap) {
  const existing = registryMap.get(keyOf(work['작품명'], work._authorBase))
  if (existing) return existing

  const row = {
    title: work['작품명'],
    author_base: work._authorBase,
    snapshot: snapshotOf(work, curricula),
  }
  const { data, error } = await supabase.from('works_registry').insert(row).select('work_id').single()
  if (!error) return data.work_id
  if (error.code === '23505') {
    const again = unwrap(
      await supabase.from('works_registry').select('work_id')
        .eq('title', row.title).eq('author_base', row.author_base).single(),
    )
    return again.work_id
  }
  throw new Error(error.message)
}

// ---------- volume_parts (부) ----------

export async function createPart(volumeId, number) {
  return unwrap(
    await supabase.from('volume_parts')
      .insert({ volume_id: volumeId, number, sort_order: number * 10 })
      .select().single(),
  )
}

export async function updatePart(id, patch) {
  return unwrap(await supabase.from('volume_parts').update(patch).eq('id', id).select().single())
}

export async function deletePart(id) {
  unwrap(await supabase.from('volume_parts').delete().eq('id', id))
}

export async function listAllParts() {
  return unwrap(await supabase.from('volume_parts').select('*').order('number'))
}

// ---------- volume_works ----------

export async function addWorkToVolume({ volumeId, work, curricula, registryMap, sortOrder, partId }) {
  const workId = await ensureWorkId(work, curricula, registryMap)
  const { data, error } = await supabase.from('volume_works').insert({
    volume_id: volumeId,
    work_id: workId,
    work_snapshot: snapshotOf(work, curricula),
    sort_order: sortOrder,
    part_id: partId ?? null,
  }).select().single()
  if (error) {
    if (error.code === '23505') throw new Error('이미 이 권에 있는 작품입니다')
    throw new Error(error.message)
  }
  return data
}

export async function updateVolumeWork(id, patch) {
  return unwrap(await supabase.from('volume_works').update(patch).eq('id', id).select().single())
}

export async function deleteVolumeWork(id) {
  unwrap(await supabase.from('volume_works').delete().eq('id', id))
}

export async function applySortSwap(pairs) {
  for (const { id, sort_order } of pairs) {
    unwrap(await supabase.from('volume_works').update({ sort_order }).eq('id', id).select().single())
  }
}

// ---------- work_tasks ----------

export async function addTasks(volumeWorkId, items) {
  return unwrap(
    await supabase.from('work_tasks')
      .insert(items.map(it => ({ ...it, volume_work_id: volumeWorkId })))
      .select(),
  )
}

export async function updateTask(id, patch) {
  return unwrap(await supabase.from('work_tasks').update(patch).eq('id', id).select().single())
}

export async function deleteTask(id) {
  unwrap(await supabase.from('work_tasks').delete().eq('id', id))
}

// ---------- work_comments (검토 의견) ----------

export async function listComments(volumeWorkId) {
  return unwrap(
    await supabase.from('work_comments').select('*')
      .eq('volume_work_id', volumeWorkId).order('created_at'),
  )
}

export async function addComment(volumeWorkId, body) {
  return unwrap(
    await supabase.from('work_comments')
      .insert({ volume_work_id: volumeWorkId, body })
      .select().single(),
  )
}

export async function deleteComment(id) {
  unwrap(await supabase.from('work_comments').delete().eq('id', id))
}

// ---------- 전역 조회 (홈 화면) ----------

export async function listAllTasks() {
  return unwrap(
    await supabase.from('work_tasks')
      .select('*, volume_works(id, volume_id, work_id, selection_status, work_snapshot, volumes(number, title))'),
  )
}

export async function listAllFiles() {
  return unwrap(
    await supabase.from('files').select('id, volume_work_id, kind, name')
      .not('volume_work_id', 'is', null),
  )
}

export async function listActivity(limit = 20) {
  return unwrap(
    await supabase.from('activity_log').select('*').order('id', { ascending: false }).limit(limit),
  )
}

// ---------- files (작품 자료 — 설계 §5.1) ----------

const BUCKET = 'attachments'

export async function listFiles(volumeWorkId) {
  return unwrap(
    await supabase.from('files').select('*')
      .eq('volume_work_id', volumeWorkId).order('created_at'),
  )
}

export async function uploadFile(volumeWorkId, file) {
  // 스토리지 키는 ASCII만 허용 — 한글 파일명은 키에서 치환하고 원본명은 files.name에 보존
  const safeName = file.name.replace(/[^\w.-]+/g, '_')
  const path = `${volumeWorkId}/${Date.now()}_${safeName}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw new Error(error.message)
  return unwrap(
    await supabase.from('files')
      .insert({ name: file.name, volume_work_id: volumeWorkId, kind: 'upload', storage_path: path })
      .select().single(),
  )
}

export async function addFileLink(volumeWorkId, name, url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('링크는 http:// 또는 https:// 로 시작해야 합니다')
  return unwrap(
    await supabase.from('files')
      .insert({ name, volume_work_id: volumeWorkId, kind: 'link', url })
      .select().single(),
  )
}

export async function deleteFile(fileRow) {
  if (fileRow.kind === 'upload' && fileRow.storage_path) {
    await supabase.storage.from(BUCKET).remove([fileRow.storage_path])
  }
  unwrap(await supabase.from('files').delete().eq('id', fileRow.id))
}

export async function getFileUrl(storagePath, downloadName) {
  const { data, error } = await supabase.storage.from(BUCKET)
    .createSignedUrl(storagePath, 3600, downloadName ? { download: downloadName } : undefined)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

// ---------- genre_picks (갈래별 후보 — 권 배치 전 롱리스트) ----------

export async function listPicks() {
  return unwrap(await supabase.from('genre_picks').select('*').order('created_at'))
}

export async function addPick({ work, curricula, registryMap }) {
  const workId = await ensureWorkId(work, curricula, registryMap)
  const { data, error } = await supabase.from('genre_picks')
    .insert({ work_id: workId, work_snapshot: snapshotOf(work, curricula) })
    .select().single()
  if (error) {
    if (error.code === '23505') throw new Error('이미 후보 목록에 있는 작품입니다')
    throw new Error(error.message)
  }
  return data
}

export async function deletePick(id) {
  unwrap(await supabase.from('genre_picks').delete().eq('id', id))
}

// ---------- 기타 ----------

export async function listMembers() {
  return unwrap(await supabase.from('members').select('id, name, role, affiliation').order('name'))
}

export async function listActivityFor(recordIds) {
  if (!recordIds.length) return []
  return unwrap(
    await supabase.from('activity_log').select('*')
      .in('record_id', recordIds).order('id', { ascending: false }).limit(5),
  )
}

// ---------- Realtime (설계 §7) ----------

export function subscribeBoard(onChange) {
  const ch = supabase.channel('board-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'volume_parts' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'volume_works' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'work_tasks' }, onChange)
    .subscribe()
  return () => supabase.removeChannel(ch)
}
