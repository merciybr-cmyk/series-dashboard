// 권별 비교 순서 배정 (설계 2026-10-02 compare-order §2): 같은 묶음(권·부·시대)이 쓰던 순서 번호를 새 순서대로
// 다시 나누고, 옮겨 오거나 새로 넣은 작품은 그 권 맨 뒤 번호를 받아 묶음에 합류한다. 화면 표시와 저장이 같은 함수를 쓴다.
// 권 보드에서 고전·현대가 섞여 있던 자리 배치는 그대로 남는다(같은 묶음이 쓰던 번호끼리만 바뀐다).
import { eraOf } from './genreUtils.js'

export const groupKeyOf = (volumeId, partId, era) => `${volumeId}|${partId ?? 'none'}|${era}`
export const eraKeyOf = row => eraOf(row.work_snapshot?.genre) || '기타'
export const groupKeyOfRow = row => groupKeyOf(row.volume_id, row.part_id, eraKeyOf(row))

// orders 없는 묶음의 순서: home(지금 번호 순) → home 아닌 행(들어온 순)
function naturalOrder(members) {
  const home = members.filter(r => r.home).sort((a, b) => a.sort_order - b.sort_order)
  const away = members.filter(r => !r.home)
  return [...home, ...away].map(r => r.id)
}

// 묶음별 원하는 순서. orders[묶음]이 있으면 그 목록(지금 구성원만) + 목록에 없는 구성원(자연 순서)
export function desiredOrders(rows, orders = {}) {
  const groups = new Map()
  for (const r of rows) {
    const k = groupKeyOfRow(r)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  const out = new Map()
  for (const [k, members] of groups) {
    const natural = naturalOrder(members)
    const wanted = orders[k]
    if (!wanted) {
      out.set(k, natural)
      continue
    }
    const ids = new Set(members.map(r => r.id))
    const listed = wanted.filter(id => ids.has(id))
    const seen = new Set(listed)
    out.set(k, [...listed, ...natural.filter(id => !seen.has(id))])
  }
  return out
}

// rows: 살아 있는 행. home = 지금 번호가 지금 권의 유효한 자리(편집 전부터 이 묶음에 있던 행).
// freshStart(volumeId): 그 권의 첫 새 번호. 새 번호는 home 아닌 행이 처음 나타나는 묶음부터, 묶음 안에서는 원하는 순서대로 10씩.
// 묶음의 home 번호가 서로 겹치면(같은 번호 두 행) 그 묶음은 구성원 모두 새 번호를 받는다 — 겹친 번호로는 순서를 가릴 수 없다.
export function assignSortOrders(rows, { orders = {}, freshStart }) {
  const byId = new Map(rows.map(r => [r.id, r]))
  const desired = desiredOrders(rows, orders)
  const firstAway = new Map()
  rows.forEach((r, i) => {
    if (r.home) return
    const k = groupKeyOfRow(r)
    if (!firstAway.has(k)) firstAway.set(k, i)
  })
  const keys = [...desired.keys()].sort((a, b) => (firstAway.get(a) ?? Number.MAX_SAFE_INTEGER) - (firstAway.get(b) ?? Number.MAX_SAFE_INTEGER))

  const nextFresh = new Map()
  const takeFresh = volumeId => {
    if (!nextFresh.has(volumeId)) nextFresh.set(volumeId, freshStart(volumeId))
    const n = nextFresh.get(volumeId)
    nextFresh.set(volumeId, n + 10)
    return n
  }

  const result = new Map()
  for (const k of keys) {
    const ids = desired.get(k)
    const members = ids.map(id => byId.get(id))
    const homeNums = members.filter(r => r.home).map(r => r.sort_order).sort((a, b) => a - b)
    // 쓰던 번호가 겹친 묶음은 번호만 나눠서는 순서를 바꿀 수 없다 — 구성원 모두 새 번호를 받아 스스로 고친다
    const tied = new Set(homeNums).size !== homeNums.length
    const slots = tied ? members.map(r => takeFresh(r.volume_id)) : homeNums
    if (!tied) for (const r of members) if (!r.home) slots.push(takeFresh(r.volume_id))
    ids.forEach((id, i) => result.set(id, slots[i]))
  }
  return result
}
