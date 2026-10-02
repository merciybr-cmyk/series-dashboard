import { groupKeyOf, groupKeyOfRow, eraKeyOf, desiredOrders, assignSortOrders } from '../board/compareOrder.js'

const r = (id, volume_id, part_id, sort_order, genre, home = true) =>
  ({ id, volume_id, part_id, sort_order, work_snapshot: { genre }, home })

test('묶음 키: 권·부·시대 (부 없음은 none, 모르는 갈래는 기타)', () => {
  expect(groupKeyOf('v1', 'p2', '고전')).toBe('v1|p2|고전')
  expect(groupKeyOf('v1', null, '현대')).toBe('v1|none|현대')
  expect(eraKeyOf({ work_snapshot: { genre: '고전소설' } })).toBe('고전')
  expect(eraKeyOf({ work_snapshot: { genre: '이상한갈래' } })).toBe('기타')
  expect(groupKeyOfRow(r('a', 'v1', 'p2', 10, '소설'))).toBe('v1|p2|현대')
})

test('desiredOrders: 순서 목록이 없으면 home(번호 순) → home 아닌 행(들어온 순)', () => {
  const rows = [r('a', 'v1', 'p1', 20, '시'), r('b', 'v1', 'p1', 10, '시'), r('x', 'v1', 'p1', null, '시', false)]
  expect(desiredOrders(rows, {}).get('v1|p1|현대')).toEqual(['b', 'a', 'x'])
})

describe('assignSortOrders', () => {
  test('순서 목록이 없으면 home 행 번호는 그대로', () => {
    const rows = [r('a', 'v1', 'p1', 10, '소설'), r('b', 'v1', 'p1', 20, '고전소설'), r('c', 'v1', 'p1', 30, '소설')]
    const out = assignSortOrders(rows, { orders: {}, freshStart: () => 100 })
    expect(Object.fromEntries(out)).toEqual({ a: 10, b: 20, c: 30 })
  })

  test('같은 묶음이 쓰던 번호를 새 순서대로 다시 나눈다 — 다른 시대 행의 자리는 그대로', () => {
    // 현대 a(10) · 고전 b(20) · 현대 c(30) → 현대 순서를 c, a로
    const rows = [r('a', 'v1', 'p1', 10, '소설'), r('b', 'v1', 'p1', 20, '고전소설'), r('c', 'v1', 'p1', 30, '소설')]
    const out = assignSortOrders(rows, { orders: { 'v1|p1|현대': ['c', 'a'] }, freshStart: () => 100 })
    expect(Object.fromEntries(out)).toEqual({ c: 10, b: 20, a: 30 })
  })

  test('옮겨 오거나 넣은 행은 그 권 맨 뒤 번호를 받아 원하는 자리에 들어간다', () => {
    const rows = [r('a', 'v1', 'p1', 10, '소설'), r('b', 'v1', 'p1', 30, '소설'), r('x', 'v1', 'p1', null, '소설', false)]
    const out = assignSortOrders(rows, { orders: { 'v1|p1|현대': ['a', 'x', 'b'] }, freshStart: () => 40 })
    expect(Object.fromEntries(out)).toEqual({ a: 10, x: 30, b: 40 })
  })

  test('순서 목록 없이 옮겨 온 행은 묶음 맨 끝 — 새 번호는 권마다 이어 받는다', () => {
    const rows = [
      r('a', 'v1', 'p1', 10, '소설'), r('x', 'v1', 'p1', null, '소설', false),
      r('y', 'v1', 'p2', null, '시', false), r('z', 'v2', 'q1', null, '시', false),
    ]
    const out = assignSortOrders(rows, { orders: {}, freshStart: v => ({ v1: 50, v2: 7 })[v] })
    expect(Object.fromEntries(out)).toEqual({ a: 10, x: 50, y: 60, z: 7 })
  })

  test('목록에 없는 구성원(그사이 들어온 작품)은 뒤에 붙고, 목록의 사라진 행은 무시한다', () => {
    const rows = [r('a', 'v1', 'p1', 10, '시'), r('b', 'v1', 'p1', 20, '시'), r('n', 'v1', 'p1', 30, '시')]
    const out = assignSortOrders(rows, { orders: { 'v1|p1|현대': ['b', 'gone', 'a'] }, freshStart: () => 100 })
    expect(Object.fromEntries(out)).toEqual({ b: 10, a: 20, n: 30 })
  })
})
