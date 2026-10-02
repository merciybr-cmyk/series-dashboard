# 권별 비교 — 부 안 수록 순서 바꾸기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 권별 비교 편집 모드에서 같은 부·같은 시대 묶음(고전/현대/기타) 안의 작품 순서를 끌어 놓기·⋯ 메뉴로 바꾸고, 다른 권·부로 옮길 때도 원하는 위치에 끼워 넣으며, 저장 때 sort_order로 반영한다.

**Architecture:** 새 순수 모듈 `compareOrder.js`가 "같은 묶음이 쓰던 순서 번호를 새 순서대로 다시 나누고, 옮겨 오거나 넣은 행은 그 권 맨 뒤 번호를 받는" 배정 규칙을 담당하고, 화면(`effectiveRows`)과 저장(`planSave`)이 같은 함수를 쓴다. draft에 `orders`(묶음 키 → 행 id 순서)를 더하고, 줄도 놓을 곳이 되어 포인터가 줄 위/아래 절반 어디냐로 끼워 넣을 자리를 정한다.

**Tech Stack:** React 19, @dnd-kit/core 6.3.1(추가 라이브러리 없음), Tailwind v4, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-02-compare-order-design.md` (선행: `2026-10-02-compare-edit-design.md`)

## Global Constraints

- A안: 시대 묶음을 넘는 순서 변경 없음. 묶음 = (권, 부, 시대), 시대 = `eraOf(work_snapshot.genre) || '기타'`, 키 `` `${volumeId}|${partId ?? 'none'}|${era}` ``.
- 순서만 바뀐 줄에는 표시 없음. '바뀐 작품 N건'에는 순서를 바꾼 묶음 하나 = 1건.
- 저장 확인 창 요약 `옮기기 n · 넣기 n · 빼기 n · 순서 n`, 순서 줄 `"{N}권 {M}부 {시대} — 순서 변경"`. 결과 `반영했습니다: 옮기기 n · 넣기 n · 빼기 n · 순서 n`.
- ⋯ 메뉴 문구: '위로', '아래로', '이 묶음 순서 되돌리기'.
- 실행 순서: 빼기 → 옮기기 → 넣기 → 순서 바꾸기(`updateVolumeWork(id, { sort_order })`).
- DB·SQL 변경 없음, 새 npm 의존성 없음.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 테스트: `npx vitest run <파일>` (작업 디렉터리 `series-dashboard`). 시작 기준 279건 통과. 브랜치 `compare-order`(master에서).

## 파일 구조

| 파일 | 상태 | 책임 |
|---|---|---|
| `src/board/compareOrder.js` | 신규 | 묶음 키, 원하는 순서, 순서 번호 배정(순수) |
| `src/board/compareEdit.js` | 수정 | draft.orders, 화면 순서, 끼워 넣기·위아래·되돌리기, 정리, 놓을 자리 해석 |
| `src/board/compareSave.js` | 수정 | 배정 규칙으로 옮기기·넣기 번호, 순서 바꾸기 실행, 결과 문구 |
| `src/board/CompareDnd.jsx` | 수정 | 줄도 놓을 곳, 충돌 판정에 줄 우선·앞/뒤 |
| `src/board/CompareWorkRow.jsx` | 수정 | 들어갈 자리 파란 선 |
| `src/board/CompareMoveMenu.jsx` | 수정 | 위로·아래로·이 묶음 순서 되돌리기 |
| `src/board/CompareSaveDialog.jsx` | 수정 | 순서 줄·개수 |
| `src/board/ComparePage.jsx` | 수정 | 연결(끌기 중 선, 메뉴, 놓기) |

---

### Task 1: 순서 번호 배정 모듈 `compareOrder.js`

**Files:**
- Create: `src/board/compareOrder.js`
- Test: `src/tests/compareOrder.test.js`

**Interfaces:**
- Consumes: `eraOf(genre)` (`src/board/genreUtils.js`, 고전/현대/null)
- Produces:
  - `groupKeyOf(volumeId, partId, era) → string`
  - `eraKeyOf(row) → '고전'|'현대'|'기타'`
  - `groupKeyOfRow(row) → string` (row: `{ volume_id, part_id, work_snapshot }`)
  - `desiredOrders(rows, orders) → Map<groupKey, id[]>`
  - `assignSortOrders(rows, { orders, freshStart }) → Map<id, sortOrder>` — rows: `{ id, volume_id, part_id, sort_order, work_snapshot, home }`(살아 있는 행만), `freshStart(volumeId) → number`

- [ ] **Step 1: 브랜치**

```bash
cd "D:/교과서 문학 단행본 시리즈/series-dashboard"
git checkout -b compare-order
```

- [ ] **Step 2: 실패하는 테스트** — `src/tests/compareOrder.test.js`

```js
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
```

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/tests/compareOrder.test.js`
Expected: FAIL — `Failed to resolve import "../board/compareOrder.js"`

- [ ] **Step 4: 구현** — `src/board/compareOrder.js`

```js
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
export function assignSortOrders(rows, { orders = {}, freshStart }) {
  const byId = new Map(rows.map(r => [r.id, r]))
  const desired = desiredOrders(rows, orders)
  const firstAway = new Map()
  rows.forEach((r, i) => {
    if (r.home) return
    const k = groupKeyOfRow(r)
    if (!firstAway.has(k)) firstAway.set(k, i)
  })
  const keys = [...desired.keys()].sort((a, b) => (firstAway.get(a) ?? Infinity) - (firstAway.get(b) ?? Infinity))

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
    const slots = members.filter(r => r.home).map(r => r.sort_order).sort((a, b) => a - b)
    for (const r of members) if (!r.home) slots.push(takeFresh(r.volume_id))
    ids.forEach((id, i) => result.set(id, slots[i]))
  }
  return result
}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/tests/compareOrder.test.js`
Expected: PASS (7 tests)

- [ ] **Step 6: Commit**

```bash
git add src/board/compareOrder.js src/tests/compareOrder.test.js
git commit -m "feat: 권별 비교 순서 번호 배정 모듈(같은 묶음 번호 재배분, 옮겨 온 작품은 권 맨 뒤 번호)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 편집 상태에 순서 더하기 (`compareEdit.js`)

**Files:**
- Modify: `src/board/compareEdit.js`
- Test: `src/tests/compareEdit.test.js` (import 바꾸고 끝에 추가)

**Interfaces:**
- Consumes: Task 1 `assignSortOrders`, `groupKeyOf`, `groupKeyOfRow`, `eraKeyOf`; `nextSortOrder`(`./boardUtils.js`); `eraOf`(`./genreUtils.js`)
- Produces (compareEdit.js named exports, 기존 것은 시그니처 유지 — 단 removeRow·revertRow는 선택 인자 baseline 추가):
  - `EMPTY_DRAFT = { moves: {}, removes: {}, adds: [], orders: {} }`
  - `changeCount(draft)` — 옮기기+빼기+넣기+orders 항목 수
  - `effectiveRows(baseline, draft)` — 기존 플래그 + 살아 있는 행의 화면용 sort_order(배정 규칙)
  - `groupOrder(rows, groupKey) → id[]` (rows = effectiveRows 결과, 뺀 행 제외, sort_order 순)
  - `placeInGroup(draft, baseline, rowId, { anchorId = null, position = 'after' } = {}) → draft`
  - `moveInGroup(draft, baseline, rowId, dir /* -1 | 1 */) → draft` (끝이면 같은 draft 객체)
  - `revertGroupOrder(draft, groupKey) → draft`
  - `removeRow(draft, rowId, baseline?)`, `revertRow(draft, rowId, baseline?)` — baseline을 주면 orders 정리
  - `resolveAnchor({ rows, era, selfId, over }) → { anchorId, position } | null` — over: `{ volumeId, partId, anchorId?, position? }`
  - `resolveDrop(...)` — over에 `anchorId`·`position`이 있으면 그 자리에 끼워 넣기
  - `describeDraft` — 끝에 `{ kind: 'order', rowId: groupKey, title: null, to: '{place} {era}' }`

- [ ] **Step 1: 실패하는 테스트** — `src/tests/compareEdit.test.js`

맨 위 import를 아래로 바꾼다:

```js
import {
  EMPTY_DRAFT, changeCount, effectiveRows, moveRow, removeRow, revertRow, addWork,
  canPlace, placeErrorText, defaultPartFor, resolveDrop, toDropActive, describeDraft,
  groupOrder, placeInGroup, moveInGroup, revertGroupOrder, resolveAnchor,
} from '../board/compareEdit.js'
```

파일 끝에 추가:

```js
describe('순서 바꾸기', () => {
  const R = (id, part_id, sort_order, genre) => ({
    id, volume_id: 'v1', work_id: `W${id}`, part_id, sort_order, selection_status: 'candidate',
    work_snapshot: { title: `작품${id}`, author: '작가', genre, curriculum: [] },
  })
  // 1권 2부: 현대 a(10) · 고전 g(20) · 현대 b(30) · 현대 c(40) / 1권 1부: 현대 z(50)
  const B = [R('a', 'p2', 10, '소설'), R('g', 'p2', 20, '고전소설'), R('b', 'p2', 30, '소설'), R('c', 'p2', 40, '소설'), R('z', 'p1', 50, '시')]
  const K = 'v1|p2|현대'
  const order = d => groupOrder(effectiveRows(B, d), K)
  const drop = (active, over) =>
    resolveDrop({ draft: EMPTY_DRAFT, baseline: B, active, over, volumeNumberOf: () => 1, newTempId: () => 'n1' })

  test('placeInGroup: 줄 앞에 끼워 넣으면 묶음 순서가 바뀌고 1건 — 화면 번호는 그 묶음이 쓰던 번호를 다시 나눈다', () => {
    const d = placeInGroup(EMPTY_DRAFT, B, 'c', { anchorId: 'a', position: 'before' })
    expect(order(d)).toEqual(['c', 'a', 'b'])
    expect(changeCount(d)).toBe(1)
    const nums = Object.fromEntries(effectiveRows(B, d).map(r => [r.id, r.sort_order]))
    expect(nums).toMatchObject({ c: 10, g: 20, a: 30, b: 40 })
  })

  test('placeInGroup: anchor가 없거나 다른 시대면 묶음 맨 끝', () => {
    expect(order(placeInGroup(EMPTY_DRAFT, B, 'a', { anchorId: 'g', position: 'before' }))).toEqual(['b', 'c', 'a'])
    expect(order(placeInGroup(EMPTY_DRAFT, B, 'a', {}))).toEqual(['b', 'c', 'a'])
  })

  test('원래 순서로 돌아오면 바뀐 것이 아니다', () => {
    const once = placeInGroup(EMPTY_DRAFT, B, 'c', { anchorId: 'a', position: 'before' })
    const back = placeInGroup(once, B, 'c', { anchorId: 'b', position: 'after' })
    expect(changeCount(back)).toBe(0)
    expect(back.orders).toEqual({})
  })

  test('moveInGroup: 위·아래 한 칸, 끝이면 그대로', () => {
    expect(order(moveInGroup(EMPTY_DRAFT, B, 'b', -1))).toEqual(['b', 'a', 'c'])
    expect(order(moveInGroup(EMPTY_DRAFT, B, 'b', 1))).toEqual(['a', 'c', 'b'])
    expect(moveInGroup(EMPTY_DRAFT, B, 'a', -1)).toBe(EMPTY_DRAFT)
  })

  test('revertGroupOrder: 그 묶음 순서를 편집 시작 때로', () => {
    expect(changeCount(revertGroupOrder(moveInGroup(EMPTY_DRAFT, B, 'b', -1), K))).toBe(0)
  })

  test('순서 바꾼 행을 빼서 남은 순서가 원래와 같아지면 순서 변경도 사라진다', () => {
    const d = removeRow(moveInGroup(EMPTY_DRAFT, B, 'b', -1), 'b', B)
    expect(d.orders).toEqual({})
    expect(changeCount(d)).toBe(1)
  })

  test('describeDraft: 순서 항목은 묶음 단위', () => {
    const d = moveInGroup(EMPTY_DRAFT, B, 'b', -1)
    expect(describeDraft(d, B, (v, p) => `${v}/${p}`)).toEqual([{ kind: 'order', rowId: K, title: null, to: 'v1/p2 현대' }])
  })

  test('resolveAnchor: 같은 묶음 줄이면 그 줄 앞·뒤, 다른 시대 줄이면 자기 묶음 마지막 줄 뒤, 빈 묶음이면 anchor 없음, 자기 자신이면 null', () => {
    const rows = effectiveRows(B, EMPTY_DRAFT)
    expect(resolveAnchor({ rows, era: '현대', selfId: 'c', over: { volumeId: 'v1', partId: 'p2', anchorId: 'a', position: 'before' } }))
      .toEqual({ anchorId: 'a', position: 'before' })
    expect(resolveAnchor({ rows, era: '현대', selfId: 'a', over: { volumeId: 'v1', partId: 'p2', anchorId: 'g', position: 'before' } }))
      .toEqual({ anchorId: 'c', position: 'after' })
    expect(resolveAnchor({ rows, era: '고전', selfId: null, over: { volumeId: 'v1', partId: 'p1' } }))
      .toEqual({ anchorId: null, position: 'after' })
    expect(resolveAnchor({ rows, era: '현대', selfId: 'a', over: { volumeId: 'v1', partId: 'p2', anchorId: 'a', position: 'after' } }))
      .toBeNull()
  })

  test('resolveDrop: 같은 묶음 안에 놓으면 옮기기 없이 순서만', () => {
    const { draft } = drop({ type: 'row', rowId: 'c' }, { volumeId: 'v1', partId: 'p2', anchorId: 'a', position: 'before' })
    expect(draft.moves).toEqual({})
    expect(order(draft)).toEqual(['c', 'a', 'b'])
  })

  test('resolveDrop: 자기 자신 위에 놓으면 그대로', () => {
    expect(drop({ type: 'row', rowId: 'a' }, { volumeId: 'v1', partId: 'p2', anchorId: 'a', position: 'after' }).draft).toBe(EMPTY_DRAFT)
  })

  test('resolveDrop: 다른 부에서 옮겨 와 줄 사이에 끼워 넣는다', () => {
    const { draft } = drop({ type: 'row', rowId: 'z' }, { volumeId: 'v1', partId: 'p2', anchorId: 'a', position: 'after' })
    expect(draft.moves).toEqual({ z: { volumeId: 'v1', partId: 'p2' } })
    expect(order(draft)).toEqual(['a', 'z', 'b', 'c'])
  })

  test('resolveDrop: 검색 결과를 줄 앞에 넣는다', () => {
    const work = { '작품명': '돌다리', '지은이': '이태준', '장르': '소설', _authorBase: '이태준' }
    const { draft } = drop({ type: 'sheet', key: 'k', workId: 'W9', curricula: [], work }, { volumeId: 'v1', partId: 'p2', anchorId: 'a', position: 'before' })
    expect(order(draft)).toEqual(['n1', 'a', 'b', 'c'])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/tests/compareEdit.test.js`
Expected: FAIL — `groupOrder is not a function` 등 새 테스트 실패(기존 14건은 통과)

- [ ] **Step 3: 구현** — `src/board/compareEdit.js`

1) 머리 주석과 import, `EMPTY_DRAFT`·도우미를 아래로 바꾼다:

```js
// 권별 비교 편집 상태 (설계 2026-10-02 §5): 편집 중 바뀐 내용을 화면에만 모아 둔다. 순수 함수만.
// draft = { moves: { 행id: { volumeId, partId } }, removes: { 행id: true }, adds: [넣을 작품], orders: { 묶음키: 행id[] } }
// orders(2026-10-02 compare-order): 같은 부·같은 시대 묶음 안의 원하는 순서
import { bucketOf, eraOf } from './genreUtils.js'
import { partNumberFor } from './placementUtils.js'
import { snapshotOf } from '../works/workKey.js'
import { nextSortOrder } from './boardUtils.js'
import { assignSortOrders, groupKeyOf, groupKeyOfRow, eraKeyOf } from './compareOrder.js'

export const EMPTY_DRAFT = { moves: {}, removes: {}, adds: [], orders: {} }

const isAdd = (draft, id) => draft.adds.some(a => a.tempId === id)
const samePart = (a, b) => (a ?? null) === (b ?? null)
const ordersOf = draft => draft.orders || {}
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

export function changeCount(draft) {
  return Object.keys(draft.moves).length + Object.keys(draft.removes).length + draft.adds.length
    + Object.keys(ordersOf(draft)).length
}
```

2) `effectiveRows`를 아래로 바꾸고, 그 아래에 `orderInput`·`groupOrder`·`normalizeOrders`를 둔다:

```js
// baseline(편집 시작 때 읽은 행)에 draft를 반영한 화면용 행. 표시용 플래그(_moved·_removed·_added)를 붙이고,
// 살아 있는 행의 sort_order를 순서 배정 규칙(compareOrder)으로 다시 매겨 화면 순서를 만든다.
export function effectiveRows(baseline, draft) {
  const rows = baseline.map(r => {
    if (draft.removes[r.id]) return { ...r, _removed: true }
    const m = draft.moves[r.id]
    if (m) return { ...r, volume_id: m.volumeId, part_id: m.partId, _moved: { fromVolumeId: r.volume_id, fromPartId: r.part_id } }
    return r
  })
  for (const a of draft.adds) {
    rows.push({
      id: a.tempId, volume_id: a.volumeId, part_id: a.partId, work_id: a.workId,
      sort_order: Number.MAX_SAFE_INTEGER, selection_status: 'candidate',
      work_snapshot: a.snapshot, _added: true, _key: a.key,
    })
  }
  const freshStart = v => nextSortOrder(baseline.filter(r => r.volume_id === v && !draft.removes[r.id]))
  const assigned = assignSortOrders(orderInput(rows, draft), { orders: ordersOf(draft), freshStart })
  return rows.map(r => (assigned.has(r.id) && assigned.get(r.id) !== r.sort_order ? { ...r, sort_order: assigned.get(r.id) } : r))
}

// 순서 배정 입력: 살아 있는 행. home = 옮기지도 넣지도 않은 행. 순서는 home → 옮긴 행(draft 순) → 넣은 행 (저장과 같은 규칙)
function orderInput(rows, draft) {
  const live = rows.filter(r => !r._removed)
  const moveOrder = Object.keys(draft.moves)
  return [
    ...live.filter(r => !r._moved && !r._added).map(r => ({ ...r, home: true })),
    ...live.filter(r => r._moved).sort((a, b) => moveOrder.indexOf(a.id) - moveOrder.indexOf(b.id)).map(r => ({ ...r, home: false })),
    ...live.filter(r => r._added).map(r => ({ ...r, home: false })),
  ]
}

// 묶음의 지금 화면 순서 (rows = effectiveRows 결과, 뺀 행 제외)
export function groupOrder(rows, groupKey) {
  return rows
    .filter(r => !r._removed && groupKeyOfRow(r) === groupKey)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(r => r.id)
}

// 원래 순서와 같아졌거나 구성원이 없어진 묶음 순서는 지운다 — 되돌리면 '바뀐 작품'이 줄어든다
function normalizeOrders(draft, baseline) {
  const orders = ordersOf(draft)
  const keys = Object.keys(orders)
  if (!keys.length) return draft
  const withOrders = effectiveRows(baseline, draft)
  const natural = effectiveRows(baseline, { ...draft, orders: {} })
  const kept = {}
  for (const k of keys) {
    const want = groupOrder(withOrders, k)
    if (want.length && !sameList(want, groupOrder(natural, k))) kept[k] = orders[k]
  }
  return { ...draft, orders: kept }
}
```

3) `moveRow`·`removeRow`·`revertRow`를 아래로 바꾼다(정리 추가, removeRow·revertRow는 선택 인자 baseline):

```js
export function moveRow(draft, baseline, rowId, volumeId, partId) {
  if (isAdd(draft, rowId)) {
    return normalizeOrders({ ...draft, adds: draft.adds.map(a => (a.tempId === rowId ? { ...a, volumeId, partId: partId ?? null } : a)) }, baseline)
  }
  const base = baseline.find(r => r.id === rowId)
  if (!base) return draft
  const moves = { ...draft.moves }
  if (base.volume_id === volumeId && samePart(base.part_id, partId)) delete moves[rowId]
  else moves[rowId] = { volumeId, partId: partId ?? null }
  return normalizeOrders({ ...draft, moves }, baseline)
}

export function removeRow(draft, rowId, baseline = null) {
  let next
  if (isAdd(draft, rowId)) next = { ...draft, adds: draft.adds.filter(a => a.tempId !== rowId) }
  else {
    const moves = { ...draft.moves }
    delete moves[rowId]
    next = { ...draft, moves, removes: { ...draft.removes, [rowId]: true } }
  }
  return baseline ? normalizeOrders(next, baseline) : next
}

export function revertRow(draft, rowId, baseline = null) {
  if (isAdd(draft, rowId)) return removeRow(draft, rowId, baseline)
  const moves = { ...draft.moves }
  const removes = { ...draft.removes }
  delete moves[rowId]
  delete removes[rowId]
  const next = { ...draft, moves, removes }
  return baseline ? normalizeOrders(next, baseline) : next
}
```

4) `addWork` 아래에 순서 함수들을 추가:

```js
// 행을 그 묶음 안 anchorId 앞(before)/뒤(after)로. anchor가 없거나 다른 묶음이면 맨 끝 (설계 compare-order §3)
export function placeInGroup(draft, baseline, rowId, { anchorId = null, position = 'after' } = {}) {
  const rows = effectiveRows(baseline, draft)
  const row = rows.find(r => r.id === rowId)
  if (!row || row._removed) return draft
  const key = groupKeyOfRow(row)
  const ids = groupOrder(rows, key).filter(id => id !== rowId)
  let at = ids.length
  const anchor = anchorId && anchorId !== rowId ? rows.find(r => r.id === anchorId) : null
  if (anchor && !anchor._removed && groupKeyOfRow(anchor) === key) {
    const i = ids.indexOf(anchorId)
    at = position === 'before' ? i : i + 1
  }
  ids.splice(at, 0, rowId)
  return normalizeOrders({ ...draft, orders: { ...ordersOf(draft), [key]: ids } }, baseline)
}

// 같은 묶음 안에서 한 칸 위(-1)·아래(+1). 끝이면 그대로
export function moveInGroup(draft, baseline, rowId, dir) {
  const rows = effectiveRows(baseline, draft)
  const row = rows.find(r => r.id === rowId)
  if (!row || row._removed) return draft
  const key = groupKeyOfRow(row)
  const ids = groupOrder(rows, key)
  const i = ids.indexOf(rowId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= ids.length) return draft
  ;[ids[i], ids[j]] = [ids[j], ids[i]]
  return normalizeOrders({ ...draft, orders: { ...ordersOf(draft), [key]: ids } }, baseline)
}

export function revertGroupOrder(draft, groupKey) {
  const orders = { ...ordersOf(draft) }
  delete orders[groupKey]
  return { ...draft, orders }
}

// 놓을 자리 해석 — 화면의 파란 선과 실제 놓기가 같은 규칙을 쓴다.
// 같은 (권, 부, 시대) 묶음의 줄이면 그 줄 앞·뒤, 아니면 그 묶음 마지막 줄 뒤, 묶음이 비면 anchor 없음. 자기 자신 위면 null.
export function resolveAnchor({ rows, era, selfId = null, over }) {
  if (!over) return null
  if (over.anchorId && over.anchorId === selfId) return null
  const key = groupKeyOf(over.volumeId, over.partId, era)
  const anchor = over.anchorId ? rows.find(r => r.id === over.anchorId) : null
  if (anchor && !anchor._removed && groupKeyOfRow(anchor) === key) {
    return { anchorId: anchor.id, position: over.position === 'before' ? 'before' : 'after' }
  }
  const ids = groupOrder(rows, key).filter(id => id !== selfId)
  return { anchorId: ids.length ? ids[ids.length - 1] : null, position: 'after' }
}
```

5) `resolveDrop`을 아래로 바꾼다:

```js
// 끌어다 놓기 결과. 놓을 수 없으면 draft는 그대로 두고 error 문구를 돌려준다.
// over: { volumeId, partId, anchorId?, position? } — 줄 위에 놓으면 anchorId·position이 온다 (compare-order)
export function resolveDrop({ draft, baseline, active, over, volumeNumberOf, newTempId }) {
  if (!active || !over) return { draft, error: null }
  const rows = effectiveRows(baseline, draft)
  if (active.type === 'row') {
    const row = rows.find(r => r.id === active.rowId)
    if (!row || row._removed || over.anchorId === row.id) return { draft, error: null }
    let next = draft
    if (!(row.volume_id === over.volumeId && samePart(row.part_id, over.partId))) {
      const check = canPlace(rows, { workId: row.work_id, key: row._key, selfId: row.id }, over.volumeId)
      if (!check.ok) return { draft, error: placeErrorText(check.reason, volumeNumberOf(over.volumeId)) }
      next = moveRow(draft, baseline, row.id, over.volumeId, over.partId)
    }
    const at = resolveAnchor({ rows: effectiveRows(baseline, next), era: eraKeyOf(row), selfId: row.id, over })
    return { draft: placeInGroup(next, baseline, row.id, at || {}), error: null }
  }
  if (active.type === 'sheet') {
    const check = canPlace(rows, { workId: active.workId, key: active.key }, over.volumeId)
    if (!check.ok) return { draft, error: placeErrorText(check.reason, volumeNumberOf(over.volumeId)) }
    const tempId = newTempId()
    const next = addWork(draft, {
      tempId, workId: active.workId, key: active.key, work: active.work,
      curricula: active.curricula, volumeId: over.volumeId, partId: over.partId,
    })
    if (!over.anchorId) return { draft: next, error: null }
    const era = eraOf(active.work?.['장르']) || '기타'
    const at = resolveAnchor({ rows: effectiveRows(baseline, next), era, selfId: tempId, over })
    return { draft: placeInGroup(next, baseline, tempId, at || {}), error: null }
  }
  return { draft, error: null }
}
```

6) `describeDraft`의 `return items` 바로 위에 추가:

```js
  for (const key of Object.keys(ordersOf(draft))) {
    const [volumeId, partKey, era] = key.split('|')
    items.push({ kind: 'order', rowId: key, title: null, to: `${place(volumeId, partKey === 'none' ? null : partKey)} ${era}` })
  }
```

- [ ] **Step 4: 통과 확인 (저장·화면 테스트 회귀 포함)**

Run: `npx vitest run src/tests/compareEdit.test.js src/tests/compareSave.test.js src/tests/ComparePageEdit.test.jsx src/tests/ComparePage.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/compareEdit.js src/tests/compareEdit.test.js
git commit -m "feat: 권별 비교 편집 상태에 묶음 안 순서(끼워 넣기·위아래·되돌리기·놓을 자리 해석)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 저장에 순서 반영 (`compareSave.js`)

**Files:**
- Modify: `src/board/compareSave.js`
- Test: `src/tests/compareSave.test.js`

**Interfaces:**
- Consumes: Task 1 `assignSortOrders`, `groupKeyOfRow`; Task 2 `moveInGroup`, `placeInGroup`, `moveRow`, `EMPTY_DRAFT`
- Produces:
  - `planSave(...)` 결과에 `reorders: [{ groupKey, ops: [{ id, title, sortOrder }] }]` 추가. moves·adds의 `sortOrder`는 배정 규칙 결과
  - `runSave(...)` 결과에 `reordered`(op가 모두 성공한 묶음 수) 추가, 실행 순서 빼기 → 옮기기 → 넣기 → 순서
  - `resultSummary({ moved, added, removed, reordered })` → `반영했습니다: 옮기기 n · 넣기 n · 빼기 n · 순서 n`

- [ ] **Step 1: 테스트 고치기·추가** — `src/tests/compareSave.test.js`

import를:

```js
import { vi } from 'vitest'
import { planSave, runSave, countAttachments, attachmentText, resultSummary } from '../board/compareSave.js'
import { EMPTY_DRAFT, moveRow, removeRow, addWork, moveInGroup, placeInGroup } from '../board/compareEdit.js'
```

기존 runSave 첫 테스트의 `expect(result).toEqual({ removed: 2, moved: 1, added: 1, skipped: [], failed: [] })`를:

```js
    expect(result).toEqual({ removed: 2, moved: 1, added: 1, reordered: 0, skipped: [], failed: [] })
```

기존 `resultSummary` 테스트의 기대값을:

```js
  expect(resultSummary({ moved: 7, added: 3, removed: 2 })).toBe('반영했습니다: 옮기기 7 · 넣기 3 · 빼기 2 · 순서 0')
  expect(resultSummary({ moved: 0, added: 0, removed: 0, reordered: 2 })).toBe('반영했습니다: 옮기기 0 · 넣기 0 · 빼기 0 · 순서 2')
```

파일 끝에 추가:

```js
describe('순서 바꾸기 저장', () => {
  const R = (id, part_id, sort_order, genre) => ({
    id, volume_id: 'v1', work_id: `W${id}`, part_id, sort_order, selection_status: 'candidate',
    work_snapshot: { title: `작품${id}`, genre },
  })
  // 1권 2부: 현대 a(10) · 고전 g(20) · 현대 b(30) / 1권 1부: 현대 z(40)
  const B = [R('a', 'p2', 10, '소설'), R('g', 'p2', 20, '고전소설'), R('b', 'p2', 30, '소설'), R('z', 'p1', 40, '시')]
  const P = [{ id: 'p1', volume_id: 'v1' }, { id: 'p2', volume_id: 'v1' }]

  test('같은 묶음 순서만 바꾸면 번호가 달라지는 행만 고친다', () => {
    const draft = moveInGroup(EMPTY_DRAFT, B, 'b', -1)
    const plan = planSave({ draft, baseline: B, latestRows: B, latestParts: P })
    expect(plan.moves).toEqual([])
    expect(plan.reorders).toEqual([{
      groupKey: 'v1|p2|현대',
      ops: [{ id: 'b', title: '작품b', sortOrder: 10 }, { id: 'a', title: '작품a', sortOrder: 30 }],
    }])
  })

  test('다른 부에서 옮겨 와 끼워 넣으면 옮기는 행이 그 자리 번호를, 뒤 행이 권 맨 뒤 번호를 받는다', () => {
    const draft = placeInGroup(moveRow(EMPTY_DRAFT, B, 'z', 'v1', 'p2'), B, 'z', { anchorId: 'a', position: 'after' })
    const plan = planSave({ draft, baseline: B, latestRows: B, latestParts: P })
    expect(plan.moves).toEqual([{ id: 'z', title: '작품z', volumeId: 'v1', partId: 'p2', sortOrder: 30 }])
    expect(plan.reorders).toEqual([{ groupKey: 'v1|p2|현대', ops: [{ id: 'b', title: '작품b', sortOrder: 50 }] }])
  })

  test('그사이 다른 분이 그 묶음에 넣은 작품은 뒤에 붙는다', () => {
    const draft = moveInGroup(EMPTY_DRAFT, B, 'b', -1)
    const latest = [...B, R('n', 'p2', 60, '소설')]
    const plan = planSave({ draft, baseline: B, latestRows: latest, latestParts: P })
    expect(plan.reorders[0].ops).toEqual([{ id: 'b', title: '작품b', sortOrder: 10 }, { id: 'a', title: '작품a', sortOrder: 30 }])
  })

  test('runSave: 옮기기 뒤에 순서를 고치고, op가 모두 성공한 묶음(op 없는 묶음 포함)을 센다', async () => {
    const calls = []
    const api = {
      deleteVolumeWork: vi.fn(), ensureWorkId: vi.fn(), insertPlacedWork: vi.fn(),
      updateVolumeWork: vi.fn(async (id, patch) => { calls.push([id, patch]); return {} }),
    }
    const plan = {
      removes: [], adds: [], skipped: [], alreadyRemoved: 0,
      moves: [{ id: 'z', title: 'Z', volumeId: 'v1', partId: 'p2', sortOrder: 30 }],
      reorders: [{ groupKey: 'v1|p2|현대', ops: [{ id: 'b', title: 'B', sortOrder: 50 }] }, { groupKey: 'v1|p1|현대', ops: [] }],
    }
    const result = await runSave(plan, api, { registryMap: new Map() })
    expect(calls.map(c => c[0])).toEqual(['z', 'b'])
    expect(calls[1][1]).toEqual({ sort_order: 50 })
    expect(result.reordered).toBe(2)
  })

  test('runSave: 순서 op가 하나라도 실패하면 그 묶음은 세지 않고 실패 목록에 남긴다', async () => {
    const api = {
      deleteVolumeWork: vi.fn(), ensureWorkId: vi.fn(), insertPlacedWork: vi.fn(),
      updateVolumeWork: vi.fn(async id => { if (id === 'b') throw new Error('network down'); return {} }),
    }
    const plan = {
      removes: [], moves: [], adds: [], skipped: [], alreadyRemoved: 0,
      reorders: [{ groupKey: 'v1|p2|현대', ops: [{ id: 'a', title: 'A', sortOrder: 30 }, { id: 'b', title: 'B', sortOrder: 10 }] }],
    }
    const result = await runSave(plan, api, { registryMap: new Map() })
    expect(result.reordered).toBe(0)
    expect(result.failed).toEqual([{ title: 'B', reason: 'network down' }])
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/tests/compareSave.test.js`
Expected: FAIL — `reorders`/`reordered` 관련 새 테스트와 바꾼 기대값 실패

- [ ] **Step 3: 구현** — `src/board/compareSave.js`

1) import에 추가:

```js
import { assignSortOrders, groupKeyOfRow } from './compareOrder.js'
```

2) `planSave`에서 `const nextOrder = new Map()`부터 `return { removes, moves, adds, skipped, alreadyRemoved }`까지를 아래로 바꾼다(위쪽의 빼기·옮기기 후보·자리 판정 코드는 그대로):

```js
  // 같은 작품 자리 판정 — 받아들인 옮기기·넣기만 남긴다
  const accepted = []
  for (const c of candidates) {
    const s = slot(c.volumeId, c.workId)
    if (occupied.has(s)) {
      skipped.push({ title: c.title, reason: TAKEN })
      occupied.add(slot(c.from, c.workId)) // 못 옮긴 행은 제자리에 남는다
      continue
    }
    occupied.add(s)
    accepted.push(c)
  }
  const acceptedAdds = []
  for (const a of draft.adds) {
    const title = a.snapshot?.title
    if (!partOk(a.volumeId, a.partId)) {
      skipped.push({ title, reason: PART_GONE })
      continue
    }
    if (a.workId) {
      const s = slot(a.volumeId, a.workId)
      if (occupied.has(s)) {
        skipped.push({ title, reason: TAKEN })
        continue
      }
      occupied.add(s)
    }
    acceptedAdds.push(a)
  }

  // 순서 번호 (설계 compare-order §2·§4): 저장 뒤 남는 행(home) + 옮겨 오는 행 + 넣는 행으로 배정한다.
  // 그사이 다른 분이 넣은 작품은 순서 목록에 없으므로 묶음 뒤에 붙고, 그사이 빠진 작품은 무시된다.
  const movingIds = new Set(accepted.map(c => c.id))
  const live = [
    ...latestRows.filter(r => !removing.has(r.id) && !movingIds.has(r.id)).map(r => ({ ...r, home: true })),
    ...accepted.map(c => ({ ...latestById.get(c.id), volume_id: c.volumeId, part_id: c.partId, home: false })),
    ...acceptedAdds.map(a => ({ id: a.tempId, volume_id: a.volumeId, part_id: a.partId, sort_order: null, work_snapshot: a.snapshot, home: false })),
  ]
  const orders = draft.orders || {}
  const freshStart = volumeId => nextSortOrder(latestRows.filter(r => r.volume_id === volumeId && !removing.has(r.id)))
  const assigned = assignSortOrders(live, { orders, freshStart })

  const moves = accepted.map(c => ({ id: c.id, title: c.title, volumeId: c.volumeId, partId: c.partId, sortOrder: assigned.get(c.id) }))
  const adds = acceptedAdds.map(a => ({ ...a, title: a.snapshot?.title, sortOrder: assigned.get(a.tempId) }))
  // 순서를 바꾼 묶음에서 남는 행 중 번호가 달라지는 행만 고친다
  const reorders = Object.keys(orders).map(groupKey => ({
    groupKey,
    ops: live
      .filter(r => r.home && groupKeyOfRow(r) === groupKey && assigned.get(r.id) !== r.sort_order)
      .sort((a, b) => assigned.get(a.id) - assigned.get(b.id))
      .map(r => ({ id: r.id, title: r.work_snapshot?.title, sortOrder: assigned.get(r.id) })),
  }))

  return { removes, moves, adds, reorders, skipped, alreadyRemoved }
}
```

3) `runSave`: 결과 초기값에 `reordered: 0`을 넣고(`const result = { removed: plan.alreadyRemoved, moved: 0, added: 0, reordered: 0, skipped: [...plan.skipped], failed: [] }`), 넣기 반복문 뒤·`return result` 앞에 추가:

```js
  // 순서 바꾸기: 한 묶음의 op가 모두 성공하면 1건 (설계 compare-order §4)
  for (const g of plan.reorders || []) {
    let ok = true
    for (const op of g.ops) {
      try {
        await api.updateVolumeWork(op.id, { sort_order: op.sortOrder })
      } catch (err) {
        ok = false
        result.failed.push({ title: op.title, reason: err.message })
      }
    }
    if (ok) result.reordered++
  }
```

4) `resultSummary`를:

```js
export function resultSummary({ moved, added, removed, reordered = 0 }) {
  return `반영했습니다: 옮기기 ${moved} · 넣기 ${added} · 빼기 ${removed} · 순서 ${reordered}`
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/tests/compareSave.test.js src/tests/compareEdit.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/compareSave.js src/tests/compareSave.test.js
git commit -m "feat: 권별 비교 저장에 묶음 순서 반영(끼워 넣은 자리 번호, 순서 바꾸기 실행·집계)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 줄도 놓을 곳으로 — 충돌 판정과 파란 선 (`CompareDnd.jsx`, `CompareWorkRow.jsx`)

**Files:**
- Modify: `src/board/CompareDnd.jsx`, `src/board/CompareWorkRow.jsx`
- Test: `src/tests/CompareDnd.test.js` (끝에 추가)

**Interfaces:**
- Produces:
  - `visiblePointerWithin` — 결과 중 줄(`c.data.current.anchorId`가 있는 놓을 곳)을 부보다 먼저, 줄이면 collision data에 `position: 'before'|'after'`(포인터 y < 줄 가운데 → before). 부 결과의 data는 지금처럼 `{ droppableContainer, value: 0 }`.
  - `DraggableWorkRow` — 같은 노드에 `useDroppable({ id: 'row-drop:'+row.id, data: { volumeId: row.volume_id, partId: row.part_id ?? null, anchorId: row.id } })`
  - `CompareWorkRow` 새 prop `insertHint: 'before'|'after'|null` — 줄 위/아래 파란 2px 선(레이아웃이 밀리지 않게 inset box-shadow)

- [ ] **Step 1: 실패하는 테스트** — `src/tests/CompareDnd.test.js`의 `describe('visiblePointerWithin', ...)` 안 끝에 추가

```js
  test('줄(anchorId가 있는 놓을 곳)은 부보다 먼저, 포인터가 줄 가운데보다 위면 before·아래면 after', () => {
    const clip = stub(mount(root, 'data-drop-clip'), [0, 0, 300, 500])
    const zone = stub(mount(clip), [0, 0, 300, 200])
    const rowEl = stub(mount(zone), [0, 40, 300, 60])
    const cz = container('drop:1:p2', zone)
    const cr = { ...container('row-drop:a', rowEl), data: { current: { anchorId: 'a' } } }
    const up = visiblePointerWithin({ pointerCoordinates: { x: 10, y: 45 }, droppableContainers: [cz, cr] })
    expect(up.map(c => c.id)).toEqual(['row-drop:a', 'drop:1:p2'])
    expect(up[0].data).toEqual({ droppableContainer: cr, value: 0, position: 'before' })
    expect(up[1].data).toEqual({ droppableContainer: cz, value: 0 })
    const down = visiblePointerWithin({ pointerCoordinates: { x: 10, y: 55 }, droppableContainers: [cz, cr] })
    expect(down[0].data.position).toBe('after')
  })
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/tests/CompareDnd.test.js`
Expected: FAIL — 순서가 `['drop:1:p2', 'row-drop:a']`이고 position 없음

- [ ] **Step 3: 구현 — `CompareDnd.jsx`**

1) import를 `import { useCallback } from 'react'`와 함께:

```js
import { useCallback } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import CompareWorkRow from './CompareWorkRow.jsx'
```

2) `DraggableWorkRow`를:

```js
// 줄은 끌 수 있고, 다른 줄을 이 줄 위·아래에 끼워 넣는 놓을 곳이기도 하다 (compare-order)
export function DraggableWorkRow({ row, ...rest }) {
  const title = row.work_snapshot?.title
  const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({
    id: `row:${row.id}`,
    data: { type: 'row', rowId: row.id, title },
  })
  const { setNodeRef: setDropRef } = useDroppable({
    id: `row-drop:${row.id}`,
    data: { volumeId: row.volume_id, partId: row.part_id ?? null, anchorId: row.id },
  })
  const ref = useCallback(node => {
    setDragRef(node)
    setDropRef(node)
  }, [setDragRef, setDropRef])
  return (
    <CompareWorkRow ref={ref} row={row} dragging={isDragging}
      leading={<Handle label={`「${title}」 끌기`} listeners={listeners} attributes={attributes} />} {...rest} />
  )
}
```

3) `visiblePointerWithin`을 아래로 바꾸고 위 주석에 한 줄 추가:

```js
// 2026-10-02 compare-order: 줄도 놓을 곳이다 — 줄을 부보다 먼저 돌려주고, 포인터가 줄 가운데보다 위면 before, 아니면 after.
const hits = (r, { x, y }) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom

export function visiblePointerWithin({ pointerCoordinates, droppableContainers }) {
  if (!pointerCoordinates) return []
  const out = []
  for (const c of droppableContainers) {
    const node = c.node.current
    if (!node) continue
    const r = node.getBoundingClientRect()
    if (!hits(r, pointerCoordinates)) continue
    const clip = node.closest('[data-drop-clip]')
    if (clip && !hits(clip.getBoundingClientRect(), pointerCoordinates)) continue
    const data = { droppableContainer: c, value: 0 }
    if (c.data?.current?.anchorId) data.position = pointerCoordinates.y < (r.top + r.bottom) / 2 ? 'before' : 'after'
    out.push({ id: c.id, data })
  }
  const isRow = hit => (hit.data.position ? 1 : 0)
  return out.sort((a, b) => isRow(b) - isRow(a))
}
```

- [ ] **Step 4: 구현 — `CompareWorkRow.jsx`**

시그니처에 `insertHint = null`을 더하고 `cls` 배열에 한 줄 추가:

```jsx
export default function CompareWorkRow({
  row, others = [], warnings = [], fromLabel = null, leading = null, trailing = null, dragging = false,
  insertHint = null, ref,
}) {
```

```js
    // 끌기 중 '들어갈 자리' 선 — 테두리 대신 그림자라 줄 높이가 흔들리지 않는다 (compare-order)
    insertHint === 'before' ? 'shadow-[inset_0_2px_0_0_#2563eb]' : '',
    insertHint === 'after' ? 'shadow-[inset_0_-2px_0_0_#2563eb]' : '',
```

(`dragging ? 'opacity-40' : '',` 다음 줄에 넣는다.)

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/tests/CompareDnd.test.js src/tests/ComparePageEdit.test.jsx src/tests/ComparePage.test.jsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/board/CompareDnd.jsx src/board/CompareWorkRow.jsx src/tests/CompareDnd.test.js
git commit -m "feat: 권별 비교 줄도 놓을 곳으로(줄 우선 판정·앞뒤 위치), 들어갈 자리 선

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 화면 연결 — 메뉴 위아래·되돌리기, 끌기 중 선, 저장 창 (`ComparePage.jsx` 외)

**Files:**
- Modify: `src/board/ComparePage.jsx`, `src/board/CompareMoveMenu.jsx`, `src/board/CompareSaveDialog.jsx`
- Test: `src/tests/ComparePageEdit.test.jsx`

**Interfaces:**
- Consumes: Task 2 `groupOrder`, `moveInGroup`, `revertGroupOrder`, `resolveAnchor`, `removeRow(d, id, baseline)`, `revertRow(d, id, baseline)`; Task 1 `groupKeyOfRow`, `eraKeyOf`; Task 4 `insertHint`
- Produces: `CompareMoveMenu` 새 prop `order = null | { onUp: fn|null, onDown: fn|null, onRevert: fn|null }` (메뉴 맨 위 줄 '위로'·'아래로'(null이면 비활성)·'이 묶음 순서 되돌리기'(onRevert 있을 때만))

- [ ] **Step 1: 테스트 고치기·추가** — `src/tests/ComparePageEdit.test.jsx`

기존 기대 문자열 4곳을 바꾼다:
- `'옮기기 1 · 넣기 0 · 빼기 1'` → `'옮기기 1 · 넣기 0 · 빼기 1 · 순서 0'`
- `'반영했습니다: 옮기기 1 · 넣기 0 · 빼기 1'` → `'반영했습니다: 옮기기 1 · 넣기 0 · 빼기 1 · 순서 0'`
- `'반영했습니다: 옮기기 0 · 넣기 0 · 빼기 1'` → `'반영했습니다: 옮기기 0 · 넣기 0 · 빼기 1 · 순서 0'`
- `'반영했습니다: 옮기기 0 · 넣기 1 · 빼기 0'` → `'반영했습니다: 옮기기 0 · 넣기 1 · 빼기 0 · 순서 0'`

파일 끝에 추가:

```jsx
test('메뉴의 위로·아래로로 같은 묶음 순서를 바꾸고, 되돌리기·저장이 된다', async () => {
  // 1권 2부 현대: 소나기 a(10) · 운수 좋은 날 e(30)
  const E = { id: 'e', volume_id: 'v1', work_id: 'W5', part_id: 'p2', sort_order: 30, selection_status: 'candidate', work_snapshot: snap('운수 좋은 날', '현진건', '소설', ['2차']) }
  api.listAllVolumeWorks.mockResolvedValue([...VW, E])
  renderPage()
  await startEdit()
  const titles = () => within(region('1권 첫 장면')).getAllByRole('listitem')
    .map(li => li.querySelector('span[title]')?.getAttribute('title')?.split(' ')[0]).filter(Boolean)

  let dlg = await openMenu('1권 첫 장면', '운수 좋은 날')
  expect(within(dlg).getByRole('button', { name: '아래로' })).toBeDisabled()
  await userEvent.click(within(dlg).getByRole('button', { name: '위로' }))
  expect(titles().indexOf('운수')).toBeLessThan(titles().indexOf('소나기'))
  expect(screen.getByText('편집 중 · 바뀐 작품 1건')).toBeInTheDocument()

  dlg = await openMenu('1권 첫 장면', '운수 좋은 날')
  await userEvent.click(within(dlg).getByRole('button', { name: '이 묶음 순서 되돌리기' }))
  expect(screen.getByText('편집 중 · 바뀐 작품 0건')).toBeInTheDocument()

  dlg = await openMenu('1권 첫 장면', '운수 좋은 날')
  await userEvent.click(within(dlg).getByRole('button', { name: '위로' }))
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  const confirmBox = await screen.findByRole('dialog', { name: '저장 확인' })
  expect(within(confirmBox).getByText('옮기기 0 · 넣기 0 · 빼기 0 · 순서 1')).toBeInTheDocument()
  expect(within(confirmBox).getByText('1권 2부 현대 — 순서 변경')).toBeInTheDocument()
  await clickSaveIn(confirmBox)
  expect(await screen.findByText('반영했습니다: 옮기기 0 · 넣기 0 · 빼기 0 · 순서 1')).toBeInTheDocument()
  expect(api.updateVolumeWork).toHaveBeenCalledWith('e', { sort_order: 10 })
  expect(api.updateVolumeWork).toHaveBeenCalledWith('a', { sort_order: 30 })
})

test('검색 패널의 넣기 메뉴에는 위로·아래로가 없다', async () => {
  renderPage()
  await startEdit()
  await userEvent.click(screen.getByRole('button', { name: '작품 넣기' }))
  const panel = await screen.findByRole('complementary', { name: '작품 넣기 패널' })
  await userEvent.click(await within(panel).findByRole('button', { name: '「돌다리」 넣기' }))
  const dlg = screen.getByRole('dialog', { name: '「돌다리」 넣기' })
  expect(within(dlg).queryByRole('button', { name: '위로' })).not.toBeInTheDocument()
})
```

(제목 칸의 `title` 속성은 `"제목 작가"` 형식 — 첫 단어로 비교한다: '운수', '소나기'.)

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/tests/ComparePageEdit.test.jsx`
Expected: FAIL — '위로' 버튼 없음, 기대 문자열의 '· 순서 0' 없음

- [ ] **Step 3: 구현 — `CompareMoveMenu.jsx`**

시그니처에 `order = null` 추가:

```jsx
export default function CompareMoveMenu({
  label, triggerText, triggerClass, volumes, partsByVolume, initialVolumeId = '', initialPartFor,
  blockedText, confirmText, onConfirm, onRemove = null, onRevert = null, order = null,
}) {
```

메뉴 상자(`<div ref={boxRef} role="dialog" ...>`) 바로 안 첫 자식으로 추가:

```jsx
          {order && (
            <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-2">
              <button type="button" disabled={!order.onUp} onClick={() => act(order.onUp)}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 disabled:opacity-40">위로</button>
              <button type="button" disabled={!order.onDown} onClick={() => act(order.onDown)}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 disabled:opacity-40">아래로</button>
              {order.onRevert && (
                <button type="button" onClick={() => act(order.onRevert)}
                  className="ml-auto text-xs text-gray-500 hover:underline">이 묶음 순서 되돌리기</button>
              )}
            </div>
          )}
```

- [ ] **Step 4: 구현 — `CompareSaveDialog.jsx`**

`lineOf`를:

```js
function lineOf(i) {
  if (i.kind === 'move') return `〈${i.title}〉 ${i.from} → ${i.to}`
  if (i.kind === 'add') return `〈${i.title}〉 → ${i.to} (새로)`
  if (i.kind === 'order') return `${i.to} — 순서 변경`
  return `〈${i.title}〉 ${i.from}에서 빼기`
}
```

요약 줄을:

```jsx
        <p className="mb-3 text-sm text-gray-600">옮기기 {count('move')} · 넣기 {count('add')} · 빼기 {count('remove')} · 순서 {count('order')}</p>
```

- [ ] **Step 5: 구현 — `ComparePage.jsx`**

1) import 바꾸기·추가:

```jsx
import { eraSummary, eraOf } from './genreUtils.js'
```

```jsx
import {
  EMPTY_DRAFT, changeCount, effectiveRows, moveRow, removeRow, revertRow, addWork,
  canPlace, placeErrorText, defaultPartFor, describeDraft, resolveDrop, toDropActive,
  groupOrder, moveInGroup, revertGroupOrder, resolveAnchor,
} from './compareEdit.js'
import { groupKeyOfRow, eraKeyOf } from './compareOrder.js'
```

2) state 추가(`overVolumeId` 아래): `const [dropHint, setDropHint] = useState(null)`

3) `handleDragOver`·`handleDragEnd`·`handleDragCancel`을 아래로 바꾼다:

```jsx
  // 끌고 있는 작품의 시대 — 같은 시대 묶음 안에만 끼워 넣는다 (A안)
  function dragEra(d) {
    if (d.type === 'row') return eraKeyOf(rows.find(r => r.id === d.rowId) || {})
    return eraOf(d.work?.['장르']) || '기타'
  }
  // 끌기 중: 놓을 수 없는 권 표시 + '들어갈 자리' 선 (실제 놓기와 같은 resolveAnchor 규칙)
  function handleDragHover({ over, collisions }) {
    const target = over?.data.current
    setOverVolumeId(target?.volumeId ?? null)
    if (!target || !dragging || (dragRef && blockedFor(dragRef, target.volumeId))) {
      setDropHint(null)
      return
    }
    const next = resolveAnchor({
      rows, era: dragEra(dragging), selfId: dragging.type === 'row' ? dragging.rowId : null,
      over: { ...target, position: collisions?.[0]?.data?.position },
    })
    setDropHint(h => (h?.anchorId === next?.anchorId && h?.position === next?.position ? h : next))
  }
  function handleDragEnd({ active, over, collisions }) {
    setDragging(null)
    setOverVolumeId(null)
    setDropHint(null)
    const data = active?.data.current
    const target = over?.data.current
    if (!data || !target) return
    const { draft: next, error } = resolveDrop({
      draft, baseline, active: toDropActive(data, lookup.registryMap),
      over: { ...target, position: collisions?.[0]?.data?.position },
      volumeNumberOf: id => numberById[id], newTempId,
    })
    if (error) show(error)
    else setDraft(next)
  }
  function handleDragCancel() {
    setDragging(null)
    setOverVolumeId(null)
    setDropHint(null)
  }
```

4) `rowTrailing`: 뺀 줄의 되돌리기를 `setDraft(d => revertRow(d, row.id, baseline))`로, 메뉴의 `onRemove`를 `() => setDraft(d => removeRow(d, row.id, baseline))`로, `onRevert`를 `row._moved || row._added ? () => setDraft(d => revertRow(d, row.id, baseline)) : null`로 바꾸고, `const title = ...` 아래에 추가해 메뉴에 `order`를 넘긴다:

```jsx
    const key = groupKeyOfRow(row)
    const ids = groupOrder(rows, key)
    const i = ids.indexOf(row.id)
```

```jsx
        order={{
          onUp: i > 0 ? () => setDraft(d => moveInGroup(d, baseline, row.id, -1)) : null,
          onDown: i >= 0 && i < ids.length - 1 ? () => setDraft(d => moveInGroup(d, baseline, row.id, 1)) : null,
          onRevert: draft.orders?.[key] ? () => setDraft(d => revertGroupOrder(d, key)) : null,
        }}
```

5) `DndContext`의 `onDragOver={handleDragOver}`를 `onDragOver={handleDragHover} onDragMove={handleDragHover}`로 바꾼다.

6) 줄 렌더의 `rowProps`에 `insertHint: dropHint?.anchorId === w.id ? dropHint.position : null`을 더한다.

- [ ] **Step 6: 통과 확인 + 전체**

Run: `npx vitest run src/tests/ComparePageEdit.test.jsx src/tests/ComparePage.test.jsx`
Expected: PASS
Run: `npx vitest run` → 모두 PASS, `npm run build` → 성공

- [ ] **Step 7: Commit**

```bash
git add src/board/ComparePage.jsx src/board/CompareMoveMenu.jsx src/board/CompareSaveDialog.jsx src/tests/ComparePageEdit.test.jsx
git commit -m "feat: 권별 비교 메뉴 위로·아래로·묶음 순서 되돌리기, 끌기 중 들어갈 자리 선, 저장 창 순서 표시

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 실제 브라우저 확인·병합·배포 (controller)

- [ ] 전체 테스트·빌드.
- [ ] 운영 데이터 사본 미리보기(지난번 방식: 루트 `compare-preview.html` + `src/compare-preview.jsx`, fetch 가로채기, 쓰기는 `window.__previewWrites`) — 1366×800에서: 같은 묶음 안 끌기(파란 선 위치·결과 순서), 다른 권 줄 사이 끼워 넣기, 다른 시대 줄 위 → 묶음 끝, ⋯ 위로·아래로, 저장 요청 본문(sort_order). 확인 후 임시 파일 삭제.
- [ ] 사용자 승인 후 master 병합(`--no-ff`)·테스트·push·배포 확인.
