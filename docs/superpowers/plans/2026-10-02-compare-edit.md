# 권별 비교 편집(넣기·빼기·옮기기) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 권별 비교(`/compare`)에 편집 모드를 넣어, 작품을 끌어다 놓기·메뉴로 옮기고, 검색 패널에서 넣고, 권에서 빼며, 저장하면 `volume_works`에 한 건씩 반영한다(권 보드에 그대로 보임).

**Architecture:** 편집 내용은 순수 모듈 `compareEdit.js`의 draft(옮기기·빼기·넣기)로만 들고 있다가, 저장 때 `compareSave.js`가 최신 상태를 다시 읽어 실행 목록을 세우고(`planSave`) 한 건씩 반영한다(`runSave`). 화면은 `ComparePage`가 조립하고, 작품 줄·메뉴·저장 창·검색 패널·끌기 부품은 파일을 나눈다. 나가기 방지를 위해 앱 라우터를 데이터 라우터로 바꾼다.

**Tech Stack:** React 19, react-router-dom 7(`createHashRouter`·`useBlocker`), Tailwind v4(컨테이너 쿼리), Supabase JS, `@dnd-kit/core` 6.3, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-02-compare-edit-design.md`

## Global Constraints

- DB 스키마·SQL 변경 없음. 기존 `volumeApi.js` 함수만 쓴다(`updateVolumeWork`·`deleteVolumeWork`·`ensureWorkId`·`insertPlacedWork`·`listAttachmentRefs`·`listRegistry`·`listPicks`·`listAllVolumeWorks`·`listAllParts`·`listVolumes`).
- 옮기기 = 행 update(`volume_id`·`part_id`·`sort_order`), 빼기 = 행 delete, 넣기 = insert(`placement_batch_id` null).
- 반영 순서: 빼기 → 옮기기 → 넣기. 옮기기 `23505`는 1회 재시도.
- 경고 3종(수록 이력 없음·부 확인·작가 3편)은 보기 모드에도 표시. 작가 경고 기준 3편 이상, `isKnownAuthor`로 미상 제외.
- 부 기본값은 `partNumberFor(bucketOf(genre), genre)` (자동 배치와 같은 규칙).
- 화면 문구는 설계 문서 그대로: "이미 N권에 있는 작품입니다", "N권에 제외 상태로 있습니다. 권 보드에서 지운 뒤 옮겨 주세요", "저장하지 않은 변경 N건이 있습니다. 나가면 사라집니다.", "그사이 다른 분이 옮기거나 뺐습니다", "그사이 같은 작품이 들어왔습니다", "옮길 부가 삭제되었습니다".
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 테스트 명령: `npx vitest run <파일>` (작업 디렉터리 `series-dashboard`). 시작 기준 217건 통과.
- 브랜치 `compare-edit`(master에서).

## 파일 구조

| 파일 | 상태 | 책임 |
|---|---|---|
| `src/App.jsx` | 수정 | `HashRouter` → `createHashRouter` + `RouterProvider` |
| `src/board/compareEdit.js` | 신규 | draft 순수 함수: 옮기기·빼기·넣기·되돌리기, 편집 반영 행, 같은 작품 판정, 부 기본값, 끌어 놓기 해석, 확인 창 목록 |
| `src/board/compareSave.js` | 신규 | `planSave`·`runSave`·딸린 자료 안내·결과 문구 |
| `src/board/compareUtils.js` | 수정 | 뺀 행 편수 제외, `compareWarnings`·`WARNING_LABELS`·`expectedPartOf` |
| `src/board/homeUtils.js`, `src/pages/HomePage.jsx` | 수정 | 권 옮기기 문구, 종류 단위 묶기 |
| `src/board/useWorkLookup.js` | 신규 | registry·picks 지연 로드 훅 + `buildPickKeys`·`buildDuplicatesByKey` |
| `src/board/SearchPane.jsx` | 수정 | `defaultOnlyUnplaced`·`renderAction`·`itemComponent` |
| `src/board/CompareWorkRow.jsx` | 신규 | 작품 한 줄(경고·바뀐 표시 포함) |
| `src/board/CompareMoveMenu.jsx` | 신규 | 권·부 고르는 떠 있는 메뉴(옮기기·넣기·빼기·되돌리기) |
| `src/board/CompareSaveDialog.jsx` | 신규 | 저장 확인 창 |
| `src/board/CompareSearchPanel.jsx` | 신규 | 오른쪽 '작품 넣기' 패널 |
| `src/board/CompareDnd.jsx` | 신규 | 끌기 손잡이 줄·끌 수 있는 검색 결과·놓을 곳 |
| `src/board/ComparePage.jsx` | 수정 | 조립(보기/편집, 저장 흐름, 패널, 끌어 놓기, 나가기 방지) |

---

### Task 1: 데이터 라우터로 전환

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/tests/ComparePage.test.jsx:1-31` (렌더 도우미)

**Interfaces:**
- Produces: 앱 전체가 데이터 라우터 안에서 렌더됨 → 이후 `ComparePage`에서 `useBlocker` 사용 가능. 테스트에서 `ComparePage`는 `createMemoryRouter` + `RouterProvider`로 렌더.

- [ ] **Step 1: 브랜치 만들기**

```bash
cd "D:/교과서 문학 단행본 시리즈/series-dashboard"
git checkout -b compare-edit
```

- [ ] **Step 2: `src/App.jsx`를 데이터 라우터로 바꾼다**

`import { HashRouter, Routes, Route } from 'react-router-dom'`를 `import { createHashRouter, RouterProvider } from 'react-router-dom'`로 바꾸고, `AuthCallback` 함수 아래·`App` 위에 라우터를 만들고, `App`의 본문을 바꾼다:

```jsx
// 2026-10-02: 권별 비교 편집 중 나가기 방지(useBlocker)에 데이터 라우터가 필요해 HashRouter에서 전환.
// 경로·인증 감싸기·캐치올(AuthCallback) 동작은 그대로.
const router = createHashRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: (
      <RequireAuth>
        <AppLayout />
      </RequireAuth>
    ),
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/picks', element: <GenrePicksPage /> },
      { path: '/volumes', element: <VolumesPage /> },
      { path: '/volumes/:id', element: <VolumeBoardPage /> },
      { path: '/compare', element: <ComparePage /> },
      { path: '/auto-place', element: <AutoPlacePage /> },
      { path: '/schedule', element: <SchedulePage /> },
      { path: '/library', element: <LibraryPage /> },
    ],
  },
  { path: '*', element: <AuthCallback /> },
])

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  )
}
```

- [ ] **Step 3: `ComparePage.test.jsx` 렌더 도우미를 데이터 라우터로**

`import { HashRouter } from 'react-router-dom'`를 `import { createMemoryRouter, RouterProvider } from 'react-router-dom'`로 바꾸고 `renderPage`를:

```jsx
function renderPage() {
  const router = createMemoryRouter(
    [{ path: '/compare', element: <ComparePage /> }, { path: '/volumes/:id', element: <p>권 보드</p> }],
    { initialEntries: ['/compare'] },
  )
  return render(<ToastProvider><RouterProvider router={router} /></ToastProvider>)
}
```

- [ ] **Step 4: 전체 테스트**

Run: `npx vitest run`
Expected: 217 passed (스모크 테스트 '미로그인 상태에서 로그인 화면이 보인다' 포함)

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 오류 없이 `dist/` 생성

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/tests/ComparePage.test.jsx
git commit -m "refactor: 앱 라우터를 데이터 라우터(createHashRouter)로 전환

권별 비교 편집 중 나가기 방지(useBlocker)를 위한 준비. 경로·동작 동일.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 편집 상태 순수 모듈 `compareEdit.js`

**Files:**
- Create: `src/board/compareEdit.js`
- Test: `src/tests/compareEdit.test.js`

**Interfaces:**
- Consumes: `bucketOf`(genreUtils), `partNumberFor`(placementUtils), `snapshotOf`(works/workKey)
- Produces (모두 named export):
  - `EMPTY_DRAFT` = `{ moves: {}, removes: {}, adds: [] }` — `moves[rowId] = { volumeId, partId }`, `removes[rowId] = true`, `adds[i] = { tempId, workId|null, key, work, curricula, snapshot, volumeId, partId }`
  - `changeCount(draft) → number`
  - `effectiveRows(baseline, draft) → row[]` — 행에 `_moved: { fromVolumeId, fromPartId }` / `_removed: true` / (넣기 행) `id=tempId, _added: true, _key, sort_order=Number.MAX_SAFE_INTEGER, selection_status='candidate'`
  - `moveRow(draft, baseline, rowId, volumeId, partId) → draft`, `removeRow(draft, rowId) → draft`, `revertRow(draft, rowId) → draft`
  - `addWork(draft, { tempId, workId, key, work, curricula, volumeId, partId }) → draft`
  - `canPlace(rows, { workId, key, selfId }, volumeId) → { ok, reason: null|'exists'|'excluded' }`
  - `placeErrorText(reason, volumeNumber) → string`
  - `defaultPartFor(genre, volumeParts) → partId|null`
  - `resolveDrop({ draft, baseline, active, over, volumeNumberOf, newTempId }) → { draft, error }` — `active`: `{ type:'row', rowId }` 또는 `{ type:'sheet', work, key, workId, curricula }`, `over`: `{ volumeId, partId }`
  - `toDropActive(data, registryMap)` — 끌기 데이터(`{ type:'sheet', key, work, getCurricula }`)를 `resolveDrop`용으로 변환, 그 밖은 그대로
  - `describeDraft(draft, baseline, place) → [{ kind:'move'|'add'|'remove', rowId, title, from?, to? }]` (순서: 옮기기 → 넣기 → 빼기)

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/compareEdit.test.js`

```js
import {
  EMPTY_DRAFT, changeCount, effectiveRows, moveRow, removeRow, revertRow, addWork,
  canPlace, placeErrorText, defaultPartFor, resolveDrop, toDropActive, describeDraft,
} from '../board/compareEdit.js'

const row = (id, volume_id, work_id, part_id, extra = {}) => ({
  id, volume_id, work_id, part_id, sort_order: 10, selection_status: 'candidate',
  work_snapshot: { title: `작품${id}`, author: '작가', genre: '소설', curriculum: [] }, ...extra,
})
const BASE = [row('a', 'v1', 'W1', 'p1'), row('b', 'v1', 'W2', 'p2'), row('c', 'v2', 'W3', 'q2')]
const SHEET = { '작품명': '돌다리', '지은이': '이태준', '장르': '소설', _authorBase: '이태준' }

describe('편집 상태', () => {
  test('옮기기는 행의 권·부를 바꾸고 원래 자리를 표시한다', () => {
    const d = moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2')
    expect(changeCount(d)).toBe(1)
    expect(effectiveRows(BASE, d).find(r => r.id === 'a'))
      .toMatchObject({ volume_id: 'v2', part_id: 'q2', _moved: { fromVolumeId: 'v1', fromPartId: 'p1' } })
  })

  test('원래 자리로 다시 옮기면 바뀐 것이 아니다', () => {
    const d = moveRow(moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2'), BASE, 'a', 'v1', 'p1')
    expect(changeCount(d)).toBe(0)
  })

  test('빼기는 행을 남기되 표시하고, 되돌리면 원래대로', () => {
    const d = removeRow(moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2'), 'a')
    expect(d.moves).toEqual({})
    expect(effectiveRows(BASE, d).find(r => r.id === 'a')).toMatchObject({ _removed: true, volume_id: 'v1' })
    expect(changeCount(revertRow(d, 'a'))).toBe(0)
  })

  test('넣기는 새 행을 만들고, 그 행을 옮기거나 빼면 넣기 목록에서 처리한다', () => {
    let d = addWork(EMPTY_DRAFT, { tempId: 'n1', workId: null, key: 'k1', work: SHEET, curricula: ['7차'], volumeId: 'v1', partId: 'p2' })
    expect(effectiveRows(BASE, d).find(r => r.id === 'n1')).toMatchObject({
      _added: true, _key: 'k1', volume_id: 'v1', part_id: 'p2', work_id: null, selection_status: 'candidate',
      work_snapshot: { title: '돌다리', author: '이태준', genre: '소설', curriculum: ['7차'] },
    })
    d = moveRow(d, BASE, 'n1', 'v2', 'q2')
    expect(d.adds[0]).toMatchObject({ volumeId: 'v2', partId: 'q2' })
    expect(changeCount(removeRow(d, 'n1'))).toBe(0)
    expect(changeCount(revertRow(d, 'n1'))).toBe(0)
  })
})

describe('canPlace', () => {
  test('같은 권에 같은 작품(work_id)이 있으면 막는다 — 자기 자신과 뺀 행은 제외', () => {
    const base = [...BASE, row('x', 'v2', 'W1', 'q1')]
    const rows = effectiveRows(base, EMPTY_DRAFT)
    expect(canPlace(rows, { workId: 'W1', selfId: 'a' }, 'v2')).toEqual({ ok: false, reason: 'exists' })
    expect(canPlace(rows, { workId: 'W1', selfId: 'a' }, 'v1')).toEqual({ ok: true, reason: null })
    const removed = effectiveRows(base, removeRow(EMPTY_DRAFT, 'x'))
    expect(canPlace(removed, { workId: 'W1', selfId: 'a' }, 'v2').ok).toBe(true)
  })

  test('제외 상태로 남은 줄도 막고 이유를 따로 알린다', () => {
    const rows = [row('x', 'v2', 'W1', 'q1', { selection_status: 'excluded' })]
    expect(canPlace(rows, { workId: 'W1' }, 'v2')).toEqual({ ok: false, reason: 'excluded' })
    expect(placeErrorText('excluded', 2)).toBe('2권에 제외 상태로 있습니다. 권 보드에서 지운 뒤 옮겨 주세요')
    expect(placeErrorText('exists', 3)).toBe('이미 3권에 있는 작품입니다')
  })

  test('registry에 없는 작품은 넣기 목록끼리 키로 비교한다', () => {
    const d = addWork(EMPTY_DRAFT, { tempId: 'n1', workId: null, key: 'k1', work: SHEET, curricula: [], volumeId: 'v1', partId: null })
    const rows = effectiveRows(BASE, d)
    expect(canPlace(rows, { workId: null, key: 'k1' }, 'v1').reason).toBe('exists')
    expect(canPlace(rows, { workId: null, key: 'k1' }, 'v2').ok).toBe(true)
  })
})

test('defaultPartFor: 갈래의 부 번호에 맞는 그 권의 부', () => {
  const parts = [{ id: 'p1', number: 1 }, { id: 'p2', number: 2 }, { id: 'p3', number: 3 }]
  expect(defaultPartFor('소설', parts)).toBe('p2')
  expect(defaultPartFor('고전운문', parts)).toBe('p1')
  expect(defaultPartFor('극본', parts)).toBe('p3')
  expect(defaultPartFor('고전수필', parts)).toBe('p3')
  expect(defaultPartFor('고전산문', parts)).toBeNull()
  expect(defaultPartFor('소설', [])).toBeNull()
})

describe('resolveDrop', () => {
  const numberOf = id => ({ v1: 1, v2: 2 })[id]
  const drop = (active, over, baseline = BASE) =>
    resolveDrop({ draft: EMPTY_DRAFT, baseline, active, over, volumeNumberOf: numberOf, newTempId: () => 'n1' })

  test('작품 줄을 다른 권 부에 놓으면 옮긴다', () => {
    const { draft, error } = drop({ type: 'row', rowId: 'a' }, { volumeId: 'v2', partId: 'q2' })
    expect(error).toBeNull()
    expect(draft.moves).toEqual({ a: { volumeId: 'v2', partId: 'q2' } })
  })

  test('같은 부에 놓으면 그대로', () => {
    expect(drop({ type: 'row', rowId: 'a' }, { volumeId: 'v1', partId: 'p1' })).toEqual({ draft: EMPTY_DRAFT, error: null })
  })

  test('같은 작품이 있는 권에는 놓을 수 없다', () => {
    const r = drop({ type: 'row', rowId: 'a' }, { volumeId: 'v2', partId: 'q2' }, [...BASE, row('x', 'v2', 'W1', 'q1')])
    expect(r.draft).toBe(EMPTY_DRAFT)
    expect(r.error).toBe('이미 2권에 있는 작품입니다')
  })

  test('검색 결과를 놓으면 넣는다', () => {
    const { draft } = drop({ type: 'sheet', work: SHEET, key: 'k1', workId: 'W9', curricula: ['7차'] }, { volumeId: 'v2', partId: 'q2' })
    expect(draft.adds).toEqual([expect.objectContaining({ tempId: 'n1', workId: 'W9', key: 'k1', volumeId: 'v2', partId: 'q2' })])
  })
})

test('toDropActive: 검색 결과 끌기 데이터에 work_id와 교육과정을 채운다', () => {
  const data = { type: 'sheet', key: 'k1', work: SHEET, getCurricula: () => ['7차'], title: '돌다리' }
  expect(toDropActive(data, new Map([['k1', 'W9']]))).toEqual({ type: 'sheet', key: 'k1', work: SHEET, workId: 'W9', curricula: ['7차'] })
  expect(toDropActive(data, new Map()).workId).toBeNull()
  expect(toDropActive({ type: 'row', rowId: 'a' }, new Map())).toEqual({ type: 'row', rowId: 'a' })
})

test('describeDraft: 저장 확인 창 목록 (옮기기 → 넣기 → 빼기)', () => {
  let d = moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2')
  d = removeRow(d, 'b')
  d = addWork(d, { tempId: 'n1', workId: 'W9', key: 'k1', work: SHEET, curricula: [], volumeId: 'v2', partId: 'q2' })
  const place = (v, p) => `${v}/${p}`
  expect(describeDraft(d, BASE, place)).toEqual([
    { kind: 'move', rowId: 'a', title: '작품a', from: 'v1/p1', to: 'v2/q2' },
    { kind: 'add', rowId: 'n1', title: '돌다리', to: 'v2/q2' },
    { kind: 'remove', rowId: 'b', title: '작품b', from: 'v1/p2' },
  ])
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/tests/compareEdit.test.js`
Expected: FAIL — `Failed to resolve import "../board/compareEdit.js"`

- [ ] **Step 3: 구현** — `src/board/compareEdit.js`

```js
// 권별 비교 편집 상태 (설계 2026-10-02 §5): 편집 중 바뀐 내용을 화면에만 모아 둔다. 순수 함수만.
// draft = { moves: { 행id: { volumeId, partId } }, removes: { 행id: true }, adds: [넣을 작품] }
import { bucketOf } from './genreUtils.js'
import { partNumberFor } from './placementUtils.js'
import { snapshotOf } from '../works/workKey.js'

export const EMPTY_DRAFT = { moves: {}, removes: {}, adds: [] }

const isAdd = (draft, id) => draft.adds.some(a => a.tempId === id)
const samePart = (a, b) => (a ?? null) === (b ?? null)

export function changeCount(draft) {
  return Object.keys(draft.moves).length + Object.keys(draft.removes).length + draft.adds.length
}

// baseline(편집 시작 때 읽은 행)에 draft를 반영한 화면용 행. 표시용 플래그(_moved·_removed·_added)를 붙인다.
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
  return rows
}

export function moveRow(draft, baseline, rowId, volumeId, partId) {
  if (isAdd(draft, rowId)) {
    return { ...draft, adds: draft.adds.map(a => (a.tempId === rowId ? { ...a, volumeId, partId: partId ?? null } : a)) }
  }
  const base = baseline.find(r => r.id === rowId)
  if (!base) return draft
  const moves = { ...draft.moves }
  if (base.volume_id === volumeId && samePart(base.part_id, partId)) delete moves[rowId]
  else moves[rowId] = { volumeId, partId: partId ?? null }
  return { ...draft, moves }
}

export function removeRow(draft, rowId) {
  if (isAdd(draft, rowId)) return { ...draft, adds: draft.adds.filter(a => a.tempId !== rowId) }
  const moves = { ...draft.moves }
  delete moves[rowId]
  return { ...draft, moves, removes: { ...draft.removes, [rowId]: true } }
}

export function revertRow(draft, rowId) {
  if (isAdd(draft, rowId)) return removeRow(draft, rowId)
  const moves = { ...draft.moves }
  const removes = { ...draft.removes }
  delete moves[rowId]
  delete removes[rowId]
  return { ...draft, moves, removes }
}

// 검색 패널에서 넣기. workId는 registry에 있으면 그 ID, 없으면 null(저장 때 발급)
export function addWork(draft, { tempId, workId, key, work, curricula, volumeId, partId }) {
  return {
    ...draft,
    adds: [...draft.adds, {
      tempId, workId: workId ?? null, key, work, curricula,
      snapshot: snapshotOf(work, curricula), volumeId, partId: partId ?? null,
    }],
  }
}

// 같은 권에 같은 작품이 있는가 (DB unique(volume_id, work_id) — 제외 상태 행도 자리를 차지한다).
// rows는 effectiveRows 결과. 뺀 행과 자기 자신은 세지 않는다. registry에 없는 넣기 작품은 키로 비교.
export function canPlace(rows, { workId = null, key = null, selfId = null }, volumeId) {
  for (const r of rows) {
    if (r._removed || r.id === selfId || r.volume_id !== volumeId) continue
    const same = (workId && r.work_id === workId) || (key && r._key === key)
    if (!same) continue
    return { ok: false, reason: r.selection_status === 'excluded' ? 'excluded' : 'exists' }
  }
  return { ok: true, reason: null }
}

export function placeErrorText(reason, volumeNumber) {
  if (reason === 'excluded') return `${volumeNumber}권에 제외 상태로 있습니다. 권 보드에서 지운 뒤 옮겨 주세요`
  return `이미 ${volumeNumber}권에 있는 작품입니다`
}

// 갈래로 정해지는 부(자동 배치와 같은 규칙). 그 번호의 부가 그 권에 없으면 null
export function defaultPartFor(genre, volumeParts) {
  const n = partNumberFor(bucketOf(genre), genre)
  if (n == null) return null
  return volumeParts.find(p => p.number === n)?.id ?? null
}

// 끌어다 놓기 결과. 놓을 수 없으면 draft는 그대로 두고 error 문구를 돌려준다.
export function resolveDrop({ draft, baseline, active, over, volumeNumberOf, newTempId }) {
  if (!active || !over) return { draft, error: null }
  const rows = effectiveRows(baseline, draft)
  if (active.type === 'row') {
    const row = rows.find(r => r.id === active.rowId)
    if (!row || row._removed) return { draft, error: null }
    if (row.volume_id === over.volumeId && samePart(row.part_id, over.partId)) return { draft, error: null }
    const check = canPlace(rows, { workId: row.work_id, key: row._key, selfId: row.id }, over.volumeId)
    if (!check.ok) return { draft, error: placeErrorText(check.reason, volumeNumberOf(over.volumeId)) }
    return { draft: moveRow(draft, baseline, row.id, over.volumeId, over.partId), error: null }
  }
  if (active.type === 'sheet') {
    const check = canPlace(rows, { workId: active.workId, key: active.key }, over.volumeId)
    if (!check.ok) return { draft, error: placeErrorText(check.reason, volumeNumberOf(over.volumeId)) }
    return {
      draft: addWork(draft, {
        tempId: newTempId(), workId: active.workId, key: active.key, work: active.work,
        curricula: active.curricula, volumeId: over.volumeId, partId: over.partId,
      }),
      error: null,
    }
  }
  return { draft, error: null }
}

// 검색 결과 끌기 데이터 → resolveDrop용 (work_id는 registry에서, 교육과정은 이때 계산)
export function toDropActive(data, registryMap) {
  if (data?.type !== 'sheet') return data
  return { type: 'sheet', key: data.key, work: data.work, workId: registryMap.get(data.key) ?? null, curricula: data.getCurricula() }
}

// 저장 확인 창 목록. place(volumeId, partId) → '5권 2부'
export function describeDraft(draft, baseline, place) {
  const byId = new Map(baseline.map(r => [r.id, r]))
  const items = []
  for (const [id, m] of Object.entries(draft.moves)) {
    const r = byId.get(id)
    items.push({ kind: 'move', rowId: id, title: r?.work_snapshot?.title, from: place(r?.volume_id, r?.part_id), to: place(m.volumeId, m.partId) })
  }
  for (const a of draft.adds) {
    items.push({ kind: 'add', rowId: a.tempId, title: a.snapshot?.title, to: place(a.volumeId, a.partId) })
  }
  for (const id of Object.keys(draft.removes)) {
    const r = byId.get(id)
    items.push({ kind: 'remove', rowId: id, title: r?.work_snapshot?.title, from: place(r?.volume_id, r?.part_id) })
  }
  return items
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/tests/compareEdit.test.js`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add src/board/compareEdit.js src/tests/compareEdit.test.js
git commit -m "feat: 권별 비교 편집 상태 모듈(옮기기·빼기·넣기·되돌리기·같은 작품 판정)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 저장 계획·실행 `compareSave.js`

**Files:**
- Create: `src/board/compareSave.js`
- Test: `src/tests/compareSave.test.js`

**Interfaces:**
- Consumes: `nextSortOrder(rows)`(boardUtils — 빈 배열 10, 아니면 최댓값+10), Task 2의 draft 구조
- Produces:
  - `planSave({ draft, baseline, latestRows, latestParts }) → { removes: [{id,title}], moves: [{id,title,volumeId,partId,sortOrder}], adds: [{...draft.adds[i], title, sortOrder}], skipped: [{title,reason}], alreadyRemoved: number }`
  - `runSave(plan, api, { registryMap }) → Promise<{ removed, moved, added, skipped, failed: [{title,reason}] }>` — `api = { deleteVolumeWork, updateVolumeWork, ensureWorkId, insertPlacedWork }`
  - `countAttachments({ tasks, comments, files }) → Map<rowId, { tasks, comments, files }>` (입력은 `listAttachmentRefs` 결과 — 각 배열은 volume_work_id 목록)
  - `attachmentText(counts|undefined) → string`
  - `resultSummary({ moved, added, removed }) → string`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/compareSave.test.js`

```js
import { vi } from 'vitest'
import { planSave, runSave, countAttachments, attachmentText, resultSummary } from '../board/compareSave.js'
import { EMPTY_DRAFT, moveRow, removeRow, addWork } from '../board/compareEdit.js'

const row = (id, volume_id, work_id, part_id, sort_order = 10) => ({
  id, volume_id, work_id, part_id, sort_order, selection_status: 'candidate', work_snapshot: { title: `작품${id}` },
})
const PARTS = [{ id: 'p1', volume_id: 'v1' }, { id: 'p2', volume_id: 'v1' }, { id: 'q1', volume_id: 'v2' }, { id: 'q2', volume_id: 'v2' }]
const BASE = [row('a', 'v1', 'W1', 'p1', 10), row('b', 'v1', 'W2', 'p2', 20), row('c', 'v2', 'W3', 'q2', 30)]
const SHEET = { '작품명': '돌다리', '지은이': '이태준', '장르': '소설', _authorBase: '이태준' }

describe('planSave', () => {
  test('그사이 바뀐 것이 없으면 옮기고, 옮겨 간 권의 맨 뒤 순서를 준다', () => {
    const draft = moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2')
    const plan = planSave({ draft, baseline: BASE, latestRows: BASE, latestParts: PARTS })
    expect(plan.moves).toEqual([{ id: 'a', title: '작품a', volumeId: 'v2', partId: 'q2', sortOrder: 40 }])
    expect(plan.skipped).toEqual([])
  })

  test('그사이 다른 분이 옮기거나 지운 행은 건너뛴다', () => {
    const draft = moveRow(moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2'), BASE, 'b', 'v2', 'q1')
    const latest = [row('a', 'v1', 'W1', 'p2'), row('c', 'v2', 'W3', 'q2', 30)] // a는 부가 바뀌었고 b는 지워짐
    const plan = planSave({ draft, baseline: BASE, latestRows: latest, latestParts: PARTS })
    expect(plan.moves).toEqual([])
    expect(plan.skipped).toEqual([
      { title: '작품a', reason: '그사이 다른 분이 옮기거나 뺐습니다' },
      { title: '작품b', reason: '그사이 다른 분이 옮기거나 뺐습니다' },
    ])
  })

  test('옮겨 갈 권에 그사이 같은 작품이 들어왔으면 건너뛴다', () => {
    const draft = moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2')
    const plan = planSave({ draft, baseline: BASE, latestRows: [...BASE, row('z', 'v2', 'W1', 'q1')], latestParts: PARTS })
    expect(plan.moves).toEqual([])
    expect(plan.skipped).toEqual([{ title: '작품a', reason: '그사이 같은 작품이 들어왔습니다' }])
  })

  test('같은 작품을 빼고 그 자리로 옮기는 조합은 허용한다', () => {
    const base = [...BASE, row('x', 'v2', 'W1', 'q1')]
    const draft = moveRow(removeRow(EMPTY_DRAFT, 'x'), base, 'a', 'v2', 'q1')
    const plan = planSave({ draft, baseline: base, latestRows: base, latestParts: PARTS })
    expect(plan.removes).toEqual([{ id: 'x', title: '작품x' }])
    expect(plan.moves.map(m => m.id)).toEqual(['a'])
  })

  test('옮길 부가 삭제되었으면 건너뛰고, 이미 지워진 빼기는 성공으로 센다', () => {
    const draft = removeRow(moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2'), 'c')
    const latest = [row('a', 'v1', 'W1', 'p1'), row('b', 'v1', 'W2', 'p2')] // c는 이미 지워짐
    const plan = planSave({ draft, baseline: BASE, latestRows: latest, latestParts: PARTS.filter(p => p.id !== 'q2') })
    expect(plan.skipped).toEqual([{ title: '작품a', reason: '옮길 부가 삭제되었습니다' }])
    expect(plan.removes).toEqual([])
    expect(plan.alreadyRemoved).toBe(1)
  })

  test('넣기: 같은 작품이 있는 권은 건너뛰고, 나머지는 옮기기 다음 순서로', () => {
    let draft = moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2')
    draft = addWork(draft, { tempId: 'n1', workId: 'W9', key: 'k9', work: SHEET, curricula: [], volumeId: 'v2', partId: 'q2' })
    draft = addWork(draft, { tempId: 'n2', workId: 'W3', key: 'k3', work: SHEET, curricula: [], volumeId: 'v2', partId: 'q1' })
    const plan = planSave({ draft, baseline: BASE, latestRows: BASE, latestParts: PARTS })
    expect(plan.moves[0].sortOrder).toBe(40)
    expect(plan.adds.map(a => [a.tempId, a.sortOrder])).toEqual([['n1', 50]])
    expect(plan.skipped).toEqual([{ title: '돌다리', reason: '그사이 같은 작품이 들어왔습니다' }])
  })
})

describe('runSave', () => {
  const makeApi = () => ({
    deleteVolumeWork: vi.fn().mockResolvedValue(),
    updateVolumeWork: vi.fn().mockResolvedValue({}),
    ensureWorkId: vi.fn().mockResolvedValue('W100'),
    insertPlacedWork: vi.fn().mockResolvedValue({ id: 'new' }),
  })

  test('빼기 → 옮기기 → 넣기 순서로 반영하고 결과를 센다', async () => {
    const calls = []
    const api = makeApi()
    api.deleteVolumeWork.mockImplementation(async id => { calls.push(`del ${id}`) })
    api.updateVolumeWork.mockImplementation(async id => { calls.push(`upd ${id}`); return {} })
    api.insertPlacedWork.mockImplementation(async ({ workId }) => { calls.push(`ins ${workId}`); return { id: 'n' } })
    const plan = {
      removes: [{ id: 'x', title: 'X' }],
      moves: [{ id: 'a', title: 'A', volumeId: 'v2', partId: 'q2', sortOrder: 40 }],
      adds: [{ tempId: 'n1', title: '돌다리', workId: null, work: SHEET, curricula: ['7차'], snapshot: { title: '돌다리' }, volumeId: 'v2', partId: 'q2', sortOrder: 50 }],
      skipped: [], alreadyRemoved: 1,
    }
    const result = await runSave(plan, api, { registryMap: new Map() })
    expect(calls).toEqual(['del x', 'upd a', 'ins W100'])
    expect(api.updateVolumeWork).toHaveBeenCalledWith('a', { volume_id: 'v2', part_id: 'q2', sort_order: 40 })
    expect(api.ensureWorkId).toHaveBeenCalledWith(SHEET, ['7차'], expect.any(Map))
    expect(api.insertPlacedWork).toHaveBeenCalledWith({
      volumeId: 'v2', workId: 'W100', workSnapshot: { title: '돌다리' }, partId: 'q2', batchId: null, sortOrder: 50,
    })
    expect(result).toEqual({ removed: 2, moved: 1, added: 1, skipped: [], failed: [] })
  })

  test('같은 작품 충돌로 실패한 옮기기는 한 번 더 시도하고, 다른 실패는 목록에 남기고 계속한다', async () => {
    const api = makeApi()
    let first = true
    api.updateVolumeWork.mockImplementation(async id => {
      if (id === 'a' && first) {
        first = false
        throw new Error('duplicate key value violates unique constraint "volume_works_volume_id_work_id_key"')
      }
      if (id === 'b') throw new Error('network down')
      return {}
    })
    api.insertPlacedWork.mockResolvedValue(null) // 그사이 같은 작품 → 건너뜀
    const plan = {
      removes: [],
      moves: [
        { id: 'a', title: 'A', volumeId: 'v2', partId: null, sortOrder: 10 },
        { id: 'b', title: 'B', volumeId: 'v2', partId: null, sortOrder: 20 },
      ],
      adds: [{ tempId: 'n1', title: '돌다리', workId: 'W9', work: SHEET, curricula: [], snapshot: {}, volumeId: 'v1', partId: null, sortOrder: 10 }],
      skipped: [{ title: 'C', reason: '그사이 다른 분이 옮기거나 뺐습니다' }], alreadyRemoved: 0,
    }
    const result = await runSave(plan, api, { registryMap: new Map() })
    expect(api.updateVolumeWork).toHaveBeenCalledTimes(3) // a 실패 → b 실패 → a 재시도 성공
    expect(result.moved).toBe(1)
    expect(result.failed).toEqual([{ title: 'B', reason: 'network down' }])
    expect(result.skipped).toEqual([
      { title: 'C', reason: '그사이 다른 분이 옮기거나 뺐습니다' },
      { title: '돌다리', reason: '그사이 같은 작품이 들어왔습니다' },
    ])
    expect(api.ensureWorkId).not.toHaveBeenCalled()
  })
})

test('countAttachments·attachmentText: 빼는 작품에 딸린 것 안내', () => {
  const counts = countAttachments({ tasks: ['a', 'a', 'b'], comments: ['a'], files: ['b'] })
  expect(counts.get('a')).toEqual({ tasks: 2, comments: 1, files: 0 })
  expect(attachmentText(counts.get('a'))).toBe('업무 2건·의견 1건이 함께 지워집니다')
  expect(attachmentText(counts.get('b'))).toBe('업무 1건이 함께 지워집니다 / 자료 1건은 작품 연결이 끊겨 자료실로 갑니다')
  expect(attachmentText(undefined)).toBe('')
})

test('resultSummary', () => {
  expect(resultSummary({ moved: 7, added: 3, removed: 2 })).toBe('반영했습니다: 옮기기 7 · 넣기 3 · 빼기 2')
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/tests/compareSave.test.js`
Expected: FAIL — `Failed to resolve import "../board/compareSave.js"`

- [ ] **Step 3: 구현** — `src/board/compareSave.js`

```js
// 권별 비교 저장 (설계 2026-10-02 §3.2): 최신 상태와 맞춰 실행 목록을 세우고(planSave), 한 건씩 반영한다(runSave).
import { nextSortOrder } from './boardUtils.js'

const MOVED_AWAY = '그사이 다른 분이 옮기거나 뺐습니다'
const TAKEN = '그사이 같은 작품이 들어왔습니다'
const PART_GONE = '옮길 부가 삭제되었습니다'

const slot = (volumeId, workId) => `${volumeId}|${workId}`

export function planSave({ draft, baseline, latestRows, latestParts }) {
  const latestById = new Map(latestRows.map(r => [r.id, r]))
  const baseById = new Map(baseline.map(r => [r.id, r]))
  const titleOf = id => baseById.get(id)?.work_snapshot?.title

  const removes = []
  let alreadyRemoved = 0
  for (const id of Object.keys(draft.removes)) {
    if (latestById.has(id)) removes.push({ id, title: titleOf(id) })
    else alreadyRemoved++
  }
  const removing = new Set(removes.map(r => r.id))
  const partOk = (volumeId, partId) =>
    partId == null || latestParts.some(p => p.id === partId && p.volume_id === volumeId)
  // 저장 뒤에도 남을 행이 차지하는 (권, 작품) 자리
  const occupied = new Set(latestRows.filter(r => !removing.has(r.id)).map(r => slot(r.volume_id, r.work_id)))

  const skipped = []
  const candidates = []
  for (const [id, target] of Object.entries(draft.moves)) {
    const base = baseById.get(id)
    const latest = latestById.get(id)
    const title = titleOf(id)
    if (!base || !latest || latest.volume_id !== base.volume_id || (latest.part_id ?? null) !== (base.part_id ?? null)) {
      skipped.push({ title, reason: MOVED_AWAY })
      continue
    }
    if (!partOk(target.volumeId, target.partId)) {
      skipped.push({ title, reason: PART_GONE })
      continue
    }
    candidates.push({ id, title, workId: latest.work_id, from: latest.volume_id, volumeId: target.volumeId, partId: target.partId })
  }
  // 옮겨 가는 행은 원래 자리를 비운다 (맞바꾸기·빼고 채우기 허용)
  for (const c of candidates) occupied.delete(slot(c.from, c.workId))

  const nextOrder = new Map()
  const takeOrder = volumeId => {
    if (!nextOrder.has(volumeId)) {
      nextOrder.set(volumeId, nextSortOrder(latestRows.filter(r => r.volume_id === volumeId && !removing.has(r.id))))
    }
    const n = nextOrder.get(volumeId)
    nextOrder.set(volumeId, n + 10)
    return n
  }

  const moves = []
  for (const c of candidates) {
    const s = slot(c.volumeId, c.workId)
    if (occupied.has(s)) {
      skipped.push({ title: c.title, reason: TAKEN })
      occupied.add(slot(c.from, c.workId)) // 못 옮긴 행은 제자리에 남는다
      continue
    }
    occupied.add(s)
    moves.push({ id: c.id, title: c.title, volumeId: c.volumeId, partId: c.partId, sortOrder: takeOrder(c.volumeId) })
  }

  const adds = []
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
    adds.push({ ...a, title, sortOrder: takeOrder(a.volumeId) })
  }

  return { removes, moves, adds, skipped, alreadyRemoved }
}

const isDuplicate = err => /duplicate key|23505/i.test(err?.message || '')

// api = { deleteVolumeWork, updateVolumeWork, ensureWorkId, insertPlacedWork } (volumeApi.js)
// 한 건이 실패해도 나머지는 계속한다.
export async function runSave(plan, api, { registryMap }) {
  const result = { removed: plan.alreadyRemoved, moved: 0, added: 0, skipped: [...plan.skipped], failed: [] }

  for (const r of plan.removes) {
    try {
      await api.deleteVolumeWork(r.id)
      result.removed++
    } catch (err) {
      result.failed.push({ title: r.title, reason: err.message })
    }
  }

  let pending = plan.moves
  for (let pass = 0; pass < 2 && pending.length; pass++) {
    const retry = []
    for (const m of pending) {
      try {
        await api.updateVolumeWork(m.id, { volume_id: m.volumeId, part_id: m.partId, sort_order: m.sortOrder })
        result.moved++
      } catch (err) {
        if (pass === 0 && isDuplicate(err)) retry.push(m) // 다른 옮기기가 자리를 비운 뒤 다시
        else result.failed.push({ title: m.title, reason: isDuplicate(err) ? '옮길 권에 같은 작품이 있습니다' : err.message })
      }
    }
    pending = retry
  }

  for (const a of plan.adds) {
    try {
      const workId = a.workId || await api.ensureWorkId(a.work, a.curricula, registryMap)
      const row = await api.insertPlacedWork({
        volumeId: a.volumeId, workId, workSnapshot: a.snapshot, partId: a.partId, batchId: null, sortOrder: a.sortOrder,
      })
      if (row) result.added++
      else result.skipped.push({ title: a.title, reason: TAKEN })
    } catch (err) {
      result.failed.push({ title: a.title, reason: err.message })
    }
  }
  return result
}

// listAttachmentRefs 결과(각 배열은 volume_work_id 목록) → 행별 개수
export function countAttachments({ tasks = [], comments = [], files = [] }) {
  const map = new Map()
  const bump = (id, field) => {
    if (!map.has(id)) map.set(id, { tasks: 0, comments: 0, files: 0 })
    map.get(id)[field]++
  }
  for (const id of tasks) bump(id, 'tasks')
  for (const id of comments) bump(id, 'comments')
  for (const id of files) bump(id, 'files')
  return map
}

export function attachmentText(c) {
  if (!c) return ''
  const gone = [c.tasks && `업무 ${c.tasks}건`, c.comments && `의견 ${c.comments}건`].filter(Boolean)
  const parts = []
  if (gone.length) parts.push(`${gone.join('·')}이 함께 지워집니다`)
  if (c.files) parts.push(`자료 ${c.files}건은 작품 연결이 끊겨 자료실로 갑니다`)
  return parts.join(' / ')
}

export function resultSummary({ moved, added, removed }) {
  return `반영했습니다: 옮기기 ${moved} · 넣기 ${added} · 빼기 ${removed}`
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/tests/compareSave.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/board/compareSave.js src/tests/compareSave.test.js
git commit -m "feat: 권별 비교 저장 계획·실행(최신 상태 재확인, 빼기→옮기기→넣기)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 경고 계산과 뺀 행 편수 제외 (`compareUtils.js`)

**Files:**
- Modify: `src/board/compareUtils.js`
- Test: `src/tests/compareUtils.test.js` (끝에 추가)

**Interfaces:**
- Consumes: `bucketOf`(genreUtils), `partNumberFor`(placementUtils), `isKnownAuthor`(autoPlace), `normText`(workKey)
- Produces:
  - `compareWarnings(rows, volumes, parts) → Map<rowId, ('noHistory'|'partMismatch'|'authorOver')[]>`
  - `WARNING_LABELS = { noHistory: '수록 이력 없음', partMismatch: '부 확인', authorOver: '작가 3편' }`
  - `expectedPartOf(genre) → number|null`
  - `buildCompareColumns`·`volumesByWork`가 `_removed` 행을 편수·겹침에서 뺀다(목록에는 남김)

- [ ] **Step 1: 실패하는 테스트 추가** — `src/tests/compareUtils.test.js` 맨 위 import를 아래로 바꾸고, 파일 끝에 테스트 추가

```js
import {
  buildCompareColumns, compareSummary, totalOf, volumesByWork,
  compareWarnings, WARNING_LABELS, expectedPartOf,
} from '../board/compareUtils.js'
```

```js
describe('compareWarnings', () => {
  const VOLS = [{ id: 'v1', number: 1, curricula: ['1차', '2차', '3차'] }, { id: 'v2', number: 2, curricula: [] }]
  const PARTS2 = [{ id: 'p1', volume_id: 'v1', number: 1 }, { id: 'p2', volume_id: 'v1', number: 2 }]
  const r = (id, snap, extra = {}) => ({
    id, volume_id: 'v1', part_id: 'p1', selection_status: 'candidate',
    work_snapshot: { genre: '시', author: `작가${id}`, curriculum: ['1차'], ...snap }, ...extra,
  })

  test('수록 이력 없음: 작품 교육과정과 권 교육과정이 안 겹칠 때만 (어느 쪽이든 비면 판정 안 함)', () => {
    const rows = [r('a', { curriculum: ['2022개정'] }), r('b', { curriculum: [] }), r('c', { curriculum: ['2022개정'] }, { volume_id: 'v2', part_id: null })]
    const w = compareWarnings(rows, VOLS, PARTS2)
    expect(w.get('a')).toEqual(['noHistory'])
    expect(w.has('b')).toBe(false)
    expect(w.has('c')).toBe(false)
  })

  test('부와 갈래 다름: 소설이 1부면 경고, 2부·미배정·고전산문은 아님', () => {
    const rows = [
      r('a', { genre: '소설' }), r('b', { genre: '소설' }, { part_id: 'p2' }),
      r('c', { genre: '소설' }, { part_id: null }), r('d', { genre: '고전산문' }),
    ]
    const w = compareWarnings(rows, VOLS, PARTS2)
    expect(w.get('a')).toEqual(['partMismatch'])
    expect(w.has('b') || w.has('c') || w.has('d')).toBe(false)
    expect(expectedPartOf('소설')).toBe(2)
    expect(expectedPartOf('고전산문')).toBeNull()
  })

  test('같은 작가 3편 이상: 제외·뺀 행과 작가 미상은 세지 않는다', () => {
    const same = { author: '백석' }
    expect(compareWarnings([r('a', same), r('b', same), r('c', same, { selection_status: 'excluded' }), r('d', same, { _removed: true })], VOLS, PARTS2).size).toBe(0)
    expect(compareWarnings([r('a', same), r('b', same), r('e', same)], VOLS, PARTS2).get('e')).toEqual(['authorOver'])
    expect(compareWarnings([r('a', { author: '' }), r('b', { author: '' }), r('e', { author: '작자 미상' })], VOLS, PARTS2).size).toBe(0)
  })

  test('경고 문구', () => {
    expect(WARNING_LABELS).toEqual({ noHistory: '수록 이력 없음', partMismatch: '부 확인', authorOver: '작가 3편' })
  })
})

test('편집 중 뺀 행은 목록에 남기되 편수와 겹침에서는 뺀다', () => {
  const vols = [{ id: 'v1', number: 1 }, { id: 'v2', number: 2 }]
  const rows = [
    { id: 'a', volume_id: 'v1', work_id: 'W1', part_id: null, sort_order: 10, selection_status: 'candidate', work_snapshot: { genre: '시' }, _removed: true },
    { id: 'b', volume_id: 'v2', work_id: 'W1', part_id: null, sort_order: 10, selection_status: 'candidate', work_snapshot: { genre: '시' } },
  ]
  const [c1] = buildCompareColumns({ volumes: vols, allVw: rows, allParts: [], confirmedOnly: false })
  expect(c1.groups[0].works.map(w => w.id)).toEqual(['a'])
  expect(c1.counts['현대']).toBe(0)
  expect(c1.groups[0].counts['현대']).toBe(0)
  expect(volumesByWork(rows).get('W1')).toEqual(['v2'])
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/tests/compareUtils.test.js`
Expected: FAIL — `compareWarnings is not a function` 등

- [ ] **Step 3: 구현** — `src/board/compareUtils.js`

맨 위 import를:

```js
import { groupByPart, partLabel } from './boardUtils.js'
import { orderByEra, countEras, bucketOf } from './genreUtils.js'
import { partNumberFor } from './placementUtils.js'
import { isKnownAuthor } from './autoPlace.js'
import { normText } from '../works/workKey.js'

// 편집 중 뺀 행(_removed)은 화면에는 취소선으로 남지만 편수·겹침에서는 뺀다 (2026-10-02)
const live = w => !w._removed
```

`volumesByWork`의 `if (w.selection_status === 'excluded') continue`를:

```js
    if (w.selection_status === 'excluded' || w._removed) continue
```

`buildCompareColumns`의 `counts: countEras(g.works),`를 `counts: countEras(g.works.filter(live)),`로, `return { volume, groups, counts: countEras(works) }`를 `return { volume, groups, counts: countEras(works.filter(live)) }`로 바꾼다.

파일 끝에 추가:

```js
// 작품 줄 경고 (설계 2026-10-02 §4.2) — 막지 않고 표시만. 보기·편집 모드 공통.
export const AUTHOR_WARN_AT = 3
export const WARNING_LABELS = { noHistory: '수록 이력 없음', partMismatch: '부 확인', authorOver: `작가 ${AUTHOR_WARN_AT}편` }

export function expectedPartOf(genre) {
  return partNumberFor(bucketOf(genre), genre)
}

// 행 id → 경고 키 목록. 제외 상태와 편집 중 뺀 행은 계산에서 뺀다.
export function compareWarnings(rows, volumes, parts) {
  const volById = new Map(volumes.map(v => [v.id, v]))
  const partById = new Map(parts.map(p => [p.id, p]))
  const active = rows.filter(r => r.selection_status !== 'excluded' && live(r))
  const authorKey = r => `${r.volume_id}|${normText(r.work_snapshot?.author)}`
  const authorCount = new Map()
  for (const r of active) {
    if (!isKnownAuthor(r.work_snapshot?.author)) continue
    authorCount.set(authorKey(r), (authorCount.get(authorKey(r)) || 0) + 1)
  }
  const out = new Map()
  for (const r of active) {
    const list = []
    const cur = r.work_snapshot?.curriculum || []
    const vcur = volById.get(r.volume_id)?.curricula || []
    if (cur.length && vcur.length && !cur.some(c => vcur.includes(c))) list.push('noHistory')
    const expected = expectedPartOf(r.work_snapshot?.genre)
    const part = partById.get(r.part_id)
    if (expected != null && part && part.number !== expected) list.push('partMismatch')
    if (isKnownAuthor(r.work_snapshot?.author) && authorCount.get(authorKey(r)) >= AUTHOR_WARN_AT) list.push('authorOver')
    if (list.length) out.set(r.id, list)
  }
  return out
}
```

- [ ] **Step 4: 통과 확인 (기존 엑셀 테스트 포함)**

Run: `npx vitest run src/tests/compareUtils.test.js src/tests/exportCompare.test.js src/tests/ComparePage.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/compareUtils.js src/tests/compareUtils.test.js
git commit -m "feat: 권별 비교 경고(수록 이력 없음·부 확인·작가 3편) 계산, 뺀 행은 편수에서 제외

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 홈 '최근 활동' — 권 옮기기 문구와 종류 단위 묶기

**Files:**
- Modify: `src/board/homeUtils.js` (`describeActivity`, `groupActivity`)
- Modify: `src/pages/HomePage.jsx:101` 부근
- Test: `src/tests/homeUtils.test.js`

**Interfaces:**
- Produces: `describeActivity(entry, nameOf, ctx = {})`, `groupActivity(entries, nameOf, limit = 20, ctx = {})` — `ctx = { volumeNumberOf(volumeId) → number|undefined, titleOfVw(volumeWorkId) → string|undefined }`. 활동 기록의 `record_id`가 volume_works 행 id.

- [ ] **Step 1: 테스트 수정·추가** — `src/tests/homeUtils.test.js`

`describe('describeActivity', ...)` 안에 추가:

```js
  test('권을 옮긴 기록은 작품명과 옮겨 간 권으로', () => {
    const nameOf = () => '윤보라'
    const ctx = { volumeNumberOf: id => ({ v7: 7 })[id], titleOfVw: id => ({ r1: '돌다리' })[id] }
    const move = (record_id, to) => ({
      table_name: 'volume_works', action: 'update', record_id, actor_id: 'm1',
      diff: { volume_id: ['v5', to], part_id: ['p', 'q'] },
    })
    expect(describeActivity(move('r1', 'v7'), nameOf, ctx)).toBe('윤보라님이 「돌다리」을(를) 7권으로 옮겼습니다')
    expect(describeActivity(move('gone', 'v9'), nameOf, ctx)).toBe('윤보라님이 작품을 다른 권으로 옮겼습니다')
    expect(describeActivity(move('r1', 'v7'), nameOf)).toBe('윤보라님이 작품을 다른 권으로 옮겼습니다')
  })
```

`describe('groupActivity', ...)`의 세 번째 테스트('손으로 추가한 작품(묶음 없음)은 제목이 달라 따로 보이고, limit만큼만 돌려준다')를 통째로 아래 두 테스트로 바꾼다:

```js
  test('손으로 추가한 작품이 10분 안에 이어지면 「첫 작품」 외 N편으로 묶고, limit만큼만 돌려준다', () => {
    const entries = [
      vw(4, 'insert', null, '풀', '시', 40),
      vw(3, 'insert', null, '서시', '시', 3), vw(2, 'insert', null, '향수', '시', 2), vw(1, 'insert', null, '진달래꽃', '시', 1),
    ]
    const out = groupActivity(entries, nameOf, 2)
    expect(out.map(g => g.text)).toEqual(['윤보라님이 「풀」을(를) 추가했습니다', '윤보라님이 「서시」 외 2편을 추가했습니다'])
    expect(out[0]).toMatchObject({ id: 4, created_at: at(40) })
  })

  test('손으로 한 추가·제거·권 옮기기는 종류별로 묶는다', () => {
    const ctx = { volumeNumberOf: () => 7, titleOfVw: id => ({ r1: '돌다리', r2: '복덕방' })[id] }
    const mv = (id, record_id, min) => ({
      id, record_id, table_name: 'volume_works', action: 'update', actor_id: 'm1', created_at: at(min),
      diff: { volume_id: ['v5', 'v7'] },
    })
    const entries = [
      mv(6, 'r1', 9), mv(5, 'r2', 9),
      vw(4, 'delete', null, '풀', '시', 8), vw(3, 'delete', null, '서시', '시', 8),
      vw(2, 'insert', null, '향수', '시', 7),
    ]
    expect(groupActivity(entries, nameOf, 20, ctx).map(g => g.text)).toEqual([
      '윤보라님이 「돌다리」 외 1편을 다른 권으로 옮겼습니다',
      '윤보라님이 「풀」 외 1편을 제거했습니다',
      '윤보라님이 「향수」을(를) 추가했습니다',
    ])
  })
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/tests/homeUtils.test.js`
Expected: FAIL — 새 테스트 3건(옮기기 문구, 묶기 2건)

- [ ] **Step 3: 구현** — `src/board/homeUtils.js`

`describeActivity` 시그니처와 volume_works 분기를 바꾼다:

```js
export function describeActivity(entry, nameOf, ctx = {}) {
  const name = actorLabel(entry.actor_id, nameOf)
  const d = entry.diff || {}
  const t = entry.table_name
  const a = entry.action
  if (t === 'volume_works') {
    if (a === 'insert') return `${name} 「${d.work_snapshot?.title || '작품'}」을(를) 추가했습니다`
    if (a === 'delete') return `${name} 「${d.work_snapshot?.title || '작품'}」을(를) 제거했습니다`
    // 2026-10-02 권별 비교 편집: update 기록은 바뀐 칸만 담으므로 제목·권 번호는 홈이 넘긴 ctx로 찾는다
    if (a === 'update' && d.volume_id) {
      const title = ctx.titleOfVw?.(entry.record_id)
      const num = ctx.volumeNumberOf?.(d.volume_id[1])
      const what = title ? `「${title}」을(를)` : '작품을'
      return `${name} ${what} ${title && num != null ? `${num}권으로` : '다른 권으로'} 옮겼습니다`
    }
    if (a === 'update' && d.selection_status) {
```

(나머지 `describeActivity` 본문은 그대로.)

> 주의: 제목을 모르면 권 번호도 쓰지 않는다("작품을 다른 권으로") — 테스트 두 번째 기대값과 일치.

`groupActivity` 위(`const SAME_RUN_MS` 아래)에 추가:

```js
// 손으로 한 volume_works 추가·제거·권 옮기기는 종류 단위로 묶는다 (2026-10-02 권별 비교 편집 — 한 번 저장에 여러 건)
function manualKindOf(entry) {
  if (entry.table_name !== 'volume_works') return null
  if (entry.action === 'insert') return 'add'
  if (entry.action === 'delete') return 'remove'
  if (entry.action === 'update' && entry.diff?.volume_id) return 'move'
  return null
}
const KIND_VERB = { add: '추가했습니다', remove: '제거했습니다', move: '다른 권으로 옮겼습니다' }
```

`groupActivity`를 아래로 바꾼다:

```js
export function groupActivity(entries, nameOf, limit = 20, ctx = {}) {
  const groups = []
  for (const e of entries) {
    const batch = batchIdOf(e)
    const bucket = batch ? bucketOf(e.diff?.work_snapshot?.genre) : null
    const kind = batch ? null : manualKindOf(e)
    const text = batch ? null : describeActivity(e, nameOf, ctx)
    const time = new Date(e.created_at).getTime()
    const last = groups[groups.length - 1]
    if (last && batch && last.batch === batch && last.action === e.action) {
      last.count++
      if (bucket) last.buckets.add(bucket)
      continue
    }
    if (last && !batch && !last.batch && last.actor === e.actor_id && last.oldest - time <= SAME_RUN_MS
      && (kind ? last.kind === kind : !last.kind && last.text === text)) {
      last.count++
      last.oldest = time
      continue
    }
    const title = kind === 'move' ? ctx.titleOfVw?.(e.record_id) : kind ? e.diff?.work_snapshot?.title : null
    groups.push({
      id: e.id, created_at: e.created_at, actor: e.actor_id, action: e.action,
      batch, kind, title, text, count: 1, oldest: time, buckets: new Set(bucket ? [bucket] : []),
    })
  }
  return groups.slice(0, limit).map(g => {
    let text = g.text
    if (g.batch) {
      const who = actorLabel(g.actor, nameOf)
      const genre = [...g.buckets].join('·') || '작품'
      text = g.action === 'insert'
        ? `${who} 자동 배치로 ${genre} ${g.count}편을 추가했습니다`
        : `${who} 자동 배치를 되돌려 ${genre} ${g.count}편을 제거했습니다`
    } else if (g.count > 1 && g.kind) {
      const who = actorLabel(g.actor, nameOf)
      text = g.title
        ? `${who} 「${g.title}」 외 ${g.count - 1}편을 ${KIND_VERB[g.kind]}`
        : `${who} 작품 ${g.count}편을 ${KIND_VERB[g.kind]}`
    } else if (g.count > 1) {
      text = `${text} (${g.count}건)`
    }
    return { id: g.id, created_at: g.created_at, text }
  })
}
```

`src/pages/HomePage.jsx`의 `const feed = groupActivity(data.activity, nameOf, 20).map(g => ({`를:

```jsx
    const numberById = Object.fromEntries(data.volumes.map(v => [v.id, v.number]))
    const titleById = Object.fromEntries(data.vworks.map(w => [w.id, w.work_snapshot?.title]))
    const ctx = { volumeNumberOf: id => numberById[id], titleOfVw: id => titleById[id] }
    const feed = groupActivity(data.activity, nameOf, 20, ctx).map(g => ({
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/tests/homeUtils.test.js src/tests/HomePage.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/homeUtils.js src/pages/HomePage.jsx src/tests/homeUtils.test.js
git commit -m "feat: 최근 활동 — 권 옮기기 문구, 손으로 한 추가·제거·옮기기는 종류별로 묶기

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 작품 조회 훅 `useWorkLookup` + 검색 패널 확장

**Files:**
- Create: `src/board/useWorkLookup.js`
- Modify: `src/board/SearchPane.jsx`
- Test: `src/tests/useWorkLookup.test.jsx`, `src/tests/SearchPane.test.jsx` (끝에 추가)

**Interfaces:**
- Consumes: `api.listRegistry()`, `api.listPicks()`, `buildRegistryMap`·`keyOf`(workKey)
- Produces:
  - `buildPickKeys(picks, registry) → Set<sheetKey>`
  - `buildDuplicatesByKey(registry, rows, volumeNumberOf) → Map<sheetKey, [{ volumeNumber, volumeId, selection_status }]>` — rows는 화면 행(`_removed` 제외, registry 없는 넣기 행은 `_key`로)
  - `useWorkLookup(enabled) → { registry, registryMap, pickKeys, loaded, error, refresh }` — `enabled`가 처음 true가 될 때 한 번 불러오고, `refresh()`로 다시
  - `SearchPane` 새 props: `defaultOnlyUnplaced=false`, `renderAction(work, getCurricula)=null`, `itemComponent=PlainItem` (`({ itemKey, work, getCurricula, className, children }) => <li>`)

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/useWorkLookup.test.jsx`

```jsx
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({ listRegistry: vi.fn(), listPicks: vi.fn() }))
const api = await import('../board/volumeApi.js')
const { useWorkLookup, buildPickKeys, buildDuplicatesByKey } = await import('../board/useWorkLookup.js')
const { keyOf } = await import('../works/workKey.js')

const REG = [
  { work_id: 'W1', title: '소나기', author_base: '황순원', aliases: [{ title: '소나기(발췌)', author_base: '황순원' }] },
  { work_id: 'W2', title: '산유화', author_base: '김소월', aliases: [] },
]

test('buildPickKeys: 후보 작품의 시트 키(별칭 포함)', () => {
  expect([...buildPickKeys([{ work_id: 'W1' }], REG)]).toEqual([keyOf('소나기', '황순원'), keyOf('소나기(발췌)', '황순원')])
})

test('buildDuplicatesByKey: 화면 행 기준 — 뺀 행은 빼고, registry 없는 넣기 행은 자기 키로', () => {
  const rows = [
    { id: 'a', volume_id: 'v1', work_id: 'W1', selection_status: 'confirmed' },
    { id: 'b', volume_id: 'v2', work_id: 'W2', selection_status: 'candidate', _removed: true },
    { id: 'n1', volume_id: 'v2', work_id: null, _key: 'k9', selection_status: 'candidate', _added: true },
  ]
  const map = buildDuplicatesByKey(REG, rows, id => ({ v1: 1, v2: 2 })[id])
  expect(map.get(keyOf('소나기', '황순원'))).toEqual([{ volumeNumber: 1, volumeId: 'v1', selection_status: 'confirmed' }])
  expect(map.get(keyOf('소나기(발췌)', '황순원'))).toHaveLength(1)
  expect(map.has(keyOf('산유화', '김소월'))).toBe(false)
  expect(map.get('k9')).toEqual([{ volumeNumber: 2, volumeId: 'v2', selection_status: 'candidate' }])
})

test('useWorkLookup: 켜질 때 한 번만 불러오고 refresh로 다시 불러온다', async () => {
  api.listRegistry.mockResolvedValue(REG)
  api.listPicks.mockResolvedValue([{ work_id: 'W2' }])
  const { result, rerender } = renderHook(({ on }) => useWorkLookup(on), { initialProps: { on: false } })
  expect(api.listRegistry).not.toHaveBeenCalled()
  rerender({ on: true })
  await waitFor(() => expect(result.current.loaded).toBe(true))
  expect(result.current.registryMap.get(keyOf('산유화', '김소월'))).toBe('W2')
  expect(result.current.pickKeys.has(keyOf('산유화', '김소월'))).toBe(true)
  rerender({ on: true })
  expect(api.listRegistry).toHaveBeenCalledTimes(1)
  act(() => result.current.refresh())
  await waitFor(() => expect(api.listRegistry).toHaveBeenCalledTimes(2))
})

test('useWorkLookup: 실패하면 error를 알려 준다', async () => {
  api.listRegistry.mockRejectedValue(new Error('연결 실패'))
  api.listPicks.mockResolvedValue([])
  const { result } = renderHook(() => useWorkLookup(true))
  await waitFor(() => expect(result.current.error).toBe('연결 실패'))
  expect(result.current.loaded).toBe(false)
})
```

`src/tests/SearchPane.test.jsx` 끝에 추가:

```jsx
test("defaultOnlyUnplaced면 '미배치만'이 켜진 채로 시작한다", () => {
  const dup = new Map([[workKeyOf(WORKS[0]), [{ volumeNumber: 2, selection_status: 'candidate' }]]])
  render(<SearchPane works={WORKS} duplicatesByKey={dup} onAdd={() => {}} defaultOnlyUnplaced />)
  expect(screen.getByLabelText('미배치만')).toBeChecked()
  expect(screen.queryByText('소나기')).not.toBeInTheDocument()
  expect(screen.getByText('별 헤는 밤')).toBeInTheDocument()
})

test('renderAction과 itemComponent로 버튼과 줄을 바꿀 수 있다', async () => {
  const seen = []
  const Item = ({ itemKey, work, getCurricula, className, children }) => {
    seen.push([itemKey, work['작품명'], getCurricula()])
    return <li className={className} data-testid="custom-item">{children}</li>
  }
  render(
    <SearchPane works={WORKS} duplicatesByKey={new Map()}
      renderAction={(work, getCurricula) => <span>넣기:{work['작품명']}:{getCurricula().join(',')}</span>}
      itemComponent={Item} />,
  )
  expect(screen.getAllByTestId('custom-item')).toHaveLength(2)
  expect(screen.queryByRole('button', { name: '추가' })).not.toBeInTheDocument()
  expect(screen.getByText('넣기:소나기:7차,2015')).toBeInTheDocument()
  expect(seen).toContainEqual([workKeyOf(WORKS[0]), '소나기', ['7차', '2015']])
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/tests/useWorkLookup.test.jsx src/tests/SearchPane.test.jsx`
Expected: FAIL — `useWorkLookup.js` 없음, SearchPane 새 테스트 2건 실패

- [ ] **Step 3: 구현** — `src/board/useWorkLookup.js`

```js
// 검색 패널용 작품 조회 (2026-10-02 권별 비교): registry·갈래 후보를 필요할 때 불러와 시트 키 기준 맵을 만든다.
// 권 보드·갈래별 후보 화면에도 같은 계산이 있다 — 그쪽은 회귀 위험 때문에 이번엔 바꾸지 않음(추후 이 훅으로 정리).
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from './volumeApi.js'
import { buildRegistryMap, keyOf } from '../works/workKey.js'

function keysOfRegistryRow(row) {
  return [keyOf(row.title, row.author_base), ...(row.aliases || []).map(a => keyOf(a.title, a.author_base))]
}

// 갈래별 후보의 시트 키 집합 (별칭 포함) — 검색 '갈래 후보만' 필터용
export function buildPickKeys(picks, registry) {
  const pickIds = new Set(picks.map(p => p.work_id))
  const keys = new Set()
  for (const row of registry) {
    if (!pickIds.has(row.work_id)) continue
    for (const k of keysOfRegistryRow(row)) keys.add(k)
  }
  return keys
}

// 시트 키 → 수록처. rows는 화면에 보이는 행(편집 중이면 편집 반영본) — 검색 '미배치만'·권 뱃지가 편집을 따라간다.
export function buildDuplicatesByKey(registry, rows, volumeNumberOf) {
  const byWorkId = new Map()
  const byKey = new Map()
  const push = (map, k, r) => {
    if (!map.has(k)) map.set(k, [])
    map.get(k).push({ volumeNumber: volumeNumberOf(r.volume_id), volumeId: r.volume_id, selection_status: r.selection_status })
  }
  for (const r of rows) {
    if (r._removed) continue
    if (r.work_id) push(byWorkId, r.work_id, r)
    else if (r._key) push(byKey, r._key, r)
  }
  for (const row of registry) {
    const dups = byWorkId.get(row.work_id)
    if (!dups) continue
    for (const k of keysOfRegistryRow(row)) byKey.set(k, [...(byKey.get(k) || []), ...dups])
  }
  return byKey
}

export function useWorkLookup(enabled) {
  const [state, setState] = useState({ registry: [], picks: [], loaded: false, error: null })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setState(s => ({ ...s, error: null }))
    Promise.all([api.listRegistry(), api.listPicks()])
      .then(([registry, picks]) => { if (!cancelled) setState({ registry, picks, loaded: true, error: null }) })
      .catch(err => { if (!cancelled) setState(s => ({ ...s, error: err.message })) })
    return () => { cancelled = true }
  }, [enabled, version])

  const refresh = useCallback(() => setVersion(v => v + 1), [])
  const registryMap = useMemo(() => buildRegistryMap(state.registry), [state.registry])
  const pickKeys = useMemo(() => buildPickKeys(state.picks, state.registry), [state.picks, state.registry])
  return { registry: state.registry, registryMap, pickKeys, loaded: state.loaded, error: state.error, refresh }
}
```

`src/board/SearchPane.jsx`:

1) 함수 위에 추가, 시그니처와 `onlyUnplaced` 초기값 변경:

```jsx
function PlainItem({ className, children }) {
  return <li className={className}>{children}</li>
}

// renderAction(work, getCurricula): '추가' 버튼 대신 그릴 것 / itemComponent: 결과 줄(li)을 대신 그릴 컴포넌트 (2026-10-02 권별 비교)
// 교육과정 목록은 결과마다 미리 계산하지 않고 getCurricula()로 필요할 때 계산한다.
export default function SearchPane({
  works, duplicatesByKey, onAdd, pickKeys = null,
  defaultOnlyUnplaced = false, renderAction = null, itemComponent: Item = PlainItem,
}) {
```

```jsx
  const [onlyUnplaced, setOnlyUnplaced] = useState(defaultOnlyUnplaced)
```

2) 결과 목록의 `{grouped.map(...)}` 블록을 아래로 바꾼다:

```jsx
        {grouped.map(([key, { rep: w }]) => {
          const dups = duplicatesByKey.get(key) || []
          const getCurricula = () => curriculaOf(works, key)
          return (
            <Item key={key} itemKey={key} work={w} getCurricula={getCurricula}
              className="flex items-center gap-2 rounded border border-gray-100 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{w['작품명']}</div>
                <div className="truncate text-xs text-gray-500">
                  {w._authorBase} · {w['장르']}
                </div>
              </div>
              <span className="shrink-0 text-xs text-gray-400">수록 {countsByKey.get(key)}회</span>
              {dups.map(d => (
                <span
                  key={d.volumeNumber}
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${d.selection_status === 'confirmed' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}
                >
                  {d.volumeNumber}권 {SELECTION_LABELS[d.selection_status]}
                </span>
              ))}
              {renderAction ? renderAction(w, getCurricula) : (
                <button
                  type="button"
                  onClick={() => onAdd(w, getCurricula())}
                  className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white"
                >
                  추가
                </button>
              )}
            </Item>
          )
        })}
```

- [ ] **Step 4: 통과 확인 (권 보드·갈래별 후보 회귀 포함)**

Run: `npx vitest run src/tests/useWorkLookup.test.jsx src/tests/SearchPane.test.jsx src/tests/VolumeBoardPage.test.jsx src/tests/GenrePicksPage.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/useWorkLookup.js src/board/SearchPane.jsx src/tests/useWorkLookup.test.jsx src/tests/SearchPane.test.jsx
git commit -m "feat: 작품 조회 훅(useWorkLookup), 검색 패널에 미배치 기본값·버튼·줄 교체 props

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 작품 줄 분리 + 보기 모드 경고 + 컨테이너 기준 격자

**Files:**
- Create: `src/board/CompareWorkRow.jsx`
- Modify: `src/board/ComparePage.jsx`
- Modify: `src/tests/ComparePage.test.jsx` (겹침 ⚠ 개수 테스트, mock 목록)
- Create: `src/tests/ComparePageEdit.test.jsx`

**Interfaces:**
- Consumes: `compareWarnings`·`WARNING_LABELS`·`expectedPartOf`(Task 4)
- Produces: `CompareWorkRow` default export — props `{ row, others: number[], warnings: string[], fromLabel: string|null, leading: node, trailing: node, dragging: bool, ref }`; named export `EraChip`. 바뀐 표시: `_moved` → 파란 왼쪽 줄, `_added` → '새로', `_removed` → 취소선(경고·겹침 숨김).
- `ComparePageEdit.test.jsx`의 공용 fixture·`renderPage()`(Task 8~11이 이어서 테스트를 추가)

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/ComparePageEdit.test.jsx`

```jsx
import { render, screen, within, act, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

const sheetState = vi.hoisted(() => ({ current: null }))
vi.mock('../works/useWorksData.js', () => ({ useWorksData: () => sheetState.current }))
vi.mock('../board/volumeApi.js', () => ({
  listVolumes: vi.fn(), listAllVolumeWorks: vi.fn(), listAllParts: vi.fn(),
  listAttachmentRefs: vi.fn(), updateVolumeWork: vi.fn(), deleteVolumeWork: vi.fn(),
  ensureWorkId: vi.fn(), insertPlacedWork: vi.fn(), listRegistry: vi.fn(), listPicks: vi.fn(),
}))
vi.mock('../board/exportCompare.js', () => ({ downloadCompareExcel: vi.fn() }))
const api = await import('../board/volumeApi.js')
const { default: ComparePage } = await import('../board/ComparePage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

const VOLUMES = [
  { id: 'v1', number: 1, title: '첫 장면', status: '기획', curricula: ['1차', '2차', '3차'] },
  { id: 'v2', number: 2, title: '오래 남을', status: '기획', curricula: ['4차'] },
]
const PARTS = [
  { id: 'p1', volume_id: 'v1', number: 1, title: '시', sort_order: 10 },
  { id: 'p2', volume_id: 'v1', number: 2, title: '소설', sort_order: 20 },
  { id: 'q1', volume_id: 'v2', number: 1, title: '시', sort_order: 10 },
  { id: 'q2', volume_id: 'v2', number: 2, title: '소설', sort_order: 20 },
]
const snap = (title, author, genre, curriculum) => ({ title, author, genre, curriculum })
const VW = [
  { id: 'a', volume_id: 'v1', work_id: 'W1', part_id: 'p2', sort_order: 10, selection_status: 'candidate', work_snapshot: snap('소나기', '황순원', '소설', ['2차', '4차']) },
  { id: 'b', volume_id: 'v1', work_id: 'W2', part_id: 'p1', sort_order: 20, selection_status: 'candidate', work_snapshot: snap('산유화', '김소월', '시', ['1차']) },
  { id: 'c', volume_id: 'v2', work_id: 'W3', part_id: 'q2', sort_order: 10, selection_status: 'confirmed', work_snapshot: snap('학', '황순원', '소설', ['5차']) },
  { id: 'd', volume_id: 'v2', work_id: 'W2', part_id: 'q1', sort_order: 20, selection_status: 'candidate', work_snapshot: snap('산유화', '김소월', '시', ['1차', '4차']) },
]
const SHEET = [
  { '작품명': '돌다리', '지은이': '이태준', '장르': '소설', '교육과정': '4차', _authorBase: '이태준' },
  { '작품명': '소나기', '지은이': '황순원', '장르': '소설', '교육과정': '2차', _authorBase: '황순원' },
]
const REGISTRY = [
  { work_id: 'W1', title: '소나기', author_base: '황순원', aliases: [] },
  { work_id: 'W9', title: '돌다리', author_base: '이태준', aliases: [] },
]

beforeEach(() => {
  vi.clearAllMocks()
  api.listVolumes.mockResolvedValue(VOLUMES)
  api.listAllVolumeWorks.mockResolvedValue(VW)
  api.listAllParts.mockResolvedValue(PARTS)
  api.listAttachmentRefs.mockResolvedValue({ tasks: [], comments: [], files: [] })
  api.updateVolumeWork.mockResolvedValue({})
  api.deleteVolumeWork.mockResolvedValue()
  api.insertPlacedWork.mockResolvedValue({ id: 'new' })
  api.listRegistry.mockResolvedValue(REGISTRY)
  api.listPicks.mockResolvedValue([{ work_id: 'W1' }, { work_id: 'W9' }])
  sheetState.current = { works: SHEET, loading: false, error: null, retry: vi.fn() }
})

function renderPage() {
  const router = createMemoryRouter(
    [{ path: '/compare', element: <ComparePage /> }, { path: '/', element: <p>홈 화면</p> }],
    { initialEntries: ['/compare'] },
  )
  render(<ToastProvider><RouterProvider router={router} /></ToastProvider>)
  return router
}
const region = name => screen.getByRole('region', { name })

test('보기 모드에서도 경고 뱃지를 보여 준다', async () => {
  renderPage()
  await screen.findByText('2권 오래 남을')
  expect(within(region('2권 오래 남을')).getByText('⚠ 수록 이력 없음')).toBeInTheDocument() // 학(5차)은 2권(4차)에 이력 없음
  expect(within(region('1권 첫 장면')).queryByText(/⚠ 부 확인/)).not.toBeInTheDocument()
})
```

`src/tests/ComparePage.test.jsx`:
- mock 목록을 아래로 바꾼다(이후 Task에서 ComparePage가 import하는 함수가 늘어나므로 미리 맞춤):

```js
vi.mock('../board/volumeApi.js', () => ({
  listVolumes: vi.fn(), listAllVolumeWorks: vi.fn(), listAllParts: vi.fn(),
  listAttachmentRefs: vi.fn(), updateVolumeWork: vi.fn(), deleteVolumeWork: vi.fn(),
  ensureWorkId: vi.fn(), insertPlacedWork: vi.fn(), listRegistry: vi.fn(), listPicks: vi.fn(),
}))
```

- 첫 테스트의 `expect(screen.getAllByText(/⚠/)).toHaveLength(2)          // 겹침 강조 2곳`을:

```js
  expect(screen.getAllByText(/^⚠ [\d·]+권$/)).toHaveLength(2)   // 겹침 강조 2곳 (부 확인 경고와 구분)
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/tests/ComparePageEdit.test.jsx`
Expected: FAIL — `⚠ 수록 이력 없음`을 찾지 못함

- [ ] **Step 3: 구현 — `src/board/CompareWorkRow.jsx`**

```jsx
// 권별 비교의 작품 한 줄 (2026-10-02 ComparePage에서 분리):
// 고전/현대·제목·작가 / 바뀐 표시(편집 중) / 경고 / 다른 권과 겹침 / 선정 상태
import { SELECTION_LABELS } from './constants.js'
import { eraOf } from './genreUtils.js'
import { WARNING_LABELS, expectedPartOf } from './compareUtils.js'

const SELECTION_BADGE = {
  candidate: 'bg-gray-100 text-gray-700',
  hold: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  excluded: 'bg-gray-200 text-gray-400 line-through',
}

// 겹침(노랑)·상태(파랑·회색) 색과 겹치지 않게 고전은 청록, 현대는 보라
const ERA_CHIP = {
  '고전': 'bg-teal-100 text-teal-800',
  '현대': 'bg-violet-100 text-violet-800',
  '기타': 'bg-gray-100 text-gray-500',
}

export function EraChip({ era }) {
  return <span className={`shrink-0 rounded px-1 py-0.5 text-xs ${ERA_CHIP[era]}`}>{era}</span>
}

function warningTitle(key, genre) {
  if (key === 'partMismatch') return `${genre}은(는) 보통 ${expectedPartOf(genre)}부`
  if (key === 'noHistory') return '이 권의 교육과정기에 수록된 이력이 없습니다'
  return '한 권에 같은 작가는 2편까지가 기준입니다'
}

export default function CompareWorkRow({
  row, others = [], warnings = [], fromLabel = null, leading = null, trailing = null, dragging = false, ref,
}) {
  const s = row.work_snapshot || {}
  const removed = !!row._removed
  const isDup = !removed && others.length > 0
  const cls = [
    'flex items-center gap-1.5 rounded px-1.5 py-1 text-sm',
    isDup ? 'bg-amber-50' : '',
    row._moved ? 'border-l-4 border-blue-500' : '',
    dragging ? 'opacity-40' : '',
  ].filter(Boolean).join(' ')
  return (
    <li ref={ref} className={cls}>
      {leading}
      <EraChip era={eraOf(s.genre) || '기타'} />
      <span className={`min-w-0 flex-1 truncate ${removed ? 'text-gray-400 line-through' : ''}`}>
        <span>{s.title}</span>
        <span className="ml-1 text-xs text-gray-400">{s.author}</span>
      </span>
      {row._added && <span className="shrink-0 rounded bg-green-100 px-1 py-0.5 text-xs text-green-800">새로</span>}
      {fromLabel && <span className="shrink-0 text-xs text-blue-700">{fromLabel}</span>}
      {!removed && warnings.map(k => (
        <span key={k} title={warningTitle(k, s.genre)} className="shrink-0 rounded bg-red-50 px-1 py-0.5 text-xs text-red-700">
          ⚠ {WARNING_LABELS[k]}
        </span>
      ))}
      {isDup && <span className="shrink-0 text-xs text-amber-700">⚠ {others.join('·')}권</span>}
      <span className={`shrink-0 rounded px-1 py-0.5 text-xs ${SELECTION_BADGE[row.selection_status]}`}>
        {SELECTION_LABELS[row.selection_status]}
      </span>
      {trailing}
    </li>
  )
}
```

- [ ] **Step 4: 구현 — `src/board/ComparePage.jsx` 수정**

1) 머리 주석에 한 줄 추가, import 정리:

```jsx
// 권별 비교: 모든 권의 수록 목록을 한 화면에서 나란히 본다 (읽기 전용, 설계 §10 2c)
// 2026-10-01: 부 띠·고전/현대 표시(부 안은 고전 → 현대 순)·구성 요약표(부 × 권)
// 2026-10-02: 작품 줄 경고(수록 이력·부·작가), 격자 열 수는 화면이 아니라 차지한 폭 기준(오른쪽 패널 대비)
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listVolumes, listAllVolumeWorks, listAllParts } from './volumeApi.js'
import { eraSummary } from './genreUtils.js'
import {
  buildCompareColumns, compareSummary, compareWarnings, totalOf, volumesByWork as buildVolumesByWork,
} from './compareUtils.js'
import CompareWorkRow, { EraChip } from './CompareWorkRow.jsx'
import { useToast } from '../components/Toast.jsx'
import { downloadCompareExcel } from './exportCompare.js'
```

2) 파일 안의 `SELECTION_BADGE`·`ERA_CHIP`·`EraChip` 정의를 지운다(`CompareWorkRow.jsx`로 옮김). `SELECTION_LABELS`·`eraOf` import도 지운다.

3) `columns` useMemo 아래에 추가:

```jsx
  const warnings = useMemo(() => compareWarnings(allVw, volumes, allParts), [allVw, volumes, allParts])
```

4) `<SummaryTable columns={columns} />`부터 격자 끝 `</div>`까지를 아래로 바꾼다(컨테이너 쿼리 + `CompareWorkRow`):

```jsx
      <div className="@container">
        <SummaryTable columns={columns} />

        <div className="grid gap-4 pb-4 @2xl:grid-cols-2 @4xl:grid-cols-3 @7xl:grid-cols-4">
          {columns.map(({ volume: v, groups, counts }) => {
            const name = `${v.number}권 ${v.title}`
            const meta = [`${totalOf(counts)}편`, eraSummary(counts), v.status].filter(Boolean).join(' · ')
            const hasParts = groups.some(g => g.label)
            return (
              <section key={v.id} aria-label={name} className="rounded border border-gray-200">
                <Link to={`/volumes/${v.id}`} className="block border-b border-gray-200 bg-gray-50 px-3 py-2 font-semibold hover:bg-gray-100">
                  {name}
                  <span className="ml-2 text-xs font-normal text-gray-500">{meta}</span>
                </Link>
                <div className={`max-h-[70vh] overflow-y-auto px-2 pb-2 ${hasParts ? '' : 'pt-2'}`}>
                  {groups.map((g, i) => (
                    <div key={g.part ? g.part.id : `none-${i}`}>
                      {g.label && <PartBand group={g} first={i === 0} />}
                      <ul className="mt-1 space-y-0.5">
                        {g.works.map(w => (
                          <CompareWorkRow
                            key={w.id}
                            row={w}
                            others={(volumesByWork.get(w.work_id) || []).filter(id => id !== v.id).map(id => numberByVolumeId[id]).sort((a, b) => a - b)}
                            warnings={warnings.get(w.id) || []}
                          />
                        ))}
                        {!g.works.length && <li className="py-0.5 text-xs text-gray-300">없음</li>}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
          {!volumes.length && <p className="text-sm text-gray-400">아직 권이 없습니다.</p>}
        </div>
      </div>
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/tests/ComparePageEdit.test.jsx src/tests/ComparePage.test.jsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/board/CompareWorkRow.jsx src/board/ComparePage.jsx src/tests/ComparePage.test.jsx src/tests/ComparePageEdit.test.jsx
git commit -m "feat: 권별 비교 작품 줄 분리·경고 뱃지 표시, 격자 열 수를 차지한 폭 기준으로

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 편집 모드 — 메뉴로 옮기기·빼기·되돌리기, 취소·나가기 방지

**Files:**
- Create: `src/board/CompareMoveMenu.jsx`
- Modify: `src/board/ComparePage.jsx` (전체 교체)
- Test: `src/tests/ComparePageEdit.test.jsx` (추가)

**Interfaces:**
- Consumes: Task 2 함수들, `CompareWorkRow`(Task 7), `useBlocker`(Task 1의 데이터 라우터)
- Produces:
  - `CompareMoveMenu` props `{ label, triggerText, triggerClass, volumes, partsByVolume: Map<volumeId, part[]>, initialVolumeId, initialPartFor(volumeId) → partId|null, blockedText(volumeId) → string|null, confirmText, onConfirm(volumeId, partId|null), onRemove?, onRevert? }` — 트리거 버튼과 떠 있는 메뉴(role="dialog", aria-label=label, select aria-label '권'·'부')
  - `ComparePage` 내부: `editing`, `baseline`, `draft`, `rows`(편집 반영 행), `numberById`, `partsByVolume`, `partById`, `place(volumeId, partId)`, `blockedFor(ref, volumeId)`, `partFor(genre, volumeId)`, `load()` — Task 9~11이 사용

- [ ] **Step 1: 실패하는 테스트 추가** — `src/tests/ComparePageEdit.test.jsx` 끝에

```jsx
async function startEdit() {
  await userEvent.click(await screen.findByRole('button', { name: '편집' }))
  await screen.findByText(/편집 중/)
}
async function openMenu(regionName, title) {
  await userEvent.click(within(region(regionName)).getByRole('button', { name: `「${title}」 메뉴` }))
  return screen.getByRole('dialog', { name: `「${title}」 메뉴` })
}

test('편집을 누르면 새로 읽고, 편집 중 바와 작품 메뉴가 나오며 엑셀·확정만 보기는 숨긴다', async () => {
  renderPage()
  await startEdit()
  expect(api.listAllVolumeWorks).toHaveBeenCalledTimes(2)
  expect(screen.getByText('편집 중 · 바뀐 작품 0건')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '엑셀로 저장' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('확정만 보기')).not.toBeInTheDocument()
  expect(within(region('1권 첫 장면')).getByRole('button', { name: '「소나기」 메뉴' })).toBeInTheDocument()
  expect(within(region('1권 첫 장면')).queryByRole('link')).not.toBeInTheDocument() // 편집 중엔 권 보드 링크 끔
})

test('메뉴로 다른 권에 옮기면 그 권에 표시되고 편수가 바뀐다 (부는 갈래로 미리 고름)', async () => {
  renderPage()
  await startEdit()
  const dlg = await openMenu('1권 첫 장면', '소나기')
  await userEvent.selectOptions(within(dlg).getByLabelText('권'), 'v2')
  expect(within(dlg).getByLabelText('부')).toHaveValue('q2')
  await userEvent.click(within(dlg).getByRole('button', { name: '옮기기' }))
  expect(within(region('2권 오래 남을')).getByText('소나기')).toBeInTheDocument()
  expect(within(region('2권 오래 남을')).getByText('1권에서')).toBeInTheDocument()
  expect(within(region('1권 첫 장면')).queryByText('소나기')).not.toBeInTheDocument()
  expect(within(region('1권 첫 장면')).getByText('1편 · 현대 1 · 기획')).toBeInTheDocument()
  expect(screen.getByText('편집 중 · 바뀐 작품 1건')).toBeInTheDocument()
})

test('같은 작품이 있는 권은 메뉴에서 고를 수 없다', async () => {
  renderPage()
  await startEdit()
  const dlg = await openMenu('1권 첫 장면', '산유화')
  expect(within(dlg).getByRole('option', { name: '2권 (이미 있음)' })).toBeDisabled()
})

test('빼면 취소선과 되돌리기가 생기고, 되돌리면 원래대로', async () => {
  renderPage()
  await startEdit()
  const dlg = await openMenu('1권 첫 장면', '소나기')
  await userEvent.click(within(dlg).getByRole('button', { name: '권에서 빼기' }))
  expect(within(region('1권 첫 장면')).getByText('소나기').parentElement).toHaveClass('line-through')
  expect(screen.getByText('편집 중 · 바뀐 작품 1건')).toBeInTheDocument()
  await userEvent.click(within(region('1권 첫 장면')).getByRole('button', { name: '되돌리기' }))
  expect(screen.getByText('편집 중 · 바뀐 작품 0건')).toBeInTheDocument()
})

test('바뀐 것이 있을 때 취소하면 확인을 묻는다', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  renderPage()
  await startEdit()
  await userEvent.click(within(await openMenu('1권 첫 장면', '소나기')).getByRole('button', { name: '권에서 빼기' }))
  await userEvent.click(screen.getByRole('button', { name: '취소' }))
  expect(confirm).toHaveBeenCalledWith('저장하지 않은 변경 1건이 있습니다. 나가면 사라집니다.')
  expect(screen.getByText(/편집 중/)).toBeInTheDocument()
  confirm.mockReturnValue(true)
  await userEvent.click(screen.getByRole('button', { name: '취소' }))
  expect(screen.getByRole('button', { name: '편집' })).toBeInTheDocument()
  expect(within(region('1권 첫 장면')).getByText('소나기').parentElement).not.toHaveClass('line-through')
  confirm.mockRestore()
})

test('저장하지 않고 다른 화면으로 가려 하면 확인을 묻는다', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const router = renderPage()
  await startEdit()
  await userEvent.click(within(await openMenu('1권 첫 장면', '소나기')).getByRole('button', { name: '권에서 빼기' }))
  await act(async () => { router.navigate('/') })
  expect(confirm).toHaveBeenCalled()
  expect(screen.getByText(/편집 중/)).toBeInTheDocument()
  confirm.mockReturnValue(true)
  await act(async () => { router.navigate('/') })
  expect(await screen.findByText('홈 화면')).toBeInTheDocument()
  confirm.mockRestore()
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/tests/ComparePageEdit.test.jsx`
Expected: FAIL — '편집' 버튼 없음

- [ ] **Step 3: 구현 — `src/board/CompareMoveMenu.jsx`**

```jsx
// 권별 비교의 떠 있는 메뉴 (2026-10-02): 권·부를 골라 옮기거나(작품 ⋯) 넣는다(검색 패널 '넣기').
// 권 칸은 스크롤 영역이라 메뉴가 잘리지 않게 body에 띄운다.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { partLabel } from './boardUtils.js'

export default function CompareMoveMenu({
  label, triggerText, triggerClass, volumes, partsByVolume, initialVolumeId = '', initialPartFor,
  blockedText, confirmText, onConfirm, onRemove = null, onRevert = null,
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [volumeId, setVolumeId] = useState(initialVolumeId)
  const [partId, setPartId] = useState('')
  const btnRef = useRef(null)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => {
      if (!boxRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle() {
    if (!open) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 296)) })
      setVolumeId(initialVolumeId)
      setPartId((initialVolumeId && initialPartFor(initialVolumeId)) || '')
    }
    setOpen(o => !o)
  }

  function pickVolume(id) {
    setVolumeId(id)
    setPartId((id && initialPartFor(id)) || '')
  }

  function act(fn) {
    fn()
    setOpen(false)
  }

  const parts = partsByVolume.get(volumeId) || []
  const blocked = volumeId ? blockedText(volumeId) : null
  const ready = volumeId && !blocked && (parts.length === 0 || partId)

  return (
    <>
      <button ref={btnRef} type="button" aria-label={label} onClick={toggle} className={triggerClass}>{triggerText}</button>
      {open && createPortal(
        <div ref={boxRef} role="dialog" aria-label={label} style={{ position: 'fixed', top: pos.top, left: pos.left }}
          className="z-50 w-72 rounded border border-gray-200 bg-white p-3 text-sm shadow-lg">
          <div className="mb-2 flex gap-2">
            <select aria-label="권" value={volumeId} onChange={e => pickVolume(e.target.value)}
              className="min-w-0 flex-1 rounded border border-gray-300 px-1 py-1">
              <option value="">권 선택</option>
              {volumes.map(v => {
                const taken = !!blockedText(v.id)
                return <option key={v.id} value={v.id} disabled={taken}>{v.number}권{taken ? ' (이미 있음)' : ''}</option>
              })}
            </select>
            {parts.length > 0 && (
              <select aria-label="부" value={partId} onChange={e => setPartId(e.target.value)}
                className="min-w-0 flex-1 rounded border border-gray-300 px-1 py-1">
                <option value="">부 선택</option>
                {parts.map(p => <option key={p.id} value={p.id}>{partLabel(p)}</option>)}
              </select>
            )}
          </div>
          {blocked && <p className="mb-2 text-xs text-red-600">{blocked}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!ready} onClick={() => act(() => onConfirm(volumeId, partId || null))}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40">
              {confirmText}
            </button>
            {onRevert && (
              <button type="button" onClick={() => act(onRevert)}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600">되돌리기</button>
            )}
            {onRemove && (
              <button type="button" onClick={() => act(onRemove)}
                className="ml-auto text-xs text-red-600 hover:underline">권에서 빼기</button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
```

- [ ] **Step 4: 구현 — `src/board/ComparePage.jsx` 전체 교체**

`EraBar`·`SummaryTable`·`PartBand` 함수는 지금 파일의 것을 그대로 둔다(아래 `/* EraBar·SummaryTable·PartBand: 기존 그대로 */` 자리). 나머지를 아래로 바꾼다:

```jsx
// 권별 비교: 모든 권의 수록 목록을 한 화면에서 나란히 본다 (설계 §10 2c)
// 2026-10-01: 부 띠·고전/현대 표시(부 안은 고전 → 현대 순)·구성 요약표(부 × 권)
// 2026-10-02: 작품 줄 경고, 편집 모드(옮기기·빼기·넣기를 모았다가 저장) — docs/superpowers/specs/2026-10-02-compare-edit-design.md
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useBlocker } from 'react-router-dom'
import { listVolumes, listAllVolumeWorks, listAllParts } from './volumeApi.js'
import { eraSummary } from './genreUtils.js'
import {
  buildCompareColumns, compareSummary, compareWarnings, totalOf, volumesByWork as buildVolumesByWork,
} from './compareUtils.js'
import {
  EMPTY_DRAFT, changeCount, effectiveRows, moveRow, removeRow, revertRow,
  canPlace, placeErrorText, defaultPartFor,
} from './compareEdit.js'
import CompareWorkRow, { EraChip } from './CompareWorkRow.jsx'
import CompareMoveMenu from './CompareMoveMenu.jsx'
import { useToast } from '../components/Toast.jsx'
import { downloadCompareExcel } from './exportCompare.js'

const leaveText = n => `저장하지 않은 변경 ${n}건이 있습니다. 나가면 사라집니다.`

/* EraBar·SummaryTable·PartBand: 기존 그대로 */

export default function ComparePage() {
  const [volumes, setVolumes] = useState([])
  const [allVw, setAllVw] = useState([])
  const [allParts, setAllParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmedOnly, setConfirmedOnly] = useState(false)
  const [editing, setEditing] = useState(false)
  const [baseline, setBaseline] = useState([])
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const { show } = useToast()

  const load = useCallback(async () => {
    const [vs, vw, ps] = await Promise.all([listVolumes(), listAllVolumeWorks(), listAllParts()])
    setVolumes(vs)
    setAllVw(vw)
    setAllParts(ps)
    return vw
  }, [])

  useEffect(() => {
    load().catch(err => show(err.message)).finally(() => setLoading(false))
  }, [load, show])

  // 편집 중에는 편집 시작 때 읽은 상태(baseline)에 draft를 반영해 보여 준다 — 다른 사람의 변경은 저장 때 맞춘다
  const rows = useMemo(() => (editing ? effectiveRows(baseline, draft) : allVw), [editing, baseline, draft, allVw])
  const dirtyCount = editing ? changeCount(draft) : 0
  const numberById = useMemo(() => Object.fromEntries(volumes.map(v => [v.id, v.number])), [volumes])
  const partById = useMemo(() => new Map(allParts.map(p => [p.id, p])), [allParts])
  const partsByVolume = useMemo(() => {
    const m = new Map()
    for (const p of allParts) {
      if (!m.has(p.volume_id)) m.set(p.volume_id, [])
      m.get(p.volume_id).push(p)
    }
    return m
  }, [allParts])
  const volumesByWork = useMemo(() => buildVolumesByWork(rows), [rows])
  const warnings = useMemo(() => compareWarnings(rows, volumes, allParts), [rows, volumes, allParts])
  const columns = useMemo(
    () => buildCompareColumns({ volumes, allVw: rows, allParts, confirmedOnly: editing ? false : confirmedOnly }),
    [volumes, rows, allParts, confirmedOnly, editing],
  )

  // 나가기 방지 (설계 §4.3): 앱 안 이동은 확인 창, 새로고침·탭 닫기는 브라우저 기본 확인
  const blocker = useBlocker(dirtyCount > 0)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(leaveText(dirtyCount))) blocker.proceed()
    else blocker.reset()
  }, [blocker, dirtyCount])
  useEffect(() => {
    if (!dirtyCount) return
    const onBeforeUnload = e => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirtyCount])

  const place = (volumeId, partId) => {
    const p = partById.get(partId)
    return `${numberById[volumeId]}권${p ? ` ${p.number}부` : ''}`
  }
  const blockedFor = (ref, volumeId) => {
    const c = canPlace(rows, ref, volumeId)
    return c.ok ? null : placeErrorText(c.reason, numberById[volumeId])
  }
  const partFor = (genre, volumeId) => defaultPartFor(genre, partsByVolume.get(volumeId) || [])
  const fromLabel = row => {
    if (!row._moved) return null
    if (row._moved.fromVolumeId !== row.volume_id) return `${numberById[row._moved.fromVolumeId]}권에서`
    const p = partById.get(row._moved.fromPartId)
    return p ? `${p.number}부에서` : '미배정에서'
  }

  async function enterEdit() {
    try {
      const vw = await load()
      setBaseline(vw)
      setDraft(EMPTY_DRAFT)
      setEditing(true)
    } catch (err) {
      show(err.message)
    }
  }

  function finishEdit() {
    setEditing(false)
    setDraft(EMPTY_DRAFT)
  }

  function cancelEdit() {
    if (dirtyCount && !window.confirm(leaveText(dirtyCount))) return
    finishEdit()
  }

  function rowTrailing(row) {
    if (row._removed) {
      return (
        <button type="button" onClick={() => setDraft(d => revertRow(d, row.id))}
          className="shrink-0 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-600">되돌리기</button>
      )
    }
    const title = row.work_snapshot?.title
    return (
      <CompareMoveMenu
        label={`「${title}」 메뉴`}
        triggerText="⋯"
        triggerClass="shrink-0 rounded px-1 text-gray-500 hover:bg-gray-100"
        volumes={volumes}
        partsByVolume={partsByVolume}
        initialVolumeId={row.volume_id}
        initialPartFor={vid => (vid === row.volume_id ? row.part_id : partFor(row.work_snapshot?.genre, vid))}
        blockedText={vid => blockedFor({ workId: row.work_id, key: row._key, selfId: row.id }, vid)}
        confirmText="옮기기"
        onConfirm={(vid, pid) => setDraft(d => moveRow(d, baseline, row.id, vid, pid))}
        onRemove={() => setDraft(d => removeRow(d, row.id))}
        onRevert={row._moved || row._added ? () => setDraft(d => revertRow(d, row.id)) : null}
      />
    )
  }

  if (loading) return <p className="text-gray-500">불러오는 중…</p>

  const header = editing ? (
    <div className="sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-3 rounded border border-blue-200 bg-blue-50 px-3 py-2">
      <h2 className="text-lg font-bold">권별 비교</h2>
      <span className="text-sm text-blue-800">편집 중 · 바뀐 작품 {dirtyCount}건</span>
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={cancelEdit}
          className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-600">취소</button>
      </div>
    </div>
  ) : (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
      <h2 className="text-lg font-bold">권별 비교</h2>
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" checked={confirmedOnly} onChange={e => setConfirmedOnly(e.target.checked)} />
        확정만 보기
      </label>
      <span className="flex items-center gap-1 text-xs text-gray-500">
        <EraChip era="고전" /> 고전운문·고전소설·고전수필·고전극
        <EraChip era="현대" /> 시·소설·수필·극본
      </span>
      <span className="text-xs text-gray-400">노란 배경 = 다른 권과 겹치는 작품 · 편수·비율과 겹침은 제외 상태를 뺀 기준</span>
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={enterEdit} disabled={!volumes.length}
          className="rounded border border-blue-300 px-3 py-1 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-40">
          편집
        </button>
        <button
          type="button"
          onClick={() => downloadCompareExcel({ volumes, allVw, allParts, confirmedOnly })}
          disabled={!volumes.length}
          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          엑셀로 저장
        </button>
      </div>
    </div>
  )

  return (
    <div>
      {header}
      <div className="flex items-start gap-4">
        <div className="@container min-w-0 flex-1">
          <SummaryTable columns={columns} />
          <div className="grid gap-4 pb-4 @2xl:grid-cols-2 @4xl:grid-cols-3 @7xl:grid-cols-4">
            {columns.map(({ volume: v, groups, counts }) => {
              const name = `${v.number}권 ${v.title}`
              const meta = [`${totalOf(counts)}편`, eraSummary(counts), v.status].filter(Boolean).join(' · ')
              const hasParts = groups.some(g => g.label)
              const headClass = 'block border-b border-gray-200 bg-gray-50 px-3 py-2 font-semibold'
              const head = <>{name}<span className="ml-2 text-xs font-normal text-gray-500">{meta}</span></>
              return (
                <section key={v.id} aria-label={name} className="rounded border border-gray-200">
                  {editing
                    ? <div className={headClass}>{head}</div>
                    : <Link to={`/volumes/${v.id}`} className={`${headClass} hover:bg-gray-100`}>{head}</Link>}
                  <div className={`max-h-[70vh] overflow-y-auto px-2 pb-2 ${hasParts ? '' : 'pt-2'}`}>
                    {groups.map((g, i) => (
                      <div key={g.part ? g.part.id : `none-${i}`}>
                        {g.label && <PartBand group={g} first={i === 0} />}
                        <ul className="mt-1 space-y-0.5">
                          {g.works.map(w => (
                            <CompareWorkRow
                              key={w.id}
                              row={w}
                              others={(volumesByWork.get(w.work_id) || []).filter(id => id !== v.id).map(id => numberById[id]).sort((a, b) => a - b)}
                              warnings={warnings.get(w.id) || []}
                              fromLabel={fromLabel(w)}
                              trailing={editing ? rowTrailing(w) : null}
                            />
                          ))}
                          {!g.works.length && <li className="py-0.5 text-xs text-gray-300">없음</li>}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
            {!volumes.length && <p className="text-sm text-gray-400">아직 권이 없습니다.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
```

> 메모: `place`는 Task 9(저장 확인 창)에서 쓴다. 이 Task에서 쓰지 않아 린트 경고가 나면 무시해도 된다(다음 Task에서 사용).

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/tests/ComparePageEdit.test.jsx src/tests/ComparePage.test.jsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/board/CompareMoveMenu.jsx src/board/ComparePage.jsx src/tests/ComparePageEdit.test.jsx
git commit -m "feat: 권별 비교 편집 모드 — 메뉴로 옮기기·빼기·되돌리기, 취소·나가기 확인

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 저장 확인 창과 저장 흐름

**Files:**
- Create: `src/board/CompareSaveDialog.jsx`
- Modify: `src/board/ComparePage.jsx`
- Test: `src/tests/ComparePageEdit.test.jsx` (추가)

**Interfaces:**
- Consumes: `describeDraft`(Task 2), `planSave`·`runSave`·`countAttachments`·`attachmentText`·`resultSummary`(Task 3), `WARNING_LABELS`(Task 4), `listAttachmentRefs`·`updateVolumeWork`·`deleteVolumeWork`·`ensureWorkId`·`insertPlacedWork`(volumeApi)
- Produces: `CompareSaveDialog` props `{ items, attachments: Map|null, warnings: Map, saving, onConfirm, onCancel }` (role="dialog", aria-label '저장 확인'). `ComparePage`의 `SaveResult`(role="status").

- [ ] **Step 1: 실패하는 테스트 추가** — `src/tests/ComparePageEdit.test.jsx` 끝에

```jsx
// 확인 창의 저장 버튼은 딸린 자료 조회가 끝나야 켜진다
async function clickSaveIn(confirmBox) {
  const btn = within(confirmBox).getByRole('button', { name: '저장' })
  await waitFor(() => expect(btn).toBeEnabled())
  await userEvent.click(btn)
}

test('저장: 확인 창에 요약·목록·딸린 업무 경고를 보이고, 저장하면 반영한 뒤 결과를 알린다', async () => {
  api.listAttachmentRefs.mockResolvedValue({ tasks: ['d'], comments: [], files: [] })
  renderPage()
  await startEdit()
  let dlg = await openMenu('1권 첫 장면', '소나기')
  await userEvent.selectOptions(within(dlg).getByLabelText('권'), 'v2')
  await userEvent.click(within(dlg).getByRole('button', { name: '옮기기' }))
  dlg = await openMenu('2권 오래 남을', '산유화')
  await userEvent.click(within(dlg).getByRole('button', { name: '권에서 빼기' }))

  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  const confirmBox = await screen.findByRole('dialog', { name: '저장 확인' })
  expect(within(confirmBox).getByText('옮기기 1 · 넣기 0 · 빼기 1')).toBeInTheDocument()
  expect(within(confirmBox).getByText('〈소나기〉 1권 2부 → 2권 2부')).toBeInTheDocument()
  expect(within(confirmBox).getByText('〈산유화〉 2권 1부에서 빼기')).toBeInTheDocument()
  expect(await within(confirmBox).findByText('업무 1건이 함께 지워집니다')).toBeInTheDocument()
  expect(api.listAttachmentRefs).toHaveBeenCalledWith(['d'])

  await clickSaveIn(confirmBox)
  expect(await screen.findByText('반영했습니다: 옮기기 1 · 넣기 0 · 빼기 1')).toBeInTheDocument()
  expect(api.deleteVolumeWork).toHaveBeenCalledWith('d')
  expect(api.updateVolumeWork).toHaveBeenCalledWith('a', { volume_id: 'v2', part_id: 'q2', sort_order: 20 })
  expect(screen.getByRole('button', { name: '편집' })).toBeInTheDocument()
  expect(api.listAllVolumeWorks).toHaveBeenCalledTimes(4) // 처음·편집 시작·저장 직전·저장 뒤
})

test('저장 직전 다시 읽기에 실패하면 편집을 유지한다', async () => {
  renderPage()
  await startEdit()
  await userEvent.click(within(await openMenu('1권 첫 장면', '소나기')).getByRole('button', { name: '권에서 빼기' }))
  api.listAllVolumeWorks.mockRejectedValueOnce(new Error('연결이 끊겼습니다'))
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  await clickSaveIn(await screen.findByRole('dialog', { name: '저장 확인' }))
  expect(await screen.findByText('연결이 끊겼습니다')).toBeInTheDocument()
  expect(screen.getByText('편집 중 · 바뀐 작품 1건')).toBeInTheDocument()
  expect(api.deleteVolumeWork).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/tests/ComparePageEdit.test.jsx`
Expected: FAIL — '저장' 버튼 없음

- [ ] **Step 3: 구현 — `src/board/CompareSaveDialog.jsx`**

```jsx
// 권별 비교 저장 확인 창 (설계 2026-10-02 §3.1): 무엇이 바뀌는지, 빼면 함께 지워지는 것, 경고
import { WARNING_LABELS } from './compareUtils.js'
import { attachmentText } from './compareSave.js'

function lineOf(i) {
  if (i.kind === 'move') return `〈${i.title}〉 ${i.from} → ${i.to}`
  if (i.kind === 'add') return `〈${i.title}〉 → ${i.to} (새로)`
  return `〈${i.title}〉 ${i.from}에서 빼기`
}

export default function CompareSaveDialog({ items, attachments, warnings, saving, onConfirm, onCancel }) {
  const count = kind => items.filter(i => i.kind === kind).length
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div role="dialog" aria-modal="true" aria-label="저장 확인"
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded bg-white p-4 shadow-xl">
        <h3 className="mb-1 font-bold">저장할까요?</h3>
        <p className="mb-3 text-sm text-gray-600">옮기기 {count('move')} · 넣기 {count('add')} · 빼기 {count('remove')}</p>
        <ul className="mb-4 space-y-1 text-sm">
          {items.map(i => {
            const w = warnings.get(i.rowId) || []
            const att = i.kind === 'remove' ? attachmentText(attachments?.get(i.rowId)) : ''
            return (
              <li key={`${i.kind}-${i.rowId}`}>
                <span>{lineOf(i)}</span>
                {w.length > 0 && <span className="ml-1 text-xs text-red-700">⚠ {w.map(k => WARNING_LABELS[k]).join(' · ')}</span>}
                {att && <div className="text-xs text-red-600">{att}</div>}
              </li>
            )
          })}
        </ul>
        {attachments === null && <p className="mb-2 text-xs text-gray-400">딸린 업무·의견·자료를 확인하는 중…</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={saving}
            className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 disabled:opacity-40">돌아가기</button>
          <button type="button" onClick={onConfirm} disabled={saving || attachments === null}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-40">
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 구현 — `src/board/ComparePage.jsx` 수정**

1) import를 바꾼다:

```jsx
import {
  listVolumes, listAllVolumeWorks, listAllParts, listAttachmentRefs,
  updateVolumeWork, deleteVolumeWork, ensureWorkId, insertPlacedWork,
} from './volumeApi.js'
```

```jsx
import {
  EMPTY_DRAFT, changeCount, effectiveRows, moveRow, removeRow, revertRow,
  canPlace, placeErrorText, defaultPartFor, describeDraft,
} from './compareEdit.js'
import { planSave, runSave, countAttachments, resultSummary } from './compareSave.js'
import CompareSaveDialog from './CompareSaveDialog.jsx'
```

2) `const leaveText = ...` 아래에 추가:

```jsx
const SAVE_API = { updateVolumeWork, deleteVolumeWork, ensureWorkId, insertPlacedWork }

function SaveResult({ result, onClose }) {
  return (
    <div role="status" className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm">
      <div className="flex items-center">
        <span className="font-semibold text-green-800">{resultSummary(result)}</span>
        <button type="button" onClick={onClose} className="ml-auto text-xs text-gray-500 underline">닫기</button>
      </div>
      {result.skipped.length > 0 && (
        <ul className="mt-1 text-xs text-gray-600">
          {result.skipped.map((s, i) => <li key={`s${i}`}>건너뜀: 〈{s.title}〉 — {s.reason}</li>)}
        </ul>
      )}
      {result.failed.length > 0 && (
        <ul className="mt-1 text-xs text-red-600">
          {result.failed.map((f, i) => <li key={`f${i}`}>실패: 〈{f.title}〉 — {f.reason}</li>)}
        </ul>
      )}
    </div>
  )
}
```

3) state 추가(`const [draft, ...]` 아래):

```jsx
  const [saveOpen, setSaveOpen] = useState(false)
  const [attachments, setAttachments] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState(null)
```

4) `enterEdit`의 `setDraft(EMPTY_DRAFT)` 다음 줄에 `setSaveResult(null)` 추가. `cancelEdit` 아래에 추가:

```jsx
  async function openSave() {
    setSaveOpen(true)
    setAttachments(null)
    try {
      setAttachments(countAttachments(await listAttachmentRefs(Object.keys(draft.removes))))
    } catch (err) {
      show(err.message)
      setSaveOpen(false)
    }
  }

  // 설계 §3.2: 최신 상태를 다시 읽고 → 계획 → 한 건씩 반영 → 결과 표시 → 새로 읽고 편집 끝
  async function confirmSave() {
    setSaving(true)
    let latestRows
    let latestParts
    try {
      ;[latestRows, latestParts] = await Promise.all([listAllVolumeWorks(), listAllParts()])
    } catch (err) {
      show(err.message) // 편집 내용은 그대로 — 다시 저장할 수 있다
      setSaving(false)
      return
    }
    const plan = planSave({ draft, baseline, latestRows, latestParts })
    const result = await runSave(plan, SAVE_API, { registryMap: new Map() })
    setSaving(false)
    setSaveOpen(false)
    setSaveResult(result)
    finishEdit()
    load().catch(err => show(err.message))
  }
```

> Task 10에서 `registryMap: new Map()`을 `lookup.registryMap`으로 바꾼다(넣기가 생기는 Task). 이 Task까지는 넣기가 없어 registry가 필요 없다.

5) 편집 중 바의 `취소` 버튼 다음에 추가:

```jsx
        <button type="button" onClick={openSave} disabled={!dirtyCount}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-40">저장</button>
```

6) `return (` 안 `{header}` 다음 줄에 `{saveResult && <SaveResult result={saveResult} onClose={() => setSaveResult(null)} />}`를, 맨 바깥 `</div>` 바로 앞에 확인 창을 넣는다:

```jsx
      {saveOpen && (
        <CompareSaveDialog
          items={describeDraft(draft, baseline, place)}
          attachments={attachments}
          warnings={warnings}
          saving={saving}
          onConfirm={confirmSave}
          onCancel={() => setSaveOpen(false)}
        />
      )}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/tests/ComparePageEdit.test.jsx src/tests/ComparePage.test.jsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/board/CompareSaveDialog.jsx src/board/ComparePage.jsx src/tests/ComparePageEdit.test.jsx
git commit -m "feat: 권별 비교 저장 — 확인 창(딸린 업무·의견·자료 경고), 최신 상태 재확인 후 반영·결과 표시

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 오른쪽 '작품 넣기' 패널

**Files:**
- Create: `src/board/CompareSearchPanel.jsx`
- Modify: `src/board/ComparePage.jsx`
- Test: `src/tests/ComparePageEdit.test.jsx` (추가)

**Interfaces:**
- Consumes: `useWorkLookup`·`buildDuplicatesByKey`(Task 6), `SearchPane` 새 props(Task 6), `addWork`(Task 2), `workKeyOf`(workKey), `useWorksData`
- Produces: `CompareSearchPanel` props `{ lookup, duplicatesByKey, renderAction, itemComponent, onClose }` (aside, aria-label '작품 넣기 패널'). `ComparePage`에 `lookup`, `panelOpen`, `duplicatesByKey`, `renderAddAction`, `newTempId`.

- [ ] **Step 1: 실패하는 테스트 추가** — `src/tests/ComparePageEdit.test.jsx` 끝에

```jsx
test('작품 넣기 패널: 미배치 후보가 보이고, 넣기 메뉴로 넣으면 새로 표시되며 저장 때 추가된다', async () => {
  renderPage()
  await startEdit()
  await userEvent.click(screen.getByRole('button', { name: '작품 넣기' }))
  const panel = await screen.findByRole('complementary', { name: '작품 넣기 패널' })
  expect(await within(panel).findByText('돌다리')).toBeInTheDocument()
  expect(within(panel).queryByText('소나기')).not.toBeInTheDocument() // 이미 1권에 있음(미배치만)

  await userEvent.click(within(panel).getByRole('button', { name: '「돌다리」 넣기' }))
  const dlg = screen.getByRole('dialog', { name: '「돌다리」 넣기' })
  await userEvent.selectOptions(within(dlg).getByLabelText('권'), 'v2')
  expect(within(dlg).getByLabelText('부')).toHaveValue('q2')
  await userEvent.click(within(dlg).getByRole('button', { name: '넣기' }))
  expect(within(region('2권 오래 남을')).getByText('돌다리')).toBeInTheDocument()
  expect(within(region('2권 오래 남을')).getByText('새로')).toBeInTheDocument()
  expect(within(panel).queryByText('돌다리')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  const confirmBox = await screen.findByRole('dialog', { name: '저장 확인' })
  expect(within(confirmBox).getByText('〈돌다리〉 → 2권 2부 (새로)')).toBeInTheDocument()
  await clickSaveIn(confirmBox)
  await screen.findByText('반영했습니다: 옮기기 0 · 넣기 1 · 빼기 0')
  expect(api.insertPlacedWork).toHaveBeenCalledWith({
    volumeId: 'v2', workId: 'W9', workSnapshot: { title: '돌다리', author: '이태준', genre: '소설', curriculum: ['4차'] },
    partId: 'q2', batchId: null, sortOrder: 30,
  })
  expect(api.ensureWorkId).not.toHaveBeenCalled()
})

test('작품 데이터를 못 불러오면 패널에 오류와 다시 시도', async () => {
  const retry = vi.fn()
  sheetState.current = { works: [], loading: false, error: '작품 데이터를 불러올 수 없습니다 (HTTP 500)', retry }
  renderPage()
  await startEdit()
  await userEvent.click(screen.getByRole('button', { name: '작품 넣기' }))
  const panel = await screen.findByRole('complementary', { name: '작품 넣기 패널' })
  expect(within(panel).getByText('작품 데이터를 불러올 수 없습니다 (HTTP 500)')).toBeInTheDocument()
  await userEvent.click(within(panel).getByRole('button', { name: '다시 시도' }))
  expect(retry).toHaveBeenCalled()
})
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/tests/ComparePageEdit.test.jsx`
Expected: FAIL — '작품 넣기' 버튼 없음

- [ ] **Step 3: 구현 — `src/board/CompareSearchPanel.jsx`**

```jsx
// 권별 비교 편집 중 오른쪽 '작품 넣기' 패널 (설계 2026-10-02 §2.4): 권 보드의 검색 패널을 그대로 쓴다.
// 시트·registry는 패널을 처음 열 때 불러온다(보기 화면 첫 로딩 속도 유지).
import { useWorksData } from '../works/useWorksData.js'
import SearchPane from './SearchPane.jsx'

export default function CompareSearchPanel({ lookup, duplicatesByKey, renderAction, itemComponent, onClose }) {
  const { works, loading, error, retry } = useWorksData()
  const failed = error || lookup.error
  return (
    <aside aria-label="작품 넣기 패널"
      className="sticky top-16 flex h-[calc(100vh-10rem)] w-80 shrink-0 flex-col rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center">
        <h3 className="font-semibold">작품 넣기</h3>
        <button type="button" aria-label="작품 넣기 닫기" onClick={onClose}
          className="ml-auto rounded px-1.5 text-gray-400 hover:bg-gray-100">✕</button>
      </div>
      {failed ? (
        <div className="text-sm">
          <p className="mb-2 text-red-600">{failed}</p>
          <button type="button"
            onClick={() => { if (error) retry(); if (lookup.error) lookup.refresh() }}
            className="rounded border px-3 py-1">다시 시도</button>
        </div>
      ) : loading || !lookup.loaded ? (
        <p className="text-sm text-gray-400">작품 데이터 불러오는 중…</p>
      ) : (
        <div className="min-h-0 flex-1">
          <SearchPane
            works={works}
            duplicatesByKey={duplicatesByKey}
            pickKeys={lookup.pickKeys}
            defaultOnlyUnplaced
            renderAction={renderAction}
            itemComponent={itemComponent}
          />
        </div>
      )}
    </aside>
  )
}
```

- [ ] **Step 4: 구현 — `src/board/ComparePage.jsx` 수정**

1) import 추가·변경:

```jsx
import {
  EMPTY_DRAFT, changeCount, effectiveRows, moveRow, removeRow, revertRow, addWork,
  canPlace, placeErrorText, defaultPartFor, describeDraft,
} from './compareEdit.js'
import { useWorkLookup, buildDuplicatesByKey } from './useWorkLookup.js'
import { workKeyOf } from '../works/workKey.js'
import CompareSearchPanel from './CompareSearchPanel.jsx'
```

2) `const SAVE_API = ...` 위에 추가:

```jsx
let tempSeq = 0
const newTempId = () => `new-${++tempSeq}`
```

3) state·훅 추가(`saveResult` state 아래):

```jsx
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelUsed, setPanelUsed] = useState(false)
```

`const { show } = useToast()` 아래:

```jsx
  const lookup = useWorkLookup(panelUsed)
```

`columns` useMemo 아래:

```jsx
  const duplicatesByKey = useMemo(
    () => buildDuplicatesByKey(lookup.registry, rows, id => numberById[id]),
    [lookup.registry, rows, numberById],
  )
```

4) `finishEdit`에 `setPanelOpen(false)` 추가. `confirmSave`의 `runSave(plan, SAVE_API, { registryMap: new Map() })`를 `runSave(plan, SAVE_API, { registryMap: lookup.registryMap })`로, `finishEdit()` 다음 줄에 `lookup.refresh()` 추가(새로 등록된 작품을 registry에 반영).

5) `rowTrailing` 위에 추가:

```jsx
  function togglePanel() {
    setPanelOpen(o => !o)
    setPanelUsed(true)
  }

  const renderAddAction = (work, getCurricula) => {
    const key = workKeyOf(work)
    const workId = lookup.registryMap.get(key) ?? null
    return (
      <CompareMoveMenu
        label={`「${work['작품명']}」 넣기`}
        triggerText="넣기"
        triggerClass="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white"
        volumes={volumes}
        partsByVolume={partsByVolume}
        initialVolumeId=""
        initialPartFor={vid => partFor(work['장르'], vid)}
        blockedText={vid => blockedFor({ workId, key }, vid)}
        confirmText="넣기"
        onConfirm={(vid, pid) => setDraft(d => addWork(d, {
          tempId: newTempId(), workId, key, work, curricula: getCurricula(), volumeId: vid, partId: pid,
        }))}
      />
    )
  }
```

6) 편집 중 바의 `취소` 버튼 앞에 추가:

```jsx
        <button type="button" onClick={togglePanel} aria-pressed={panelOpen}
          className={`rounded border px-3 py-1 text-sm ${panelOpen ? 'border-blue-600 bg-blue-600 text-white' : 'border-blue-300 bg-white text-blue-700'}`}>
          작품 넣기
        </button>
```

7) `<div className="flex items-start gap-4">` 안, `@container` div가 닫힌 직후에 패널:

```jsx
        {editing && panelOpen && (
          <CompareSearchPanel
            lookup={lookup}
            duplicatesByKey={duplicatesByKey}
            renderAction={renderAddAction}
            onClose={() => setPanelOpen(false)}
          />
        )}
```

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/tests/ComparePageEdit.test.jsx src/tests/ComparePage.test.jsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/board/CompareSearchPanel.jsx src/board/ComparePage.jsx src/tests/ComparePageEdit.test.jsx
git commit -m "feat: 권별 비교 편집 중 오른쪽 '작품 넣기' 패널(미배치 후보 기본, 넣기 메뉴)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: 끌어다 놓기 (@dnd-kit/core)

**Files:**
- Modify: `package.json`, `package-lock.json` (의존성)
- Create: `src/board/CompareDnd.jsx`
- Modify: `src/board/ComparePage.jsx`
- Test: `src/tests/ComparePageEdit.test.jsx` (추가)

**Interfaces:**
- Consumes: `resolveDrop`·`toDropActive`(Task 2), `CompareWorkRow`(Task 7), `SearchPane` `itemComponent`(Task 6)
- Produces: `CompareDnd.jsx` named exports `DraggableWorkRow`(CompareWorkRow + 손잡이, 끌기 데이터 `{ type:'row', rowId, title }`), `DraggableSheetItem`(itemComponent, 끌기 데이터 `{ type:'sheet', key, work, getCurricula, title }`), `DropZone`(놓을 곳 데이터 `{ volumeId, partId }`)

- [ ] **Step 1: 의존성 설치**

Run: `npm install @dnd-kit/core@^6.3.1`
Expected: `package.json` dependencies에 `"@dnd-kit/core": "^6.3.1"` 추가

- [ ] **Step 2: 실패하는 테스트 추가** — `src/tests/ComparePageEdit.test.jsx` 끝에

```jsx
test('편집 중에는 작품마다 끌기 손잡이가 있고, 뺀 작품과 보기 모드에는 없다', async () => {
  renderPage()
  await screen.findByText('1권 첫 장면')
  expect(screen.queryAllByRole('button', { name: /끌기$/ })).toHaveLength(0)
  await startEdit()
  expect(screen.getAllByRole('button', { name: /끌기$/ })).toHaveLength(4)
  await userEvent.click(within(await openMenu('1권 첫 장면', '소나기')).getByRole('button', { name: '권에서 빼기' }))
  expect(screen.getAllByRole('button', { name: /끌기$/ })).toHaveLength(3)
})

test('검색 패널 결과에도 끌기 손잡이가 있다', async () => {
  renderPage()
  await startEdit()
  await userEvent.click(screen.getByRole('button', { name: '작품 넣기' }))
  const panel = await screen.findByRole('complementary', { name: '작품 넣기 패널' })
  expect(await within(panel).findByRole('button', { name: '「돌다리」 끌기' })).toBeInTheDocument()
})
```

(놓기 결과 판단은 Task 2의 `resolveDrop`·`toDropActive` 테스트가 맡는다 — jsdom에서는 포인터 끌기 좌표가 0이라 실제 끌기를 흉내 내지 않는다.)

- [ ] **Step 3: 실패 확인**

Run: `npx vitest run src/tests/ComparePageEdit.test.jsx`
Expected: FAIL — 끌기 손잡이 없음

- [ ] **Step 4: 구현 — `src/board/CompareDnd.jsx`**

```jsx
// 권별 비교 끌어다 놓기 부품 (@dnd-kit/core, 2026-10-02): 작품 줄·검색 결과는 손잡이(⋮⋮)로 끌고, 부 그룹에 놓는다.
import { useDraggable, useDroppable } from '@dnd-kit/core'
import CompareWorkRow from './CompareWorkRow.jsx'

function Handle({ label, listeners, attributes }) {
  return (
    <button type="button" aria-label={label} {...attributes} {...listeners}
      className="shrink-0 cursor-grab touch-none px-0.5 text-gray-400 hover:text-gray-700">⋮⋮</button>
  )
}

export function DraggableWorkRow({ row, ...rest }) {
  const title = row.work_snapshot?.title
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `row:${row.id}`,
    data: { type: 'row', rowId: row.id, title },
  })
  return (
    <CompareWorkRow ref={setNodeRef} row={row} dragging={isDragging}
      leading={<Handle label={`「${title}」 끌기`} listeners={listeners} attributes={attributes} />} {...rest} />
  )
}

// SearchPane의 itemComponent로 쓴다
export function DraggableSheetItem({ itemKey, work, getCurricula, className, children }) {
  const title = work['작품명']
  const { setNodeRef, listeners, attributes } = useDraggable({
    id: `sheet:${itemKey}`,
    data: { type: 'sheet', key: itemKey, work, getCurricula, title },
  })
  return (
    <li ref={setNodeRef} className={className}>
      <Handle label={`「${title}」 끌기`} listeners={listeners} attributes={attributes} />
      {children}
    </li>
  )
}

export function DropZone({ volumeId, partId, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${volumeId}:${partId ?? 'none'}`, data: { volumeId, partId } })
  return <div ref={setNodeRef} className={`rounded ${isOver ? 'bg-blue-50 ring-2 ring-blue-300' : ''}`}>{children}</div>
}
```

- [ ] **Step 5: 구현 — `src/board/ComparePage.jsx` 수정**

1) import 추가·변경:

```jsx
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
```

```jsx
import {
  EMPTY_DRAFT, changeCount, effectiveRows, moveRow, removeRow, revertRow, addWork,
  canPlace, placeErrorText, defaultPartFor, describeDraft, resolveDrop, toDropActive,
} from './compareEdit.js'
import { DraggableWorkRow, DraggableSheetItem, DropZone } from './CompareDnd.jsx'
```

2) state·센서 추가(`panelUsed` state 아래):

```jsx
  const [dragging, setDragging] = useState(null)
  const [overVolumeId, setOverVolumeId] = useState(null)
```

`const lookup = useWorkLookup(panelUsed)` 아래:

```jsx
  // 클릭(⋯·넣기 버튼)과 끌기를 구분하려고 5px 이상 움직여야 끌기 시작
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
```

3) `renderAddAction` 위에 끌기 처리 추가:

```jsx
  function handleDragStart({ active }) {
    setDragging(active.data.current)
  }
  function handleDragOver({ over }) {
    setOverVolumeId(over?.data.current?.volumeId ?? null)
  }
  function handleDragEnd({ active, over }) {
    setDragging(null)
    setOverVolumeId(null)
    const data = active?.data.current
    const target = over?.data.current
    if (!data || !target) return
    const { draft: next, error } = resolveDrop({
      draft, baseline, active: toDropActive(data, lookup.registryMap), over: target,
      volumeNumberOf: id => numberById[id], newTempId,
    })
    if (error) show(error)
    else setDraft(next)
  }
  function handleDragCancel() {
    setDragging(null)
    setOverVolumeId(null)
  }

  // 끄는 작품이 놓일 수 없는 권이면 그 권 테두리를 빨갛게
  const dragRef = (() => {
    if (!dragging) return null
    if (dragging.type === 'sheet') return { workId: lookup.registryMap.get(dragging.key) ?? null, key: dragging.key }
    const r = rows.find(x => x.id === dragging.rowId)
    return r ? { workId: r.work_id, key: r._key, selfId: r.id } : null
  })()
```

4) 렌더 바꾸기:
- 맨 바깥 `<div>` … `</div>`를 `<DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>` … `</DndContext>`로 바꾼다.
- `<section ...>`의 className을:

```jsx
              const invalid = !!dragRef && overVolumeId === v.id && !!blockedFor(dragRef, v.id)
```
(`const headClass` 위에 추가)
```jsx
                <section key={v.id} aria-label={name}
                  className={`rounded border ${invalid ? 'border-red-400 ring-2 ring-red-300' : 'border-gray-200'}`}>
```

- 부 그룹 렌더(`{groups.map((g, i) => ( <div key=...> ... </div> ))}`)를 아래로 바꾼다 — 편집 중엔 부 그룹(부가 없는 권은 목록 전체)이 놓을 곳, 미배정 그룹은 놓을 곳 아님, 뺀 행 외에는 손잡이 있는 줄:

```jsx
                    {groups.map((g, i) => {
                      const key = g.part ? g.part.id : `none-${i}`
                      const body = (
                        <>
                          {g.label && <PartBand group={g} first={i === 0} />}
                          <ul className="mt-1 space-y-0.5">
                            {g.works.map(w => {
                              const others = (volumesByWork.get(w.work_id) || []).filter(id => id !== v.id).map(id => numberById[id]).sort((a, b) => a - b)
                              const rowProps = {
                                row: w, others, warnings: warnings.get(w.id) || [],
                                fromLabel: fromLabel(w), trailing: editing ? rowTrailing(w) : null,
                              }
                              return editing && !w._removed
                                ? <DraggableWorkRow key={w.id} {...rowProps} />
                                : <CompareWorkRow key={w.id} {...rowProps} />
                            })}
                            {!g.works.length && <li className="py-0.5 text-xs text-gray-300">없음</li>}
                          </ul>
                        </>
                      )
                      return editing && (g.part || !hasParts)
                        ? <DropZone key={key} volumeId={v.id} partId={g.part?.id ?? null}>{body}</DropZone>
                        : <div key={key}>{body}</div>
                    })}
```

- `CompareSearchPanel`에 `itemComponent={DraggableSheetItem}` prop 추가.
- `{saveOpen && (...)}` 앞에 끄는 중 표시:

```jsx
      <DragOverlay>
        {dragging && (
          <div className="rounded border border-blue-300 bg-white px-2 py-1 text-sm shadow-lg">{dragging.title}</div>
        )}
      </DragOverlay>
```

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run src/tests/ComparePageEdit.test.jsx src/tests/ComparePage.test.jsx src/tests/compareEdit.test.js`
Expected: PASS

jsdom에는 `ResizeObserver`가 없다. 테스트가 `ResizeObserver is not defined`로 실패하면 `src/tests/setup.js` 끝에 아래를 추가하고 다시 실행한다(그 경우 Step 7 커밋에 `src/tests/setup.js`도 포함):

```js
// jsdom에 없는 ResizeObserver — @dnd-kit 측정용 (2026-10-02)
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
}
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/board/CompareDnd.jsx src/board/ComparePage.jsx src/tests/ComparePageEdit.test.jsx
git commit -m "feat: 권별 비교 끌어다 놓기(@dnd-kit) — 작품 줄·검색 결과를 부에 놓아 옮기기·넣기

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 전체 검증·화면 확인·병합·배포

**Files:** (임시 확인 파일은 만들었다 지운다)

- [ ] **Step 1: 전체 테스트**

Run: `npx vitest run`
Expected: 모두 PASS (217 + 이번에 추가한 약 40건)

- [ ] **Step 2: 빌드**

Run: `npm run build`
Expected: 오류 없음

- [ ] **Step 3: 운영 데이터 모양으로 화면 확인 (로그인 없이)**

기존에 통한 방식(메모리: 루트에 임시 html을 두고 fetch를 가로채 가짜 데이터로 ComparePage만 렌더 → 확인 후 삭제)을 쓴다.
1. MCP `execute_sql`로 운영 `volumes`·`volume_parts`·`volume_works`(`listAllVolumeWorks`와 같은 열) 를 JSON으로 받아 `compare-preview-data.json`(루트, 커밋 안 함)에 저장.
2. 루트에 `compare-preview.html` + `src/compare-preview.jsx`를 만든다: `window.fetch`를 감싸 `/rest/v1/volumes`·`/rest/v1/volume_parts`·`/rest/v1/volume_works`·`/rest/v1/works_registry`·`/rest/v1/genre_picks` 요청에 JSON 파일 내용을 돌려주고(PATCH·DELETE·POST는 받은 내용을 콘솔에 찍고 빈 응답), `createMemoryRouter([{ path: '/', element: <ToastProvider><ComparePage /></ToastProvider> }])`를 렌더.
3. `.claude/launch.json`의 dev 서버로 `preview_start` → `/compare-preview.html` 열기.
4. 확인 목록: 보기 모드 경고 뱃지 위치, 편집 → ⋯ 메뉴로 옮기기, 작품 넣기 패널이 열릴 때 격자 열 수 줄어듦(창 1366px·1920px), 끌어다 놓기(다른 권 부·같은 작품 있는 권 빨간 테두리), 저장 확인 창, 저장 시 콘솔에 찍힌 PATCH/DELETE/POST 본문.
5. 스크린샷을 사용자에게 보낸다.
6. 임시 파일 삭제: `compare-preview.html`, `src/compare-preview.jsx`, `compare-preview-data.json`. `git status`로 남은 것이 없는지 확인.

- [ ] **Step 4: 병합·배포**

```bash
git checkout master
git merge --no-ff compare-edit -m "Merge branch 'compare-edit': 권별 비교에서 넣기·빼기·옮기기

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin master
```

GitHub Actions 배포가 끝나면 운영 사이트(https://merciybr-cmyk.github.io/series-dashboard/#/compare)에서 사용자가 확인.

- [ ] **Step 5: 메모리 갱신**

`series-dashboard-project.md`에 진행 상태(병합 커밋, 테스트 수, 사용자 확인 대기)를 적는다.
