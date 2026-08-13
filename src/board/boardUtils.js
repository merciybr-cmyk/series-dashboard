// 권 보드 순수 유틸. 날짜는 항상 로컬(KST) 자정 기준 date-only 비교 (설계 §8).

const DAY_MS = 86400000

function localMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// 'YYYY-MM-DD' → 로컬 자정 Date (UTC 해석 방지를 위해 직접 파싱)
function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysUntil(dateStr, now = new Date()) {
  return Math.round((parseDate(dateStr) - localMidnight(now)) / DAY_MS)
}

export function dDayLabel(days) {
  if (days === 0) return 'D-Day'
  return days > 0 ? `D-${days}` : `D+${-days}`
}

export function tasksProgress(tasks) {
  return {
    done: tasks.filter(t => t.status === 'done').length,
    total: tasks.length,
  }
}

export function nextSortOrder(rows) {
  if (!rows.length) return 10
  return Math.max(...rows.map(r => r.sort_order)) + 10
}

// sortedRows는 sort_order 오름차순 정렬 전제. 이웃과 순서값을 교환한다.
export function swapPlan(sortedRows, id, dir) {
  const i = sortedRows.findIndex(r => r.id === id)
  const j = dir === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= sortedRows.length) return null
  return [
    { id: sortedRows[i].id, sort_order: sortedRows[j].sort_order },
    { id: sortedRows[j].id, sort_order: sortedRows[i].sort_order },
  ]
}

export function nearestDue(tasks) {
  const dues = tasks
    .filter(t => t.status !== 'done' && t.due_date)
    .map(t => t.due_date)
    .sort()
  return dues[0] ?? null
}

export function filterVolumeWorks(rows, tasksByVw, filters = {}, now = new Date()) {
  const { selection = [], production = [], assignee = [], dueSoon = false, hideCompleted = false } = filters
  return rows.filter(row => {
    const tasks = tasksByVw[row.id] || []
    if (selection.length && !selection.includes(row.selection_status)) return false
    if (production.length && !production.includes(row.production_status)) return false
    if (assignee.length && !tasks.some(t => assignee.includes(t.assignee_id))) return false
    if (dueSoon) {
      const hit = tasks.some(t => t.status !== 'done' && t.due_date && daysUntil(t.due_date, now) <= 7)
      if (!hit) return false
    }
    if (hideCompleted && row.production_status === 'completed') return false
    return true
  })
}
