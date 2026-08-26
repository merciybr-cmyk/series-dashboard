import { ymd, monthGrid, eventsByDate, monthLabel } from '../board/calendarUtils.js'

test('ymd: 로컬 날짜 문자열', () => {
  expect(ymd(new Date(2026, 8, 1))).toBe('2026-09-01')
  expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05')
})

test('monthGrid: 일요일 시작, 달 전체 포함', () => {
  const grid = monthGrid(2026, 8) // 2026년 9월: 1일=화요일
  expect(grid[0]).toHaveLength(7)
  expect(grid[0][0].getDay()).toBe(0)               // 일요일 시작
  expect(ymd(grid[0][2])).toBe('2026-09-01')        // 첫 주 화요일이 1일
  const flat = grid.flat().map(ymd)
  expect(flat).toContain('2026-09-30')              // 말일 포함
  expect(grid.every(w => w.length === 7)).toBe(true)
})

test('eventsByDate: 날짜별로 묶는다', () => {
  const map = eventsByDate([
    { id: 'a', due_date: '2026-09-01' },
    { id: 'b', due_date: '2026-09-01' },
    { id: 'c', due_date: '2026-09-02' },
  ])
  expect(map.get('2026-09-01').map(s => s.id)).toEqual(['a', 'b'])
  expect(map.get('2026-09-02')).toHaveLength(1)
})

test('monthLabel', () => {
  expect(monthLabel(2026, 8)).toBe('2026년 9월')
})

test('scheduleChipClass: 완료 > 지정 색 > 종류 기본색', async () => {
  const { scheduleChipClass, SCHEDULE_COLORS } = await import('../board/calendarUtils.js')
  expect(SCHEDULE_COLORS).toHaveLength(9)
  expect(scheduleChipClass({ done: true, color: 'green', kind: '회의' })).toContain('line-through')
  expect(scheduleChipClass({ done: false, color: 'green', kind: '마감' })).toBe('bg-green-100 text-green-800')
  expect(scheduleChipClass({ done: false, color: null, kind: '마감' })).toBe('bg-red-100 text-red-800')
  expect(scheduleChipClass({ done: false, color: null, kind: '회의' })).toBe('bg-blue-100 text-blue-800')
})
