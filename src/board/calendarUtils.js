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

// 일정 색상 팔레트 9종 (2026-08-27 사용자 요청) — 공통/권별 일정을 색으로 구분
export const SCHEDULE_COLORS = [
  { key: 'blue', label: '파랑', chip: 'bg-blue-100 text-blue-800', dot: 'bg-blue-400' },
  { key: 'red', label: '빨강', chip: 'bg-red-100 text-red-800', dot: 'bg-red-400' },
  { key: 'orange', label: '주황', chip: 'bg-orange-100 text-orange-800', dot: 'bg-orange-400' },
  { key: 'amber', label: '노랑', chip: 'bg-amber-100 text-amber-800', dot: 'bg-amber-400' },
  { key: 'green', label: '초록', chip: 'bg-green-100 text-green-800', dot: 'bg-green-400' },
  { key: 'teal', label: '청록', chip: 'bg-teal-100 text-teal-800', dot: 'bg-teal-400' },
  { key: 'purple', label: '보라', chip: 'bg-purple-100 text-purple-800', dot: 'bg-purple-400' },
  { key: 'pink', label: '분홍', chip: 'bg-pink-100 text-pink-800', dot: 'bg-pink-400' },
  { key: 'gray', label: '회색', chip: 'bg-gray-200 text-gray-700', dot: 'bg-gray-400' },
]

// 칩 색: 완료 > 지정 색 > 종류 기본색(회의 파랑/마감 빨강)
export function scheduleChipClass(s) {
  if (s.done) return 'line-through text-gray-400 bg-gray-100'
  const c = SCHEDULE_COLORS.find(x => x.key === s.color)
  if (c) return c.chip
  return s.kind === '마감' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
}
