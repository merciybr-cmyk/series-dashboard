import { describe, test, expect } from 'vitest'
import {
  taskUrgency, urgencyIcon, sortMyTasks, buildAttention, volumeProgress, describeActivity, groupActivity,
} from '../board/homeUtils.js'

const NOW = new Date(2026, 7, 25) // 2026-08-25

describe('taskUrgency', () => {
  test('지남/오늘/3일/7일/그 외', () => {
    expect(taskUrgency('2026-08-24', NOW)).toBe('overdue')
    expect(taskUrgency('2026-08-25', NOW)).toBe('today')
    expect(taskUrgency('2026-08-28', NOW)).toBe('d3')
    expect(taskUrgency('2026-09-01', NOW)).toBe('d7')
    expect(taskUrgency('2026-10-01', NOW)).toBe('none')
    expect(taskUrgency(null, NOW)).toBe('none')
  })
})

describe('urgencyIcon', () => {
  test('urgencyIcon', () => {
    expect(urgencyIcon('overdue')).toBe('🔴')
    expect(urgencyIcon('today')).toBe('🟠')
    expect(urgencyIcon('d3')).toBe('🟡')
    expect(urgencyIcon('d7')).toBe('')
  })
})

describe('sortMyTasks', () => {
  test('긴급도순 → 마감일순, 무마감 마지막', () => {
    const sorted = sortMyTasks([
      { id: 'a', due_date: null },
      { id: 'b', due_date: '2026-08-27' },
      { id: 'c', due_date: '2026-08-24' },
      { id: 'd', due_date: '2026-08-26' },
    ], NOW)
    expect(sorted.map(t => t.id)).toEqual(['c', 'd', 'b', 'a'])
  })
})

const VW = (id, sel, num, title) => ({
  id, selection_status: sel, volume_id: 'v' + num,
  volumes: { number: num, title: '주제' }, work_snapshot: { title, author: '작가' },
})

describe('buildAttention', () => {
  test('4개 규칙과 우선순위', () => {
    const vworks = [
      VW('vw1', 'confirmed', 1, '소나기'),   // 마감 지난 업무 → high
      VW('vw2', 'confirmed', 1, '산유화'),   // 업무 0건 + 자료 없음 → high + mid
      VW('vw3', 'candidate', 2, '봄봄'),     // 7일 내 담당자 없음 → mid
    ]
    const tasksByVw = {
      vw1: [{ id: 't1', title: '해제 작성', status: 'todo', due_date: '2026-08-20', assignee_id: 'm1' }],
      vw3: [{ id: 't2', title: '본문 확보', status: 'todo', due_date: '2026-08-28', assignee_id: null }],
    }
    const items = buildAttention(vworks, tasksByVw, new Set(['vw1', 'vw3']), NOW)
    const texts = items.map(i => i.text)
    expect(items.filter(i => i.level === 'high')).toHaveLength(2)
    expect(texts.some(t => t.includes('소나기') && t.includes('해제 작성'))).toBe(true)
    expect(texts.some(t => t.includes('산유화') && t.includes('업무가 없습니다'))).toBe(true)
    expect(texts.some(t => t.includes('봄봄') && t.includes('담당자'))).toBe(true)
    expect(texts.some(t => t.includes('산유화') && t.includes('자료가 없습니다'))).toBe(true)
    expect(items[0].level).toBe('high') // high 먼저
  })
})

describe('volumeProgress', () => {
  test('권별 확정·업무 진행률', () => {
    const volumes = [{ id: 'v1', number: 1, title: '삶' }]
    const allVw = [
      { id: 'a', volume_id: 'v1', selection_status: 'confirmed' },
      { id: 'b', volume_id: 'v1', selection_status: 'candidate' },
    ]
    const allTasks = [
      { id: 't1', status: 'done', volume_works: { volume_id: 'v1' } },
      { id: 't2', status: 'todo', volume_works: { volume_id: 'v1' } },
    ]
    const rows = volumeProgress(volumes, allVw, allTasks)
    expect(rows[0]).toMatchObject({ total: 2, confirmed: 1, done: 1, taskTotal: 2, pct: 50 })
  })
})

describe('describeActivity', () => {
  test('주요 문구와 폴백', () => {
    const nameOf = () => '윤보라'
    expect(describeActivity(
      { table_name: 'volume_works', action: 'insert', diff: { work_snapshot: { title: '소나기' } }, actor_id: 'm1' }, nameOf,
    )).toBe('윤보라님이 「소나기」을(를) 추가했습니다')
    expect(describeActivity(
      { table_name: 'volume_works', action: 'update', diff: { selection_status: ['candidate', 'confirmed'] }, actor_id: 'm1' }, nameOf,
    )).toBe("윤보라님이 선정 상태를 '확정'(으)로 변경했습니다")
    expect(describeActivity(
      { table_name: 'work_tasks', action: 'update', diff: { status: ['todo', 'done'] }, actor_id: 'm1' }, nameOf,
    )).toBe('윤보라님이 업무를 완료했습니다')
    expect(describeActivity(
      { table_name: 'schedules', action: 'update', diff: null, actor_id: 'm1' }, nameOf,
    )).toBe('윤보라님이 일정을 변경했습니다')
  })

  test('일정 문구', () => {
    const nameOf = () => '윤보라'
    expect(describeActivity(
      { table_name: 'schedules', action: 'insert', diff: { title: '편집회의' }, actor_id: 'm1' }, nameOf,
    )).toBe("윤보라님이 일정 '편집회의'을(를) 등록했습니다")
    expect(describeActivity(
      { table_name: 'schedules', action: 'update', diff: { done: [false, true] }, actor_id: 'm1' }, nameOf,
    )).toBe('윤보라님이 일정을 완료 처리했습니다')
  })

  test('작성자가 없으면 DB 직접 수정, 명단에 없으면 알 수 없는 사용자', () => {
    const nameOf = () => undefined
    expect(describeActivity({ table_name: 'volumes', action: 'update', diff: {}, actor_id: null }, nameOf))
      .toBe('DB 직접 수정으로 권 정보를 변경했습니다')
    expect(describeActivity({ table_name: 'volumes', action: 'update', diff: {}, actor_id: 'gone' }, nameOf))
      .toBe('알 수 없는 사용자님이 권 정보를 변경했습니다')
  })
})

describe('groupActivity', () => {
  const nameOf = id => ({ m1: '윤보라', m2: '최홍원' })[id]
  const at = min => new Date(Date.UTC(2026, 8, 28, 5, min)).toISOString()
  const vw = (id, action, batch, title, genre, min, actor = 'm1') => ({
    id, table_name: 'volume_works', action, actor_id: actor, created_at: at(min),
    diff: { placement_batch_id: batch, work_snapshot: { title, genre } },
  })

  test('자동 배치 묶음은 한 줄로 (추가·되돌리기)', () => {
    const entries = [ // 최신순
      vw(9, 'delete', 'b1', '풀', '시', 30), vw(8, 'delete', 'b1', '서시', '시', 30),
      vw(7, 'insert', 'b1', '풀', '시', 10), vw(6, 'insert', 'b1', '서시', '시', 10), vw(5, 'insert', 'b1', '가시리', '고전운문', 10),
    ]
    expect(groupActivity(entries, nameOf).map(g => g.text)).toEqual([
      '윤보라님이 자동 배치를 되돌려 현대시 2편을 제거했습니다',
      '윤보라님이 자동 배치로 현대시·고전운문 3편을 추가했습니다',
    ])
  })

  test('같은 사람·같은 문구가 10분 안에 이어지면 (N건)으로 합친다', () => {
    const upd = (id, min, actor = null) => ({ id, table_name: 'volumes', action: 'update', diff: {}, actor_id: actor, created_at: at(min) })
    const entries = [upd(5, 7), upd(4, 7), upd(3, 7), upd(2, 7, 'm2'), upd(1, 0, 'm2')]
    expect(groupActivity(entries, nameOf).map(g => g.text)).toEqual([
      'DB 직접 수정으로 권 정보를 변경했습니다 (3건)',
      '최홍원님이 권 정보를 변경했습니다 (2건)',
    ])
  })

  test('손으로 추가한 작품(묶음 없음)은 제목이 달라 따로 보이고, limit만큼만 돌려준다', () => {
    const entries = [vw(3, 'insert', null, '풀', '시', 3), vw(2, 'insert', null, '서시', '시', 2), vw(1, 'insert', null, '향수', '시', 1)]
    const out = groupActivity(entries, nameOf, 2)
    expect(out.map(g => g.text)).toEqual(['윤보라님이 「풀」을(를) 추가했습니다', '윤보라님이 「서시」을(를) 추가했습니다'])
    expect(out[0]).toMatchObject({ id: 3, created_at: at(3) })
  })
})
