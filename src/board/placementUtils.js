// 자동 배치 화면용 순수 도우미 (설계 2026-09-28 §1.5·§3)
import { bucketOf } from './genreUtils.js'
import { keyOf, workKeyOf, sortCurricula, curriculumRank } from '../works/workKey.js'
import { AUTHOR_LIMIT, firstCurriculum, isEligible, reasonsFor } from './autoPlace.js'

// 갈래 → 부 번호 (고전산문은 2·3부 어느 쪽도 가능해 미배정 — 2026-09-28 사용자 결정)
export const PART_BY_BUCKET = { '현대시': 1, '고전운문': 1, '현대소설': 2, '현대수필·극': 3, '고전산문': null }
export const PART_TITLE = { 1: '시', 2: '소설', 3: '수필·극' }
export const REASON_LABELS = { debut: '첫 수록', concept: '콘셉트', balance: '균형' }
export const UNPLACEABLE_LABELS = {
  noEligibleVolume: '수록 교육과정에 맞는 권 없음',
  authorLimit: '작가 중복 한도(권당 2편) 초과',
  manual: '직접 뺌',
}

// 시트 행 → 작품 키별 교육과정 집합
export function curriculaIndex(sheetWorks) {
  const map = new Map()
  for (const w of sheetWorks || []) {
    if (!w['교육과정']) continue
    const k = workKeyOf(w)
    if (!map.has(k)) map.set(k, new Set())
    map.get(k).add(w['교육과정'])
  }
  return map
}

// 후보의 수록 교육과정: 시트(registry 키 + 별칭) 우선, 못 찾으면 후보 snapshot
export function curriculaForPick(pick, registryRow, index) {
  const keys = registryRow
    ? [keyOf(registryRow.title, registryRow.author_base), ...(registryRow.aliases || []).map(a => keyOf(a.title, a.author_base))]
    : []
  const set = new Set()
  for (const k of keys) for (const c of index.get(k) || []) set.add(c)
  if (set.size) return { curricula: sortCurricula([...set]), fromSheet: true }
  return { curricula: sortCurricula(pick.work_snapshot?.curriculum || []), fromSheet: false }
}

export function buildPlacementInput({ picks, volumes, allVw, registry, sheetWorks, bucket }) {
  const index = curriculaIndex(sheetWorks)
  const registryById = new Map((registry || []).map(r => [r.work_id, r]))
  const placedIds = new Set(allVw.filter(vw => vw.selection_status !== 'excluded').map(vw => vw.work_id))
  let sheetFallbackCount = 0
  const works = picks
    .filter(p => bucketOf(p.work_snapshot?.genre) === bucket && !placedIds.has(p.work_id))
    .map(p => {
      const { curricula, fromSheet } = curriculaForPick(p, registryById.get(p.work_id), index)
      if (!fromSheet) sheetFallbackCount++
      return {
        workId: p.work_id,
        title: p.work_snapshot?.title || '',
        author: p.work_snapshot?.author || '',
        curricula,
        conceptVolumeIds: p.concept_volume_ids || [],
        snapshot: p.work_snapshot,
      }
    })
  const existing = allVw.map(vw => ({
    id: vw.id,
    volumeId: vw.volume_id,
    workId: vw.work_id,
    title: vw.work_snapshot?.title || '',
    author: vw.work_snapshot?.author || '',
    bucket: bucketOf(vw.work_snapshot?.genre),
    selection_status: vw.selection_status,
  }))
  return {
    works,
    volumes: volumes.filter(v => (v.curricula || []).length > 0),
    skippedVolumes: volumes.filter(v => !(v.curricula || []).length),
    existing,
    sheetFallbackCount,
  }
}

const byCurriculumThenTitle = (a, b) =>
  curriculumRank(firstCurriculum(a.curricula) ?? '') - curriculumRank(firstCurriculum(b.curricula) ?? '')
  || a.title.localeCompare(b.title, 'ko')

// 사람이 조정한 배치(assignment)를 다시 평가한다 — 점수 재최적화는 하지 않는다(스펙 §3.2)
export function evaluateAssignment({ works, volumes, existing, bucket, assignment }) {
  const active = existing.filter(e => e.selection_status !== 'excluded')
  const authorCount = new Map()
  const bump = (vid, a) => authorCount.set(`${vid}|${a}`, (authorCount.get(`${vid}|${a}`) || 0) + 1)
  for (const e of active) bump(e.volumeId, e.author)
  for (const w of works) {
    const vid = assignment.get(w.workId)
    if (vid) bump(vid, w.author)
  }
  const columns = [...volumes].sort((a, b) => a.number - b.number).map(v => {
    const ex = active.filter(e => e.volumeId === v.id && e.bucket === bucket)
    const proposed = works
      .filter(w => assignment.get(w.workId) === v.id)
      .sort(byCurriculumThenTitle)
      .map(w => {
        const eligible = isEligible(w, v)
        const n = authorCount.get(`${v.id}|${w.author}`) || 0
        const warnings = []
        if (!eligible) warnings.push('ineligible')
        if (n > AUTHOR_LIMIT) warnings.push('authorOver')
        else if (n >= 2) warnings.push('authorDup')
        return { work: w, reasons: eligible ? reasonsFor(w, v) : [], warnings }
      })
    return { volume: v, existing: ex, proposed, total: ex.length + proposed.length }
  })
  const held = works.filter(w => !assignment.get(w.workId)).sort(byCurriculumThenTitle)
  return { columns, held }
}

// 되돌리기 판정: 적용 뒤 손댄 행은 남긴다(삭제 시 업무·의견이 cascade로 지워지고 자료는 자료실로 새기 때문)
export function splitUndoable(rows, { tasks = [], comments = [], files = [] }) {
  const t = new Set(tasks)
  const c = new Set(comments)
  const f = new Set(files)
  const removable = []
  const kept = []
  for (const r of rows) {
    if (r.selection_status !== 'candidate') kept.push({ row: r, reason: 'status' })
    else if (t.has(r.id)) kept.push({ row: r, reason: 'tasks' })
    else if (c.has(r.id)) kept.push({ row: r, reason: 'comments' })
    else if (f.has(r.id)) kept.push({ row: r, reason: 'files' })
    else removable.push(r)
  }
  return { removable, kept }
}
