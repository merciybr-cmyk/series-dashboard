# 2b단계: 부(部) 관리 + 권 수정·삭제 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 권을 수정·삭제할 수 있게 하고, 권 안에 부(1부/2부/3부…)를 만들어 부를 선택한 상태로 후보작을 선정하며, 수록 목록을 부별 그룹으로 보게 한다.

**Architecture:** 스키마는 이미 배포됨(volume_parts 테이블 + volume_works.part_id, Realtime 발행 포함) — 이번 단계는 API 계층 확장 → 훅 확장 → UI 3곳(권 목록, 보드 헤더/탭, 수록 목록·패널) 순의 순수 프런트 작업. 기존 파일의 최소 수정 + 새 컴포넌트 2개.

**Tech Stack:** 기존과 동일 (React 19, supabase-js 2, Vitest 4).

**Spec:** [2026-08-13-series-dashboard-design-v2.md](../specs/2026-08-13-series-dashboard-design-v2.md) §4 volume_parts, §5.1 (부 흐름), §10 2b행

## Global Constraints

- 부는 선택적: 부가 없는 권은 기존과 완전히 동일하게 동작해야 한다 (설계 §4)
- 부 제목은 nullable — 비어 있으면 "N부"로 표시, 있으면 "N부 제목" (설계 §4, `partLabel`)
- 부 삭제 시 소속 작품은 미배정(part_id null)으로 돌아간다 — DB가 on delete set null로 보장, 화면도 즉시 반영 (설계 §4)
- 부를 선택한 상태에서 작품 추가 → 해당 부로 배정, 전체/미배정 탭에서 추가 → 미배정 (설계 §5.1)
- 권 삭제는 확인 창 필수, 문구에 수록 목록·업무가 함께 삭제됨을 명시 (설계 §10 2b행)
- `created_by`/`updated_by`는 트리거 담당 — 클라이언트에서 보내지 않는다
- 기존 테스트 52건을 깨지 않는다. TDD. 한국어 문구. 커밋 접두사 `feat:`/`test:`
- 이번 단계에서 하지 않는 것: 부 순서 변경 UI(번호순 고정), 부 간 작품 드래그 이동(패널의 부 select로 대체), 홈 화면(3단계)

## 파일 구조

```
수정: src/board/volumeApi.js        # deleteVolume + parts CRUD + getBoard·subscribeBoard 확장
수정: src/board/boardUtils.js       # partLabel, nextPartNumber, groupByPart
수정: src/board/useVolumeBoard.js   # parts 상태 + addPart/renamePart/removePart 액션
수정: src/board/VolumesPage.jsx     # 권 수정(인라인)·삭제
생성: src/board/PartControls.jsx    # 부 탭(전체/N부/미배정) + 부 관리 팝오버(추가·이름변경·삭제)
수정: src/board/VolumeWorkList.jsx  # 부별 그룹 헤더 렌더링 (groups prop)
수정: src/board/WorkDetailPanel.jsx # 선정 섹션에 부 지정 select
수정: src/board/VolumeBoardPage.jsx # activePart 상태 배선, 추가 시 part_id 전달
테스트: 각 수정·생성 파일에 대응하는 신규 테스트 + 기존 테스트 소폭 갱신
```

---

### Task 1: volumeApi 확장 (deleteVolume + 부 CRUD + 보드 로드·구독)

**Files:**
- Modify: `src/board/volumeApi.js`
- Test: `src/tests/volumeApi.test.js` (테스트 추가)

**Interfaces:**
- Consumes: 기존 `unwrap`, `supabase`
- Produces (신규):
  - `deleteVolume(id) → void`
  - `createPart(volumeId, number) → part` — sort_order는 `number * 10`
  - `updatePart(id, patch) → part`
  - `deletePart(id) → void`
  - `getBoard(volumeId)` 반환에 `parts` 추가 → `{volume, parts, works, tasks}` (parts는 number 오름차순)
  - `subscribeBoard`가 `volume_parts` 변경도 구독
  - `addWorkToVolume({..., partId})` — insert에 `part_id: partId ?? null` 포함

- [ ] **Step 1: 실패하는 테스트 추가** — `src/tests/volumeApi.test.js` 끝에:

```js
test('createPart: 번호 기반 sort_order로 insert한다', async () => {
  fromResults.push({ data: { id: 'p1', number: 2, sort_order: 20 }, error: null })
  const part = await api.createPart('v1', 2)
  expect(part.number).toBe(2)
  expect(mockSupabase.from).toHaveBeenCalledWith('volume_parts')
})

test('addWorkToVolume: partId를 part_id로 넘긴다 (미지정이면 null)', async () => {
  fromResults.push({ data: { work_id: 'W000001' }, error: null }) // registry insert
  fromResults.push({ data: { id: 'vw1', part_id: 'p1' }, error: null }) // volume_works insert
  const row = await api.addWorkToVolume({
    volumeId: 'v1', work: WORK, curricula: [], registryMap: new Map(), sortOrder: 10, partId: 'p1',
  })
  expect(row.part_id).toBe('p1')
})

test('deleteVolume/deletePart/updatePart가 존재한다', () => {
  expect(typeof api.deleteVolume).toBe('function')
  expect(typeof api.deletePart).toBe('function')
  expect(typeof api.updatePart).toBe('function')
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- src/tests/volumeApi.test.js` / Expected: FAIL

- [ ] **Step 3: 구현** — `src/board/volumeApi.js` 수정:

`getBoard`의 works 조회 앞에 parts 조회 추가, 반환 확장:

```js
export async function getBoard(volumeId) {
  const volume = unwrap(await supabase.from('volumes').select('*').eq('id', volumeId).single())
  const parts = unwrap(
    await supabase.from('volume_parts').select('*').eq('volume_id', volumeId).order('number'),
  )
  const works = unwrap(
    await supabase.from('volume_works').select('*').eq('volume_id', volumeId).order('sort_order'),
  )
  const ids = works.map(w => w.id)
  const tasks = ids.length
    ? unwrap(await supabase.from('work_tasks').select('*').in('volume_work_id', ids).order('sort_order'))
    : []
  return { volume, parts, works, tasks }
}
```

`addWorkToVolume` 시그니처·insert 수정 (part_id 한 줄 추가):

```js
export async function addWorkToVolume({ volumeId, work, curricula, registryMap, sortOrder, partId }) {
  const workId = await ensureWorkId(work, curricula, registryMap)
  const { data, error } = await supabase.from('volume_works').insert({
    volume_id: volumeId,
    work_id: workId,
    work_snapshot: snapshotOf(work, curricula),
    sort_order: sortOrder,
    part_id: partId ?? null,
  }).select().single()
  if (error) {
    if (error.code === '23505') throw new Error('이미 이 권에 있는 작품입니다')
    throw new Error(error.message)
  }
  return data
}
```

volumes 영역에 추가:

```js
export async function deleteVolume(id) {
  unwrap(await supabase.from('volumes').delete().eq('id', id))
}
```

parts CRUD 섹션 신설 (volume_works 섹션 앞):

```js
// ---------- volume_parts (부) ----------

export async function createPart(volumeId, number) {
  return unwrap(
    await supabase.from('volume_parts')
      .insert({ volume_id: volumeId, number, sort_order: number * 10 })
      .select().single(),
  )
}

export async function updatePart(id, patch) {
  return unwrap(await supabase.from('volume_parts').update(patch).eq('id', id).select().single())
}

export async function deletePart(id) {
  unwrap(await supabase.from('volume_parts').delete().eq('id', id))
}
```

`subscribeBoard`에 구독 한 줄 추가:

```js
    .on('postgres_changes', { event: '*', schema: 'public', table: 'volume_parts' }, onChange)
```

- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: 전부 PASS (getBoard 기존 사용처는 parts 필드 추가에 영향 없음 — 반환 객체 확장은 하위 호환)

주의: `src/tests/useVolumeBoard.test.jsx`와 `src/tests/VolumeBoardPage.test.jsx`의 getBoard 목이 `{volume, works, tasks}`만 반환한다 — `parts` 미정의로 훅이 깨지지 않는지 확인하고, 깨지면 **이 Task에서 목 반환값에 `parts: []`를 추가**한다 (Task 3에서 어차피 갱신됨).

- [ ] **Step 5: Commit**

```bash
git add src/board/volumeApi.js src/tests/volumeApi.test.js src/tests/useVolumeBoard.test.jsx src/tests/VolumeBoardPage.test.jsx
git commit -m "feat: volumeApi에 권 삭제·부 CRUD·부 배정 추가"
```

---

### Task 2: boardUtils에 부 유틸 3종

**Files:**
- Modify: `src/board/boardUtils.js`
- Test: `src/tests/boardUtils.test.js` (테스트 추가)

**Interfaces:**
- Produces:
  - `partLabel(part) → string` — title 있으면 `"1부 현대시"`, 없으면 `"1부"`
  - `nextPartNumber(parts) → number` — max(number)+1, 빈 배열이면 1
  - `groupByPart(works, parts) → [{part: part|null, works: work[]}]` — parts 없으면 `[{part: null, works}]` 단일 그룹. parts 있으면 번호순 그룹 + (미배정 작품이 있을 때만) 마지막에 `{part: null}` 그룹. **부에 작품이 없어도 그룹은 표시**(빈 부에 추가하는 흐름 안내를 위해)

- [ ] **Step 1: 실패하는 테스트 추가** — `src/tests/boardUtils.test.js` 끝에:

```js
import { partLabel, nextPartNumber, groupByPart } from '../board/boardUtils.js'

test('partLabel: 제목 유무에 따라', () => {
  expect(partLabel({ number: 1, title: null })).toBe('1부')
  expect(partLabel({ number: 2, title: '현대시' })).toBe('2부 현대시')
})

test('nextPartNumber', () => {
  expect(nextPartNumber([])).toBe(1)
  expect(nextPartNumber([{ number: 1 }, { number: 3 }])).toBe(4)
})

test('groupByPart: 부 없으면 단일 그룹, 있으면 부별+미배정', () => {
  const works = [
    { id: 'a', part_id: 'p1' }, { id: 'b', part_id: null }, { id: 'c', part_id: 'p1' },
  ]
  expect(groupByPart(works, [])).toEqual([{ part: null, works }])
  const p1 = { id: 'p1', number: 1, title: null }
  const p2 = { id: 'p2', number: 2, title: null }
  const groups = groupByPart(works, [p1, p2])
  expect(groups).toHaveLength(3) // 1부, 2부(빈 그룹 유지), 미배정
  expect(groups[0].works.map(w => w.id)).toEqual(['a', 'c'])
  expect(groups[1].works).toEqual([])
  expect(groups[2].part).toBeNull()
  expect(groups[2].works.map(w => w.id)).toEqual(['b'])
})

test('groupByPart: 미배정 작품이 없으면 미배정 그룹 생략', () => {
  const groups = groupByPart([{ id: 'a', part_id: 'p1' }], [{ id: 'p1', number: 1 }])
  expect(groups).toHaveLength(1)
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- src/tests/boardUtils.test.js` / Expected: FAIL

- [ ] **Step 3: 구현** — `src/board/boardUtils.js` 끝에 추가:

```js
// ---------- 부(部) 유틸 (설계 §4 volume_parts) ----------

export function partLabel(part) {
  return part.title ? `${part.number}부 ${part.title}` : `${part.number}부`
}

export function nextPartNumber(parts) {
  if (!parts.length) return 1
  return Math.max(...parts.map(p => p.number)) + 1
}

// 부가 없으면 단일 그룹. 있으면 번호순 부 그룹(빈 부 포함) + 미배정 그룹(해당 작품 있을 때만).
export function groupByPart(works, parts) {
  if (!parts.length) return [{ part: null, works }]
  const byId = new Map(parts.map(p => [p.id, []]))
  const unassigned = []
  for (const w of works) {
    if (byId.has(w.part_id)) byId.get(w.part_id).push(w)
    else unassigned.push(w)
  }
  const groups = parts.map(p => ({ part: p, works: byId.get(p.id) }))
  if (unassigned.length) groups.push({ part: null, works: unassigned })
  return groups
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/boardUtils.js src/tests/boardUtils.test.js
git commit -m "feat: 부 라벨·번호·그룹핑 유틸"
```

---

### Task 3: useVolumeBoard 확장 (parts 상태 + 부 액션)

**Files:**
- Modify: `src/board/useVolumeBoard.js`
- Test: `src/tests/useVolumeBoard.test.jsx` (목·테스트 추가)

**Interfaces:**
- Consumes: Task 1의 `createPart`/`updatePart`/`deletePart`, Task 2의 `nextPartNumber`
- Produces: 반환 객체에 `parts` 추가. actions에 추가:
  - `addPart()` — nextPartNumber로 번호 자동, 성공 시 parts에 push(번호순 정렬 유지)
  - `renamePart(id, title)` — 빈 문자열이면 null로 저장
  - `removePart(id)` — 삭제 후 parts에서 제거 + **works의 해당 part_id를 null로 로컬 패치**
  - `addWork(work, curricula, registryMap, partId)` — partId 전달 (기존 3인자 호출은 partId undefined → null 배정)

- [ ] **Step 1: 실패하는 테스트 추가** — `src/tests/useVolumeBoard.test.jsx`:

목 확장 — `vi.mock('../board/volumeApi.js', ...)` 팩토리에 `createPart: vi.fn(), updatePart: vi.fn(), deletePart: vi.fn()` 추가, `BOARD`에 `parts: []` 필드 추가. Probe에 부 개수 표시와 버튼 추가:

```jsx
// Probe 컴포넌트를 다음으로 교체
function Probe() {
  const { volume, works, tasksByVw, parts, loading, actions } = useVolumeBoard('v1')
  if (loading) return <div>로딩</div>
  return (
    <div>
      <div>권:{volume.number} 작품수:{works.length} vw1업무:{(tasksByVw.vw1 || []).length} 부:{parts.length}</div>
      <button onClick={() => actions.setTask('t1', { status: 'done' })}>완료</button>
      <button onClick={() => actions.addPart()}>부추가</button>
      <button onClick={() => actions.removePart('p1')}>부삭제</button>
    </div>
  )
}
```

기존 테스트의 기대 문자열을 `'권:3 작품수:1 vw1업무:1 부:0'`으로 갱신. 신규 테스트:

```jsx
test('addPart: 다음 번호로 생성해 parts에 반영한다', async () => {
  api.getBoard.mockResolvedValue({ ...BOARD, parts: [{ id: 'p1', number: 1, title: null }] })
  api.createPart.mockResolvedValue({ id: 'p2', number: 2, title: null })
  renderProbe()
  await waitFor(() => screen.getByText(/부:1/))
  await act(() => screen.getByText('부추가').click())
  expect(api.createPart).toHaveBeenCalledWith('v1', 2)
  await waitFor(() => expect(screen.getByText(/부:2/)).toBeInTheDocument())
})

test('removePart: 부 삭제 시 소속 작품이 미배정으로 패치된다', async () => {
  api.getBoard.mockResolvedValue({
    ...BOARD,
    parts: [{ id: 'p1', number: 1, title: null }],
    works: [{ ...BOARD.works[0], part_id: 'p1' }],
  })
  api.deletePart.mockResolvedValue()
  renderProbe()
  await waitFor(() => screen.getByText(/부:1/))
  await act(() => screen.getByText('부삭제').click())
  expect(api.deletePart).toHaveBeenCalledWith('p1')
  await waitFor(() => expect(screen.getByText(/부:0/)).toBeInTheDocument())
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- src/tests/useVolumeBoard.test.jsx` / Expected: FAIL

- [ ] **Step 3: 구현** — `src/board/useVolumeBoard.js` 수정:

- import에 `nextPartNumber` 추가: `import { nextSortOrder, swapPlan, nextPartNumber } from './boardUtils.js'`
- 상태 추가: `const [parts, setParts] = useState([])`
- `reload` 내부: `setParts(board.parts)` 추가 (setVolume 다음 줄)
- `addWork`의 시그니처를 `(work, curricula, registryMap, partId)`로, api 호출에 `partId` 전달
- actions에 추가 (removeTask 다음):

```js
    addPart: () => guard(async () => {
      const part = await api.createPart(volumeId, nextPartNumber(parts))
      setParts(ps => [...ps, part].sort((a, b) => a.number - b.number))
      return part
    }),

    renamePart: (id, title) => guard(async () => {
      const part = await api.updatePart(id, { title: title.trim() || null })
      setParts(ps => ps.map(p => (p.id === id ? part : p)))
      return part
    }),

    removePart: id => guard(async () => {
      await api.deletePart(id)
      setParts(ps => ps.filter(p => p.id !== id))
      setWorks(ws => ws.map(w => (w.part_id === id ? { ...w, part_id: null } : w)))
    }),
```

- actions useMemo 의존성 배열에 `parts` 추가
- 반환 객체에 `parts` 추가

- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/useVolumeBoard.js src/tests/useVolumeBoard.test.jsx
git commit -m "feat: useVolumeBoard에 부 상태·액션 추가"
```

---

### Task 4: VolumesPage 권 수정·삭제

**Files:**
- Modify: `src/board/VolumesPage.jsx`
- Test: `src/tests/VolumesPage.test.jsx` (목·테스트 추가)

**Interfaces:**
- Consumes: Task 1의 `updateVolume`, `deleteVolume` (기존 `listVolumes`, `createVolume`과 동일 모듈)
- Produces: 권 카드에 [수정] [삭제] 버튼. 수정 → 카드가 인라인 폼(번호·주제명·저장·취소)으로 전환. 삭제 → `window.confirm('N권과 수록 목록·업무가 함께 삭제됩니다. 계속할까요? (변경 이력은 남습니다)')` 후 목록에서 제거.

- [ ] **Step 1: 실패하는 테스트 추가** — `src/tests/VolumesPage.test.jsx`: 목 팩토리에 `updateVolume: vi.fn(), deleteVolume: vi.fn()` 추가 후 테스트 추가:

```jsx
test('권을 인라인으로 수정한다', async () => {
  api.listVolumes.mockResolvedValue([{ id: 'v1', number: 1, title: '가족', status: '기획' }])
  api.updateVolume.mockResolvedValue({ id: 'v1', number: 1, title: '다양한 삶의 모습', status: '기획' })
  renderPage()
  await waitFor(() => screen.getByText('가족'))
  await userEvent.click(screen.getByRole('button', { name: '수정' }))
  const titleInput = screen.getByLabelText('주제명 수정')
  await userEvent.clear(titleInput)
  await userEvent.type(titleInput, '다양한 삶의 모습')
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  expect(api.updateVolume).toHaveBeenCalledWith('v1', { number: 1, title: '다양한 삶의 모습' })
  await waitFor(() => expect(screen.getByText('다양한 삶의 모습')).toBeInTheDocument())
})

test('권 삭제는 확인 후 목록에서 제거한다', async () => {
  api.listVolumes.mockResolvedValue([{ id: 'v1', number: 1, title: '가족', status: '기획' }])
  api.deleteVolume.mockResolvedValue()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderPage()
  await waitFor(() => screen.getByText('가족'))
  await userEvent.click(screen.getByRole('button', { name: '삭제' }))
  expect(window.confirm).toHaveBeenCalled()
  expect(api.deleteVolume).toHaveBeenCalledWith('v1')
  await waitFor(() => expect(screen.queryByText('가족')).not.toBeInTheDocument())
  window.confirm.mockRestore()
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- src/tests/VolumesPage.test.jsx` / Expected: FAIL

- [ ] **Step 3: 구현** — `src/board/VolumesPage.jsx`:

import를 `import { listVolumes, createVolume, updateVolume, deleteVolume } from './volumeApi.js'`로 확장. 상태 추가: `const [editingId, setEditingId] = useState(null)`, `const [editNumber, setEditNumber] = useState('')`, `const [editTitle, setEditTitle] = useState('')`.

핸들러 추가:

```jsx
  function startEdit(e, v) {
    e.preventDefault() // Link 이동 방지
    setEditingId(v.id)
    setEditNumber(String(v.number))
    setEditTitle(v.title)
  }

  async function handleUpdate(e) {
    e.preventDefault()
    try {
      const v = await updateVolume(editingId, { number: Number(editNumber), title: editTitle.trim() })
      setVolumes(vs => vs.map(x => (x.id === v.id ? v : x)).sort((a, b) => a.number - b.number))
      setEditingId(null)
    } catch (err) {
      show(/duplicate|23505/i.test(err.message) ? '이미 있는 권 번호입니다' : err.message)
    }
  }

  async function handleDelete(e, v) {
    e.preventDefault()
    if (!window.confirm(`${v.number}권과 수록 목록·업무가 함께 삭제됩니다. 계속할까요? (변경 이력은 남습니다)`)) return
    try {
      await deleteVolume(v.id)
      setVolumes(vs => vs.filter(x => x.id !== v.id))
    } catch (err) {
      show(err.message)
    }
  }
```

리스트 렌더링 교체 — 편집 중이면 인라인 폼, 아니면 기존 카드 + 버튼 2개:

```jsx
        {volumes.map(v => (
          <li key={v.id}>
            {editingId === v.id ? (
              <form onSubmit={handleUpdate} className="flex items-end gap-3 rounded border border-blue-300 px-4 py-3">
                <div>
                  <label className="block text-xs text-gray-500" htmlFor={`edit-number-${v.id}`}>권 번호 수정</label>
                  <input id={`edit-number-${v.id}`} aria-label="권 번호 수정" type="number" required min="1"
                    value={editNumber} onChange={e => setEditNumber(e.target.value)}
                    className="w-24 rounded border border-gray-300 px-2 py-1" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500" htmlFor={`edit-title-${v.id}`}>주제명 수정</label>
                  <input id={`edit-title-${v.id}`} aria-label="주제명 수정" required
                    value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1" />
                </div>
                <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">저장</button>
                <button type="button" onClick={() => setEditingId(null)} className="text-sm text-gray-500">취소</button>
              </form>
            ) : (
              <Link
                to={`/volumes/${v.id}`}
                className="flex items-center gap-3 rounded border border-gray-200 px-4 py-3 hover:bg-gray-50"
              >
                <span className="font-semibold">{v.number}권</span>
                <span className="flex-1">{v.title}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{v.status}</span>
                <button type="button" onClick={e => startEdit(e, v)}
                  className="text-xs text-gray-400 underline hover:text-gray-700">수정</button>
                <button type="button" onClick={e => handleDelete(e, v)}
                  className="text-xs text-red-300 underline hover:text-red-600">삭제</button>
              </Link>
            )}
          </li>
        ))}
```

- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/VolumesPage.jsx src/tests/VolumesPage.test.jsx
git commit -m "feat: 권 수정(인라인)·삭제"
```

---

### Task 5: PartControls (부 탭 + 부 관리 팝오버) + VolumeWorkList 그룹 표시

**Files:**
- Create: `src/board/PartControls.jsx`
- Modify: `src/board/VolumeWorkList.jsx`
- Test: `src/tests/PartControls.test.jsx`, `src/tests/VolumeWorkList.test.jsx` (테스트 추가)

**Interfaces:**
- Produces:
  - `<PartControls parts activePart onSelect onAddPart onRenamePart onRemovePart />`
    - 탭 버튼: `전체` | 각 부(partLabel) | `미배정`(parts 있을 때만). 클릭 → `onSelect('all' | part.id | 'none')`
    - `부 관리` 버튼 → 팝오버: 부마다 [N부][제목 input(blur 시 onRenamePart(id, value))][삭제 버튼(confirm 후 onRemovePart(id))] + `부 추가` 버튼(onAddPart)
  - `VolumeWorkList`에 `parts` prop 추가 — 필터 적용 후 `groupByPart`로 그룹핑해, parts가 있으면 그룹 헤더(partLabel 또는 "미배정")를 목록 사이에 렌더링. parts가 없으면 기존과 동일한 단일 목록 (기존 테스트가 parts 없이 호출해도 통과해야 함 — **prop 기본값 `parts = []`**)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/tests/PartControls.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const { default: PartControls } = await import('../board/PartControls.jsx')

const PARTS = [
  { id: 'p1', number: 1, title: null },
  { id: 'p2', number: 2, title: '현대시' },
]

test('탭: 전체/부/미배정을 렌더링하고 클릭을 전달한다', async () => {
  const onSelect = vi.fn()
  render(<PartControls parts={PARTS} activePart="all" onSelect={onSelect}
    onAddPart={() => {}} onRenamePart={() => {}} onRemovePart={() => {}} />)
  expect(screen.getByRole('button', { name: '전체' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '2부 현대시' }))
  expect(onSelect).toHaveBeenCalledWith('p2')
  await userEvent.click(screen.getByRole('button', { name: '미배정' }))
  expect(onSelect).toHaveBeenCalledWith('none')
})

test('부가 없으면 탭 없이 부 추가만 가능하다', async () => {
  const onAddPart = vi.fn()
  render(<PartControls parts={[]} activePart="all" onSelect={() => {}}
    onAddPart={onAddPart} onRenamePart={() => {}} onRemovePart={() => {}} />)
  expect(screen.queryByRole('button', { name: '미배정' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '부 관리' }))
  await userEvent.click(screen.getByRole('button', { name: '부 추가' }))
  expect(onAddPart).toHaveBeenCalled()
})

test('팝오버에서 이름 변경(blur)과 삭제(confirm)를 전달한다', async () => {
  const onRenamePart = vi.fn()
  const onRemovePart = vi.fn()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<PartControls parts={PARTS} activePart="all" onSelect={() => {}}
    onAddPart={() => {}} onRenamePart={onRenamePart} onRemovePart={onRemovePart} />)
  await userEvent.click(screen.getByRole('button', { name: '부 관리' }))
  const input = screen.getByLabelText('1부 제목')
  await userEvent.type(input, '소설')
  await userEvent.tab() // blur
  expect(onRenamePart).toHaveBeenCalledWith('p1', '소설')
  await userEvent.click(screen.getByRole('button', { name: '1부 삭제' }))
  expect(onRemovePart).toHaveBeenCalledWith('p1')
  window.confirm.mockRestore()
})
```

`src/tests/VolumeWorkList.test.jsx` 끝에 추가:

```jsx
test('parts가 있으면 부별 그룹 헤더를 표시한다', () => {
  const parts = [{ id: 'p1', number: 1, title: '시' }]
  const worksWithPart = [
    { ...WORKS[0], part_id: 'p1' },
    { ...WORKS[1], part_id: null },
  ]
  render(<VolumeWorkList works={worksWithPart} tasksByVw={TASKS} members={[]} parts={parts}
    selectedId={null} onSelect={() => {}} onMove={() => {}} />)
  expect(screen.getByText('1부 시')).toBeInTheDocument()
  expect(screen.getByText('미배정')).toBeInTheDocument()
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- src/tests/PartControls.test.jsx src/tests/VolumeWorkList.test.jsx` / Expected: FAIL

- [ ] **Step 3: 구현**

`src/board/PartControls.jsx`:

```jsx
// 부 탭(전체/N부/미배정) + 부 관리 팝오버 (설계 §5.1 부 흐름)
import { useEffect, useRef, useState } from 'react'
import { partLabel } from './boardUtils.js'

export default function PartControls({ parts, activePart, onSelect, onAddPart, onRenamePart, onRemovePart }) {
  const [managing, setManaging] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setManaging(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const tab = (key, label) => (
    <button
      key={key}
      type="button"
      onClick={() => onSelect(key)}
      className={`rounded px-2 py-1 text-sm ${activePart === key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1">
      {parts.length > 0 && (
        <>
          {tab('all', '전체')}
          {parts.map(p => tab(p.id, partLabel(p)))}
          {tab('none', '미배정')}
        </>
      )}
      <div className="relative ml-auto" ref={ref}>
        <button type="button" onClick={() => setManaging(m => !m)}
          className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-600">
          부 관리
        </button>
        {managing && (
          <div className="absolute right-0 z-20 mt-1 w-64 rounded border border-gray-200 bg-white p-3 shadow-lg">
            <ul className="mb-2 space-y-1">
              {parts.map(p => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="w-9 shrink-0">{p.number}부</span>
                  <input
                    aria-label={`${p.number}부 제목`}
                    defaultValue={p.title || ''}
                    placeholder="제목 (확정 후 입력)"
                    onBlur={e => e.target.value !== (p.title || '') && onRenamePart(p.id, e.target.value)}
                    className="min-w-0 flex-1 rounded border border-gray-200 px-1.5 py-0.5"
                  />
                  <button
                    type="button"
                    aria-label={`${p.number}부 삭제`}
                    onClick={() => {
                      if (window.confirm(`${p.number}부를 삭제할까요? 소속 작품은 미배정으로 이동합니다.`)) onRemovePart(p.id)
                    }}
                    className="text-gray-300 hover:text-red-500"
                  >✕</button>
                </li>
              ))}
              {!parts.length && <li className="text-xs text-gray-400">아직 부가 없습니다. 부 없이도 사용할 수 있습니다.</li>}
            </ul>
            <button type="button" onClick={onAddPart}
              className="w-full rounded border border-dashed border-gray-300 py-1 text-sm text-gray-500 hover:border-gray-400">
              부 추가
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

`src/board/VolumeWorkList.jsx` 수정:
- import에 `groupByPart, partLabel` 추가 (boardUtils에서)
- props에 `parts = []` 추가
- 기존 `<ul>` 내부의 `filtered.map(...)` 렌더링을 **행 렌더 함수로 추출**한 뒤 그룹 구조로 교체:

```jsx
  const renderRow = vw => { /* 기존 filtered.map 안의 <li> JSX 그대로 이동 (key 포함) */ }
  const groups = groupByPart(filtered, parts)
```

```jsx
      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {groups.map((g, i) => (
          <li key={g.part ? g.part.id : `none-${i}`}>
            {parts.length > 0 && (
              <div className="mt-2 mb-1 border-b border-gray-100 pb-0.5 text-xs font-semibold text-gray-400">
                {g.part ? partLabel(g.part) : '미배정'}
              </div>
            )}
            <ul className="space-y-1">
              {g.works.map(renderRow)}
              {!g.works.length && <li className="py-1 text-xs text-gray-300">이 부에 작품이 없습니다</li>}
            </ul>
          </li>
        ))}
        {!filtered.length && !parts.length && (
          <li className="py-8 text-center text-sm text-gray-400">표시할 작품이 없습니다</li>
        )}
      </ul>
```

- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: 전부 PASS (기존 VolumeWorkList 테스트 3건은 parts 기본값 []로 동일 동작)

- [ ] **Step 5: Commit**

```bash
git add src/board/PartControls.jsx src/board/VolumeWorkList.jsx src/tests/PartControls.test.jsx src/tests/VolumeWorkList.test.jsx
git commit -m "feat: 부 탭·부 관리 팝오버, 수록 목록 부별 그룹 표시"
```

---

### Task 6: 보드 배선 (activePart, 부 배정 추가, 패널 부 select)

**Files:**
- Modify: `src/board/VolumeBoardPage.jsx`, `src/board/WorkDetailPanel.jsx`
- Test: `src/tests/VolumeBoardPage.test.jsx`, `src/tests/WorkDetailPanel.test.jsx` (테스트 추가)

**Interfaces:**
- Consumes: Task 3 `board.parts`·`actions.addPart/renamePart/removePart`·`addWork(..., partId)`, Task 5 `PartControls`·`VolumeWorkList parts prop`
- Produces:
  - VolumeBoardPage: `const [activePart, setActivePart] = useState('all')`. PartControls를 수록 목록 위에 배치. 목록에 넘길 works는 activePart가 part id면 해당 부만, 'none'이면 미배정만, 'all'이면 전체(그룹 표시는 VolumeWorkList가 담당 — 탭 선택 시에는 `parts={[]}`를 넘겨 그룹 헤더 없이 평면 표시). handleAdd가 `addWork(work, curricula, registryMap, activePart !== 'all' && activePart !== 'none' ? activePart : null)` 호출. 부 삭제 시 activePart가 사라진 부면 'all'로 복귀.
  - WorkDetailPanel: `parts` prop 추가(기본 []). 선정 섹션에 부 select — `<select aria-label="부 지정">` 옵션 `미배정` + 각 부(partLabel), 변경 시 `actions.setVolumeWork(vw.id, { part_id: value || null })`. parts 없으면 select 미표시.

- [ ] **Step 1: 실패하는 테스트 추가**

`src/tests/WorkDetailPanel.test.jsx` 끝에:

```jsx
test('부가 있으면 부 지정 select를 보여주고 변경을 전달한다', async () => {
  const actions = makeActions()
  const parts = [{ id: 'p1', number: 1, title: '시' }]
  render(<WorkDetailPanel volumeWork={{ ...VW, part_id: null }} tasks={[]} members={MEMBERS}
    duplicates={[]} parts={parts} actions={actions} onClose={() => {}} />)
  const select = screen.getByLabelText('부 지정')
  await userEvent.selectOptions(select, 'p1')
  expect(actions.setVolumeWork).toHaveBeenCalledWith('vw1', { part_id: 'p1' })
})
```

`src/tests/VolumeBoardPage.test.jsx`: getBoard 목 반환에 `parts: []` 추가(이미 Task 1에서 했다면 유지), volumeApi 목에 `createPart/updatePart/deletePart: vi.fn()` 추가. 테스트 추가:

```jsx
test('부 관리 버튼이 보드에 렌더링된다', async () => {
  window.location.hash = '#/volumes/v1'
  render(
    <ToastProvider>
      <HashRouter>
        <Routes><Route path="/volumes/:id" element={<VolumeBoardPage />} /></Routes>
      </HashRouter>
    </ToastProvider>,
  )
  await waitFor(() => expect(screen.getByRole('button', { name: '부 관리' })).toBeInTheDocument())
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- src/tests/WorkDetailPanel.test.jsx src/tests/VolumeBoardPage.test.jsx` / Expected: FAIL

- [ ] **Step 3: 구현**

`src/board/WorkDetailPanel.jsx`: props에 `parts = []` 추가, import에 `partLabel` 추가. 선정 Section의 선정 상태 줄 아래에:

```jsx
        {parts.length > 0 && (
          <div className="mb-2 flex items-center gap-2">
            <label className="text-sm" htmlFor="part-select">부 지정</label>
            <select
              id="part-select"
              aria-label="부 지정"
              value={vw.part_id || ''}
              onChange={e => actions.setVolumeWork(vw.id, { part_id: e.target.value || null })}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="">미배정</option>
              {parts.map(p => <option key={p.id} value={p.id}>{partLabel(p)}</option>)}
            </select>
          </div>
        )}
```

`src/board/VolumeBoardPage.jsx`:
- import에 `PartControls` 추가
- 상태 추가: `const [activePart, setActivePart] = useState('all')`
- activePart 유효성 (부 삭제·원격 삭제 대응): board.parts 변경 시 확인

```jsx
  useEffect(() => {
    if (activePart !== 'all' && activePart !== 'none' && !board.parts.some(p => p.id === activePart)) {
      setActivePart('all')
    }
  }, [board.parts, activePart])
```

- 목록에 넘길 works 계산:

```jsx
  const visibleWorks = activePart === 'all'
    ? board.works
    : board.works.filter(w => (activePart === 'none' ? !w.part_id : w.part_id === activePart))
```

- handleAdd 수정:

```jsx
  async function handleAdd(work, curricula) {
    const partId = activePart !== 'all' && activePart !== 'none' ? activePart : null
    const row = await board.actions.addWork(work, curricula, registryMap, partId)
    if (row) setSelectedId(row.id)
  }
```

- 수록 목록 영역 JSX: `<VolumeWorkList ...>` 바로 위에 PartControls 배치, VolumeWorkList에 `works={visibleWorks}`와 `parts={activePart === 'all' ? board.parts : []}` 전달:

```jsx
        <div className="min-w-0 flex-1 rounded border border-gray-200 p-3">
          <PartControls
            parts={board.parts}
            activePart={activePart}
            onSelect={setActivePart}
            onAddPart={board.actions.addPart}
            onRenamePart={board.actions.renamePart}
            onRemovePart={board.actions.removePart}
          />
          <VolumeWorkList
            works={visibleWorks}
            parts={activePart === 'all' ? board.parts : []}
            tasksByVw={board.tasksByVw}
            members={board.members}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={board.actions.move}
          />
        </div>
```

- WorkDetailPanel 호출에 `parts={board.parts}` 추가
- `useEffect` import 확인 (이미 있음)

- [ ] **Step 4: 통과 확인 + 빌드** — Run: `npm test && npm run build` / Expected: 전부 PASS + 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add src/board/VolumeBoardPage.jsx src/board/WorkDetailPanel.jsx src/tests/VolumeBoardPage.test.jsx src/tests/WorkDetailPanel.test.jsx
git commit -m "feat: 부 선택 후 추가·부별 표시·패널 부 지정 배선"
```

---

### Task 7: 실사동 검증 + 배포

**Files:** 없음

- [ ] **Step 1: 로컬 검증** (`npm run dev`) — 기존 1권에서:
  - "부 관리" → 부 추가 3회 → 탭에 1부/2부/3부 + 전체/미배정 표시
  - 1부 제목 입력(예: 시) → 탭 라벨 "1부 시" 반영
  - 1부 탭 선택 → 작품 추가 → 해당 작품이 1부 소속으로 등록 (전체 탭에서 1부 그룹에 표시)
  - 기존 작품(미배정)이 "미배정" 그룹에 표시, 패널에서 부 지정 → 그룹 이동
  - 부 삭제 → 소속 작품 미배정 복귀
  - 권 목록: 권 수정으로 제목 변경(예: "1부: 시" → 실제 주제명), 테스트용 권 삭제 확인
  - 두 브라우저: 부 추가·작품 부 이동이 실시간 반영
- [ ] **Step 2: 배포**

```bash
git push origin master
git tag phase2b-done && git push origin phase2b-done
```

배포 후 운영 사이트에서 부 추가·부별 선정 1회 재확인.

---

## Self-Review 결과

- **커버리지**: 설계 §10 2b행 전 항목 — 부 CRUD(T1·T3·T5), 부 선택 후 추가(T6), 부별 그룹(T2·T5), 패널 부 변경(T6), 권 수정·삭제(T4). 스키마 변경 없음(기배포).
- **타입 일관성**: `activePart` 'all'|'none'|partId 규약이 T5(onSelect)와 T6(필터·배정)에서 동일. `addWork` 4번째 인자 partId — T3 정의·T6 호출 일치. `groupByPart(filtered, parts)` — T2 시그니처와 T5 사용 일치. VolumeWorkList `parts` 기본값 []로 기존 테스트·부 없는 권 하위 호환.
- **의도적 결정**: 탭 선택 시 목록을 평면 표시(`parts={[]}` 전달)해 이중 헤더 방지. 부 순서는 number 고정(YAGNI). 부 삭제 확인 문구에 "미배정 이동" 명시.
- **알려진 한계**: Realtime로 다른 사용자가 부를 지우면 debounce reload 후 activePart가 'all'로 복귀(useEffect 가드) — 의도된 동작.
