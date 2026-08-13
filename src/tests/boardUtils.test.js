import {
  daysUntil, dDayLabel, tasksProgress, nextSortOrder, swapPlan, nearestDue, filterVolumeWorks,
} from '../board/boardUtils.js'
import { TASK_PRESETS, SELECTION_LABELS } from '../board/constants.js'

const NOW = new Date(2026, 7, 13) // 2026-08-13 (월은 0부터)

test('daysUntil: 오늘 0, 내일 1, 어제 -1', () => {
  expect(daysUntil('2026-08-13', NOW)).toBe(0)
  expect(daysUntil('2026-08-14', NOW)).toBe(1)
  expect(daysUntil('2026-08-12', NOW)).toBe(-1)
})

test('dDayLabel', () => {
  expect(dDayLabel(3)).toBe('D-3')
  expect(dDayLabel(0)).toBe('D-Day')
  expect(dDayLabel(-2)).toBe('D+2')
})

test('tasksProgress: done 개수와 전체', () => {
  expect(tasksProgress([{ status: 'done' }, { status: 'todo' }])).toEqual({ done: 1, total: 2 })
  expect(tasksProgress([])).toEqual({ done: 0, total: 0 })
})

test('nextSortOrder / swapPlan', () => {
  const rows = [{ id: 'a', sort_order: 10 }, { id: 'b', sort_order: 20 }]
  expect(nextSortOrder(rows)).toBe(30)
  expect(nextSortOrder([])).toBe(10)
  expect(swapPlan(rows, 'b', 'up')).toEqual([
    { id: 'b', sort_order: 10 }, { id: 'a', sort_order: 20 },
  ])
  expect(swapPlan(rows, 'a', 'up')).toBeNull()
  expect(swapPlan(rows, 'b', 'down')).toBeNull()
})

test('nearestDue: 미완료 업무 중 가장 이른 마감', () => {
  expect(nearestDue([
    { status: 'done', due_date: '2026-08-01' },
    { status: 'todo', due_date: '2026-08-20' },
    { status: 'in_progress', due_date: '2026-08-15' },
    { status: 'todo', due_date: null },
  ])).toBe('2026-08-15')
  expect(nearestDue([{ status: 'done', due_date: '2026-08-01' }])).toBeNull()
})

test('filterVolumeWorks: 선정·제작·담당자·마감임박·완료숨김', () => {
  const rows = [
    { id: 'vw1', selection_status: 'confirmed', production_status: 'in_progress' },
    { id: 'vw2', selection_status: 'candidate', production_status: 'not_started' },
    { id: 'vw3', selection_status: 'confirmed', production_status: 'completed' },
  ]
  const tasksByVw = {
    vw1: [{ status: 'todo', due_date: '2026-08-15', assignee_id: 'm1' }],
    vw2: [{ status: 'todo', due_date: '2026-09-30', assignee_id: 'm2' }],
    vw3: [],
  }
  expect(filterVolumeWorks(rows, tasksByVw, { selection: ['confirmed'] }, NOW).map(r => r.id))
    .toEqual(['vw1', 'vw3'])
  expect(filterVolumeWorks(rows, tasksByVw, { production: ['not_started'] }, NOW).map(r => r.id))
    .toEqual(['vw2'])
  expect(filterVolumeWorks(rows, tasksByVw, { assignee: ['m1'] }, NOW).map(r => r.id))
    .toEqual(['vw1'])
  expect(filterVolumeWorks(rows, tasksByVw, { dueSoon: true }, NOW).map(r => r.id))
    .toEqual(['vw1'])
  expect(filterVolumeWorks(rows, tasksByVw, { hideCompleted: true }, NOW).map(r => r.id))
    .toEqual(['vw1', 'vw2'])
})

test('TASK_PRESETS: 10종, 라벨 존재', () => {
  expect(TASK_PRESETS).toHaveLength(10)
  expect(TASK_PRESETS[0]).toHaveProperty('type')
  expect(TASK_PRESETS[0]).toHaveProperty('label')
  expect(SELECTION_LABELS.confirmed).toBe('확정')
})
