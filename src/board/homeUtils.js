// 홈 화면 집계 순수 함수 (설계 §5.2). 화면과 분리해 유닛 테스트한다.
import { daysUntil, dDayLabel } from './boardUtils.js'
import { SELECTION_LABELS } from './constants.js'
import { bucketOf } from './genreUtils.js'

export function taskUrgency(dueDate, now = new Date()) {
  if (!dueDate) return 'none'
  const d = daysUntil(dueDate, now)
  if (d < 0) return 'overdue'
  if (d === 0) return 'today'
  if (d <= 3) return 'd3'
  if (d <= 7) return 'd7'
  return 'none'
}

const URGENCY_ORDER = { overdue: 0, today: 1, d3: 2, d7: 3, none: 4 }

export function urgencyIcon(u) {
  return { overdue: '🔴', today: '🟠', d3: '🟡' }[u] || ''
}

export function sortMyTasks(tasks, now = new Date()) {
  return [...tasks].sort((a, b) => {
    const u = URGENCY_ORDER[taskUrgency(a.due_date, now)] - URGENCY_ORDER[taskUrgency(b.due_date, now)]
    if (u) return u
    return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31')
  })
}

function workLabel(vw) {
  const num = vw.volumes?.number
  const title = vw.work_snapshot?.title || '작품'
  return `${num != null ? `${num}권 ` : ''}「${title}」`
}

// 주의 필요 규칙 (Global Constraints ①~④). high 먼저.
export function buildAttention(vworks, tasksByVw, fileVwIds, now = new Date()) {
  const high = []
  const mid = []
  for (const vw of vworks) {
    const tasks = tasksByVw[vw.id] || []
    const item = (level, text) =>
      (level === 'high' ? high : mid).push({ level, text, volumeId: vw.volume_id, vwId: vw.id })

    for (const t of tasks) {
      if (t.status !== 'done' && t.due_date && daysUntil(t.due_date, now) < 0) {
        item('high', `${workLabel(vw)} ${t.title} — 마감 ${dDayLabel(daysUntil(t.due_date, now))}`)
      }
    }
    if (vw.selection_status === 'confirmed' && tasks.length === 0) {
      item('high', `${workLabel(vw)} — 확정 작품인데 업무가 없습니다`)
    }
    for (const t of tasks) {
      const d = t.due_date ? daysUntil(t.due_date, now) : null
      if (t.status !== 'done' && d != null && d >= 0 && d <= 7 && !t.assignee_id) {
        item('mid', `${workLabel(vw)} ${t.title} — 마감 ${dDayLabel(d)}인데 담당자가 없습니다`)
      }
    }
    if (vw.selection_status === 'confirmed' && !fileVwIds.has(vw.id)) {
      item('mid', `${workLabel(vw)} — 확정 작품인데 자료가 없습니다 (해제 원고 등)`)
    }
  }
  return [...high, ...mid]
}

export function volumeProgress(volumes, allVw, allTasks) {
  return volumes.map(v => {
    const works = allVw.filter(w => w.volume_id === v.id)
    const tasks = allTasks.filter(t => t.volume_works?.volume_id === v.id)
    const done = tasks.filter(t => t.status === 'done').length
    return {
      volume: v,
      total: works.length,
      confirmed: works.filter(w => w.selection_status === 'confirmed').length,
      done,
      taskTotal: tasks.length,
      pct: tasks.length ? Math.round((done / tasks.length) * 100) : null,
    }
  })
}

// 작성자가 없는 기록은 Supabase Studio 등에서 DB를 직접 고친 것 (2026-09-28)
function actorLabel(actorId, nameOf) {
  if (!actorId) return 'DB 직접 수정으로'
  return `${nameOf(actorId) || '알 수 없는 사용자'}님이`
}

export function describeActivity(entry, nameOf, ctx = {}) {
  const name = actorLabel(entry.actor_id, nameOf)
  const d = entry.diff || {}
  const t = entry.table_name
  const a = entry.action
  if (t === 'volume_works') {
    if (a === 'insert') return `${name} 「${d.work_snapshot?.title || '작품'}」을(를) 추가했습니다`
    if (a === 'delete') return `${name} 「${d.work_snapshot?.title || '작품'}」을(를) 제거했습니다`
    // 2026-10-02 권별 비교 편집: update 기록은 바뀐 칸만 담으므로 제목·권 번호는 홈이 넘긴 ctx로 찾는다
    if (a === 'update' && d.volume_id) {
      const title = ctx.titleOfVw?.(entry.record_id)
      const num = ctx.volumeNumberOf?.(d.volume_id[1])
      const what = title ? `「${title}」을(를)` : '작품을'
      return `${name} ${what} ${num != null ? `${num}권으로` : '다른 권으로'} 옮겼습니다`
    }
    if (a === 'update' && d.selection_status) {
      return `${name} 선정 상태를 '${SELECTION_LABELS[d.selection_status[1]] || d.selection_status[1]}'(으)로 변경했습니다`
    }
    if (a === 'update' && d.part_id) return `${name} 작품의 부를 변경했습니다`
    if (a === 'update') return `${name} 작품 정보를 변경했습니다`
  }
  if (t === 'work_tasks') {
    if (a === 'insert') return `${name} 업무 '${d.title || ''}'을(를) 추가했습니다`
    if (a === 'delete') return `${name} 업무를 삭제했습니다`
    if (a === 'update' && d.status?.[1] === 'done') return `${name} 업무를 완료했습니다`
    if (a === 'update' && d.assignee_id) return `${name} 업무 담당자를 변경했습니다`
    if (a === 'update' && d.due_date) return `${name} 업무 마감일을 변경했습니다`
    if (a === 'update') return `${name} 업무를 변경했습니다`
  }
  if (t === 'volumes') {
    if (a === 'insert') return `${name} ${d.number != null ? `${d.number}권` : '권'}을 만들었습니다`
    if (a === 'delete') return `${name} 권을 삭제했습니다`
    if (a === 'update') return `${name} 권 정보를 변경했습니다`
  }
  if (t === 'volume_parts') {
    if (a === 'insert') return `${name} 부를 추가했습니다`
    if (a === 'delete') return `${name} 부를 삭제했습니다`
    if (a === 'update') return `${name} 부 정보를 변경했습니다`
  }
  if (t === 'files') {
    if (a === 'insert') return `${name} 자료 '${d.name || ''}'을(를) 등록했습니다`
    if (a === 'delete') return `${name} 자료를 삭제했습니다`
  }
  if (t === 'schedules') {
    if (a === 'insert') return `${name} 일정 '${d.title || ''}'을(를) 등록했습니다`
    if (a === 'delete') return `${name} 일정을 삭제했습니다`
    if (a === 'update' && d.done?.[1] === true) return `${name} 일정을 완료 처리했습니다`
    if (a === 'update') return `${name} 일정을 변경했습니다`
  }
  return `${name} 항목을 변경했습니다`
}

// 최근 활동 묶기 (2026-09-28): entries는 최신순.
// - 자동 배치 묶음(placement_batch_id)의 추가·제거는 한 줄로
// - 같은 사람의 같은 문구가 10분 안에 이어지면 "(N건)"으로 합친다
const SAME_RUN_MS = 10 * 60 * 1000

function batchIdOf(entry) {
  if (entry.table_name !== 'volume_works') return null
  if (entry.action !== 'insert' && entry.action !== 'delete') return null
  return entry.diff?.placement_batch_id || null
}

// 손으로 한 volume_works 추가·제거·권 옮기기는 종류 단위로 묶는다 (2026-10-02 권별 비교 편집 — 한 번 저장에 여러 건)
function manualKindOf(entry) {
  if (entry.table_name !== 'volume_works') return null
  if (entry.action === 'insert') return 'add'
  if (entry.action === 'delete') return 'remove'
  if (entry.action === 'update' && entry.diff?.volume_id) return 'move'
  return null
}
const KIND_VERB = { add: '추가했습니다', remove: '제거했습니다', move: '옮겼습니다' }

export function groupActivity(entries, nameOf, limit = 20, ctx = {}) {
  const groups = []
  for (const e of entries) {
    const batch = batchIdOf(e)
    const bucket = batch ? bucketOf(e.diff?.work_snapshot?.genre) : null
    const kind = batch ? null : manualKindOf(e)
    const text = batch ? null : describeActivity(e, nameOf, ctx)
    const time = new Date(e.created_at).getTime()
    const last = groups[groups.length - 1]
    if (last && batch && last.batch === batch && last.action === e.action) {
      last.count++
      if (bucket) last.buckets.add(bucket)
      continue
    }
    if (last && !batch && !last.batch && last.actor === e.actor_id && last.oldest - time <= SAME_RUN_MS
      && (kind ? last.kind === kind : !last.kind && last.text === text)) {
      last.count++
      last.oldest = time
      continue
    }
    const title = kind === 'move' ? ctx.titleOfVw?.(e.record_id) : kind ? e.diff?.work_snapshot?.title : null
    groups.push({
      id: e.id, created_at: e.created_at, actor: e.actor_id, action: e.action,
      batch, kind, title, text, count: 1, oldest: time, buckets: new Set(bucket ? [bucket] : []),
    })
  }
  return groups.slice(0, limit).map(g => {
    let text = g.text
    if (g.batch) {
      const who = actorLabel(g.actor, nameOf)
      const genre = [...g.buckets].join('·') || '작품'
      text = g.action === 'insert'
        ? `${who} 자동 배치로 ${genre} ${g.count}편을 추가했습니다`
        : `${who} 자동 배치를 되돌려 ${genre} ${g.count}편을 제거했습니다`
    } else if (g.count > 1 && g.kind) {
      const who = actorLabel(g.actor, nameOf)
      text = g.title
        ? `${who} 「${g.title}」 외 ${g.count - 1}편을 ${KIND_VERB[g.kind]}`
        : `${who} 작품 ${g.count}편을 ${KIND_VERB[g.kind]}`
    } else if (g.count > 1) {
      text = `${text} (${g.count}건)`
    }
    return { id: g.id, created_at: g.created_at, text }
  })
}
