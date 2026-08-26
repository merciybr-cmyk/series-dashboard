// 월간 캘린더 순수 함수 (일요일 시작)
export function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function monthGrid(year, month0) {
  const first = new Date(year, month0, 1)
  const d = new Date(year, month0, 1 - first.getDay())
  const weeks = []
  do {
    const week = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(d))
      d.setDate(d.getDate() + 1)
    }
    weeks.push(week)
  } while (d.getMonth() === month0)
  return weeks
}

export function eventsByDate(schedules) {
  const map = new Map()
  for (const s of schedules) {
    if (!map.has(s.due_date)) map.set(s.due_date, [])
    map.get(s.due_date).push(s)
  }
  return map
}

export function monthLabel(year, month0) {
  return `${year}년 ${month0 + 1}월`
}
