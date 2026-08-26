// 홈 화면 집계 순수 함수 (설계 §5.2). 화면과 분리해 유닛 테스트한다.
import { daysUntil, dDayLabel } from './boardUtils.js'
import { SELECTION_LABELS } from './constants.js'

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

export function describeActivity(entry, nameOf) {
  const name = `${nameOf(entry.actor_id) || '누군가'}님이`
  const d = entry.diff || {}
  const t = entry.table_name
  const a = entry.action
  if (t === 'volume_works') {
    if (a === 'insert') return `${name} 「${d.work_snapshot?.title || '작품'}」을(를) 추가했습니다`
    if (a === 'delete') return `${name} 「${d.work_snapshot?.title || '작품'}」을(를) 제거했습니다`
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
