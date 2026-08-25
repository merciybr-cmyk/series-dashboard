# 2c단계: 단순화·검토 의견·수록 횟수·중복 뱃지·비교 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 제작 상태 추적을 걷어내 도구를 단순화하고(진행 확인은 업무 진행률만), 작품별 검토 의견·수록 횟수·권 간 중복 뱃지를 더하고, 모든 권의 작품 목록을 한 페이지에서 비교하는 화면을 만든다.

**Architecture:** 전부 기존 구조 위의 증분: 상수·유틸 축소 → UI에서 제작 상태 제거 → 신규 테이블 1개(work_comments, 기존 트리거 함수 재사용) + API 3개 → 패널 섹션 추가 → 검색·목록 뱃지 확장 → 읽기 전용 비교 페이지. DB의 production_status 컬럼은 보존(UI만 제거).

**Tech Stack:** 기존과 동일 (React 19, supabase-js 2, Vitest 4).

**Spec:** [2026-08-13-series-dashboard-design-v2.md](../specs/2026-08-13-series-dashboard-design-v2.md) — §4(2c 결정 반영됨), §10 2c행

## Global Constraints

- production_status·'제작중'은 **UI에서만** 제거 — DB 컬럼·check 제약은 무변경 (설계 §4)
- 진행 확인은 업무 진행률 n/m로 충분 — 진행률·담당자·마감·D-day 표시는 유지
- 권 상태 옵션은 기획/선정중/확정/완료 4종. 단 **기존 데이터가 '제작중'인 권은 그 값이 목록에 남아 보이도록** legacy 옵션 처리 (사용자 권이 실제로 '제작중' 상태임)
- TASK_PRESETS 정확히 6종: 본문 확보/저작권 확인/원고 집필/해제 작성/부가 원고/이미지 확보 (설계 §4)
- 검토 의견: 수정 없음·삭제만, created_by는 트리거 자동 기록(`set_registry_created_by` 재사용 — phase2.sql에 이미 존재), activity_log 트리거 없음 (설계 §4 work_comments)
- 수록 횟수 라벨은 **"수록 N회"** (시트 행 = 수록 기록이며 "교과서 N권"과 다를 수 있음 — 학기 분권 등)
- 중복 판정·뱃지는 전부 work_id 기준, 현재 권 제외 (설계 §3)
- 비교 페이지는 읽기 전용, 권 카드 클릭 시 해당 권 보드로 이동
- 기존 테스트 71건 중 제작 상태 관련 단언만 계획이 지정하는 대로 갱신·삭제 — 그 외 의도 무변경. TDD. 한국어 문구
- 커밋 접두사 `feat:`/`fix:`/`test:`/`docs:` + 한국어

## 파일 구조

```
수정: src/board/constants.js        # PRODUCTION_LABELS 제거, TASK_PRESETS 6종
수정: src/board/boardUtils.js       # filterVolumeWorks에서 production·hideCompleted 제거
수정: src/board/VolumeWorkList.jsx  # 제작 배지·필터 제거, 중복 뱃지(crossDups) 추가
수정: src/board/WorkDetailPanel.jsx # 제작 select·완료 제안 제거, 검토 의견 섹션 추가
수정: src/board/VolumeBoardPage.jsx # 권 상태 4종+legacy, crossDups 배선
수정: src/board/SearchPane.jsx      # 수록 N회 표시
수정: src/board/volumeApi.js        # 의견 3함수, listAllParts, listAllVolumeWorks 확장
생성: src/board/ComparePage.jsx     # 권별 비교 (/compare)
수정: src/components/AppLayout.jsx  # 메뉴 '권별 비교'
수정: src/App.jsx                   # /compare 라우트
생성: supabase/phase2c.sql          # work_comments
생성: docs/setup-phase2c.md         # 사용자 SQL 실행 절차
```

---

### Task 1: 상수·유틸 단순화 (프리셋 6종, PRODUCTION_LABELS·제작 필터 제거)

**Files:**
- Modify: `src/board/constants.js`, `src/board/boardUtils.js`
- Test: `src/tests/boardUtils.test.js` (갱신)

**Interfaces:**
- Produces: `TASK_PRESETS` 6종(source/copyright/manuscript/commentary/extra/image — manuscript 라벨은 '원고 집필'). `PRODUCTION_LABELS` export 삭제. `filterVolumeWorks(rows, tasksByVw, {selection=[], assignee=[], dueSoon=false}, now)` — production·hideCompleted 키 제거.
- 주의: 이 Task 완료 시점에는 컴포넌트들이 아직 PRODUCTION_LABELS를 import하므로 **일시적으로 전체 테스트가 깨진다 — 이 Task에서는 boardUtils·constants 테스트 파일만 통과시키고, 컴포넌트 테스트 복구는 Task 2가 담당**한다. 커밋은 Task 2와 함께 한다 (아래 Step 5).

- [ ] **Step 1: 테스트 갱신 (RED)** — `src/tests/boardUtils.test.js`:
  - `TASK_PRESETS: 10종` 테스트를 다음으로 교체:

```js
test('TASK_PRESETS: 6종, 편집 공정 없음', () => {
  expect(TASK_PRESETS).toHaveLength(6)
  expect(TASK_PRESETS.map(p => p.type)).toEqual(
    ['source', 'copyright', 'manuscript', 'commentary', 'extra', 'image'],
  )
  expect(TASK_PRESETS.find(p => p.type === 'manuscript').label).toBe('원고 집필')
})
```

  - `filterVolumeWorks` 테스트에서 `production`·`hideCompleted` 단언 2줄을 삭제하고, 나머지(selection/assignee/dueSoon) 단언은 유지.

- [ ] **Step 2: 실패 확인** — Run: `npm test -- src/tests/boardUtils.test.js` / Expected: FAIL

- [ ] **Step 3: 구현**
  - `constants.js`: `PRODUCTION_LABELS` 블록 삭제. `TASK_PRESETS`를 다음으로 교체:

```js
export const TASK_PRESETS = [
  { type: 'source', label: '작품 본문 확보' },
  { type: 'copyright', label: '저작권 확인' },
  { type: 'manuscript', label: '원고 집필' },
  { type: 'commentary', label: '해제 작성' },
  { type: 'extra', label: '부가 원고 작성' },
  { type: 'image', label: '이미지 확보' },
]
```

  - `boardUtils.js`의 `filterVolumeWorks`를 다음으로 교체:

```js
export function filterVolumeWorks(rows, tasksByVw, filters = {}, now = new Date()) {
  const { selection = [], assignee = [], dueSoon = false } = filters
  return rows.filter(row => {
    const tasks = tasksByVw[row.id] || []
    if (selection.length && !selection.includes(row.selection_status)) return false
    if (assignee.length && !tasks.some(t => assignee.includes(t.assignee_id))) return false
    if (dueSoon) {
      const hit = tasks.some(t => t.status !== 'done' && t.due_date && daysUntil(t.due_date, now) <= 7)
      if (!hit) return false
    }
    return true
  })
}
```

- [ ] **Step 4: 부분 통과 확인** — Run: `npm test -- src/tests/boardUtils.test.js` / Expected: PASS (전체 스위트는 아직 깨짐 — 정상)

- [ ] **Step 5: 커밋하지 않는다.** Task 2 완료 후 함께 커밋 (중간 상태가 그린이 아니므로).

---

### Task 2: 제작 상태 UI 제거 (목록·패널·권 상태)

**Files:**
- Modify: `src/board/VolumeWorkList.jsx`, `src/board/WorkDetailPanel.jsx`, `src/board/VolumeBoardPage.jsx`
- Test: `src/tests/VolumeWorkList.test.jsx`, `src/tests/WorkDetailPanel.test.jsx`, `src/tests/VolumeBoardPage.test.jsx` (갱신)

**Interfaces:**
- Consumes: Task 1의 축소된 filterVolumeWorks·constants
- Produces: 제작 배지·제작 상태 필터·완료 숨김 체크박스·패널 제작 select·"완료로 변경" 제안 제거. 패널 업무 섹션 제목 `업무 (n/m)`. VolumeBoardPage의 권 상태 옵션 4종 + legacy 값 표시.

- [ ] **Step 1: 테스트 갱신 (RED)**
  - `VolumeWorkList.test.jsx`: 첫 테스트의 `expect(screen.getByText('진행 중')).toBeInTheDocument()` 삭제 (확정·1/2 단언 유지)
  - `WorkDetailPanel.test.jsx`: "모든 업무 완료 시 제작 완료 제안" 테스트 **삭제**. 프리셋 추가 테스트에서 '교정' 클릭·기대값을 '이미지 확보'(type `image`)로 교체:

```jsx
  await userEvent.click(screen.getByLabelText('해제 작성'))
  await userEvent.click(screen.getByLabelText('이미지 확보'))
  await userEvent.click(screen.getByRole('button', { name: '선택한 업무 추가' }))
  expect(actions.addTasks).toHaveBeenCalledWith('vw1', [
    { task_type: 'commentary', title: '해제 작성', sort_order: 10 },
    { task_type: 'image', title: '이미지 확보', sort_order: 20 },
  ])
```

  - `VolumeBoardPage.test.jsx`에 추가:

```jsx
test("권 상태가 '제작중'(legacy)이어도 표시되고 옵션은 4종+legacy", async () => {
  api.getBoard.mockResolvedValue({
    volume: { id: 'v1', number: 3, title: '성장', status: '제작중' },
    parts: [], works: [], tasks: [],
  })
  window.location.hash = '#/volumes/v1'
  render(
    <ToastProvider>
      <HashRouter>
        <Routes><Route path="/volumes/:id" element={<VolumeBoardPage />} /></Routes>
      </HashRouter>
    </ToastProvider>,
  )
  const select = await screen.findByLabelText('권 상태')
  expect(select).toHaveValue('제작중')
  const labels = [...select.options].map(o => o.textContent)
  expect(labels).toEqual(['제작중', '기획', '선정중', '확정', '완료'])
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test` / Expected: FAIL (갱신 테스트 + import 깨짐)

- [ ] **Step 3: 구현**
  - `VolumeWorkList.jsx`: `PRODUCTION_LABELS`·`PRODUCTION_BADGE` 관련 코드 삭제(import·상수·renderRow의 제작 배지 span). 필터 바에서 "제작 상태" MultiSelect와 "완료 숨김" 체크박스(및 production/hideCompleted state) 삭제 — 남는 필터: 선정 상태·담당자·마감 임박. `filterVolumeWorks` 호출 인자에서 두 키 제거. excluded 흐림은 진행률·D-day 스팬에 유지.
  - `WorkDetailPanel.jsx`: `PRODUCTION_LABELS` import 삭제. 제작 Section에서 ①제작 상태 label+select 블록 삭제 ②`allDone && ...' 완료로 변경' 제안 블록 삭제(allDone 변수도) ③Section 제목을 `업무 ${total ? `(${done}/${total})` : ''}`로. excluded 흐림 wrapper·체크리스트·프리셋 UI는 유지.
  - `VolumeBoardPage.jsx`: `const VOLUME_STATUSES = ['기획', '선정중', '확정', '완료']`로 교체하고, select 렌더를:

```jsx
        <select
          value={board.volume.status}
          onChange={e => handleVolumeStatus(e.target.value)}
          aria-label="권 상태"
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {(VOLUME_STATUSES.includes(board.volume.status)
            ? VOLUME_STATUSES
            : [board.volume.status, ...VOLUME_STATUSES]
          ).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
```

- [ ] **Step 4: 통과 확인** — Run: `npm test && npm run build` / Expected: 전부 PASS(기존 71건 중 삭제 1·갱신 수건 반영 후), 빌드 성공. grep으로 `PRODUCTION_LABELS` 잔존 참조 0건 확인: `grep -rn PRODUCTION_LABELS src/ || echo CLEAN`

- [ ] **Step 5: Commit** (Task 1 변경 포함)

```bash
git add src/board/constants.js src/board/boardUtils.js src/board/VolumeWorkList.jsx src/board/WorkDetailPanel.jsx src/board/VolumeBoardPage.jsx src/tests/boardUtils.test.js src/tests/VolumeWorkList.test.jsx src/tests/WorkDetailPanel.test.jsx src/tests/VolumeBoardPage.test.jsx
git commit -m "feat: 제작 상태 UI 제거·프리셋 6종 축소 (진행 확인은 업무 진행률로)"
```

---

### Task 3: work_comments 스키마 + volumeApi 의견·비교 API

**Files:**
- Create: `supabase/phase2c.sql`, `docs/setup-phase2c.md`
- Modify: `src/board/volumeApi.js`
- Test: `src/tests/volumeApi.test.js` (추가)

**Interfaces:**
- Produces:
  - `listComments(volumeWorkId) → comment[]` (created_at 오름차순)
  - `addComment(volumeWorkId, body) → comment`
  - `deleteComment(id) → void`
  - `listAllParts() → part[]` (비교 페이지용)
  - `listAllVolumeWorks()`의 select 확장: `'id, volume_id, work_id, part_id, sort_order, selection_status, work_snapshot, volumes(number, title)'` (기존 사용처는 추가 필드에 영향 없음)

- [ ] **Step 1: supabase/phase2c.sql 작성**

```sql
-- 2c 스키마: 작품 검토 의견 (설계 §4 work_comments)
-- 적용: Supabase Studio SQL Editor에서 1회 실행 (docs/setup-phase2c.md)

create table public.work_comments (
  id uuid primary key default gen_random_uuid(),
  volume_work_id uuid not null references public.volume_works (id) on delete cascade,
  body text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.work_comments enable row level security;
create policy work_comments_member_all on public.work_comments
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- created_by 자동 기록: phase2.sql의 set_registry_created_by 재사용 (created_by만 세팅하는 함수)
create trigger work_comments_created_by before insert on public.work_comments
  for each row execute function public.set_registry_created_by();
```

- [ ] **Step 2: docs/setup-phase2c.md 작성**

```markdown
# 2c단계 세팅 절차 (1회, 사람 작업)

Supabase Studio → SQL Editor에서 `supabase/phase2c.sql` 내용을 붙여넣고 Run.
성공하면 Table Editor에 work_comments 테이블이 보인다. 이것이 전부다.
```

- [ ] **Step 3: 실패하는 테스트 추가 (RED)** — `src/tests/volumeApi.test.js` 끝에:

```js
test('addComment: volume_work_id와 body로 insert한다', async () => {
  fromResults.push({ data: { id: 'c1', body: '좋은 선정입니다' }, error: null })
  const c = await api.addComment('vw1', '좋은 선정입니다')
  expect(c.body).toBe('좋은 선정입니다')
  expect(mockSupabase.from).toHaveBeenCalledWith('work_comments')
})

test('의견·비교 API가 존재한다', () => {
  expect(typeof api.listComments).toBe('function')
  expect(typeof api.deleteComment).toBe('function')
  expect(typeof api.listAllParts).toBe('function')
})
```

- [ ] **Step 4: 실패 확인** — Run: `npm test -- src/tests/volumeApi.test.js` / Expected: FAIL

- [ ] **Step 5: 구현** — `volumeApi.js`:
  - `listAllVolumeWorks`의 select 문자열을 `'id, volume_id, work_id, part_id, sort_order, selection_status, work_snapshot, volumes(number, title)'`로 교체
  - volume_parts 섹션에 추가:

```js
export async function listAllParts() {
  return unwrap(await supabase.from('volume_parts').select('*').order('number'))
}
```

  - 새 섹션 (기타 위):

```js
// ---------- work_comments (검토 의견) ----------

export async function listComments(volumeWorkId) {
  return unwrap(
    await supabase.from('work_comments').select('*')
      .eq('volume_work_id', volumeWorkId).order('created_at'),
  )
}

export async function addComment(volumeWorkId, body) {
  return unwrap(
    await supabase.from('work_comments')
      .insert({ volume_work_id: volumeWorkId, body })
      .select().single(),
  )
}

export async function deleteComment(id) {
  unwrap(await supabase.from('work_comments').delete().eq('id', id))
}
```

- [ ] **Step 6: 통과 확인** — Run: `npm test` / Expected: 전부 PASS

- [ ] **Step 7: Commit**

```bash
git add supabase/phase2c.sql docs/setup-phase2c.md src/board/volumeApi.js src/tests/volumeApi.test.js
git commit -m "feat: 검토 의견 스키마·API + 비교용 조회 확장"
```

---

### Task 4: WorkDetailPanel 검토 의견 섹션

**Files:**
- Modify: `src/board/WorkDetailPanel.jsx`
- Test: `src/tests/WorkDetailPanel.test.jsx` (추가)

**Interfaces:**
- Consumes: Task 3의 listComments/addComment/deleteComment, 기존 `members` prop(작성자 이름 매핑), `useToast`
- Produces: 업무 섹션과 최근 변경 사이에 "검토 의견" Section — 의견 목록(작성자 이름·시각·본문·삭제 ✕(confirm)), textarea + [의견 남기기] 버튼. vw.id 변경 시 재로드. 실패는 토스트.

- [ ] **Step 1: 실패하는 테스트 추가 (RED)** — `WorkDetailPanel.test.jsx`의 volumeApi 목 팩토리에 `listComments: vi.fn().mockResolvedValue([]), addComment: vi.fn(), deleteComment: vi.fn()` 추가 후:

```jsx
test('검토 의견을 불러와 작성자 이름과 함께 보여준다', async () => {
  api.listComments.mockResolvedValue([
    { id: 'c1', body: '표현이 좋아 후보로 적극 추천', created_by: 'm1', created_at: '2026-08-25T09:00:00Z' },
  ])
  render(<WorkDetailPanel volumeWork={VW} tasks={[]} members={MEMBERS} duplicates={[]} actions={makeActions()} onClose={() => {}} />)
  expect(await screen.findByText(/후보로 적극 추천/)).toBeInTheDocument()
  expect(screen.getByText(/김편집/)).toBeInTheDocument()
})

test('의견을 입력해 등록한다', async () => {
  api.listComments.mockResolvedValue([])
  api.addComment.mockResolvedValue({ id: 'c9', body: '분량 우려', created_by: 'm1', created_at: '2026-08-25T09:00:00Z' })
  render(<WorkDetailPanel volumeWork={VW} tasks={[]} members={MEMBERS} duplicates={[]} actions={makeActions()} onClose={() => {}} />)
  await userEvent.type(screen.getByPlaceholderText(/검토 의견/), '분량 우려')
  await userEvent.click(screen.getByRole('button', { name: '의견 남기기' }))
  expect(api.addComment).toHaveBeenCalledWith('vw1', '분량 우려')
  expect(await screen.findByText('분량 우려')).toBeInTheDocument()
})
```

(주의: 기존 파일의 `vi.mock('../board/volumeApi.js', ...)`는 listActivityFor만 목킹하고 있음 — 팩토리를 확장하고 `const api = await import('../board/volumeApi.js')` 참조를 추가한다. 기존 테스트는 무수정 통과해야 한다.)

- [ ] **Step 2: 실패 확인** — Run: `npm test -- src/tests/WorkDetailPanel.test.jsx` / Expected: FAIL

- [ ] **Step 3: 구현** — `WorkDetailPanel.jsx`:
  - import 확장: `import { listActivityFor, listComments, addComment, deleteComment } from './volumeApi.js'`, `import { useToast } from '../components/Toast.jsx'`
  - 상태: `const [comments, setComments] = useState([])`, `const [commentBody, setCommentBody] = useState('')`, `const { show } = useToast()`
  - 로드: `useEffect(() => { listComments(vw.id).then(setComments).catch(() => setComments([])) }, [vw.id])`
  - 이름 매핑: `const memberName = id => members.find(m => m.id === id)?.name || '알 수 없음'`
  - 핸들러:

```jsx
  async function submitComment() {
    const body = commentBody.trim()
    if (!body) return
    try {
      const c = await addComment(vw.id, body)
      setComments(cs => [...cs, c])
      setCommentBody('')
    } catch (err) {
      show(err.message)
    }
  }

  async function removeComment(id) {
    if (!window.confirm('이 의견을 삭제할까요?')) return
    try {
      await deleteComment(id)
      setComments(cs => cs.filter(c => c.id !== id))
    } catch (err) {
      show(err.message)
    }
  }
```

  - 업무 Section 다음, 최근 변경 Section 앞에:

```jsx
      <Section title={`검토 의견 ${comments.length ? `(${comments.length})` : ''}`}>
        <ul className="mb-2 space-y-2">
          {comments.map(c => (
            <li key={c.id} className="rounded bg-gray-50 px-2 py-1.5 text-sm">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className="font-medium text-gray-700">{memberName(c.created_by)}</span>
                <span>{new Date(c.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <button type="button" aria-label="의견 삭제" onClick={() => removeComment(c.id)}
                  className="ml-auto text-gray-300 hover:text-red-500">✕</button>
              </div>
              <p className="whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
          {!comments.length && <li className="text-xs text-gray-300">아직 의견이 없습니다</li>}
        </ul>
        <textarea
          value={commentBody}
          onChange={e => setCommentBody(e.target.value)}
          placeholder="검토 의견 (선정 논의, 우려, 제안)"
          rows={2}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <button type="button" onClick={submitComment}
          className="mt-1 rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white">의견 남기기</button>
      </Section>
```

- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/WorkDetailPanel.jsx src/tests/WorkDetailPanel.test.jsx
git commit -m "feat: 작품 검토 의견 남기기·삭제"
```

---

### Task 5: 수록 횟수(검색) + 수록 목록 권 간 중복 뱃지

**Files:**
- Modify: `src/board/SearchPane.jsx`, `src/board/VolumeWorkList.jsx`, `src/board/VolumeBoardPage.jsx`
- Test: `src/tests/SearchPane.test.jsx`, `src/tests/VolumeWorkList.test.jsx` (추가/갱신)

**Interfaces:**
- Produces:
  - SearchPane: 결과 행에 `수록 N회` 표시 (그룹핑 시 행 수 집계). grouped 내부 구조가 `[key, {rep, count}]`로 바뀌지만 대외 인터페이스(onAdd 시그니처)는 불변
  - VolumeWorkList: 새 prop `crossDups = new Map()` — `Map<work_id, [{volumeNumber, selection_status}]>` (이미 현재 권 제외됨). renderRow에서 선정 배지 앞에 "N권 확정/후보" 뱃지 렌더 (SearchPane과 동일 색: confirmed 파랑, 그 외 노랑)
  - VolumeBoardPage: `crossDups`를 duplicatesByWorkId에서 현재 권 제외로 useMemo 계산해 VolumeWorkList에 전달

- [ ] **Step 1: 실패하는 테스트 (RED)**
  - `SearchPane.test.jsx`에 추가 (소나기는 픽스처에서 2행):

```jsx
test('작품별 수록 횟수를 표시한다', () => {
  render(<SearchPane works={WORKS} duplicatesByKey={new Map()} onAdd={() => {}} />)
  expect(screen.getByText('수록 2회')).toBeInTheDocument()  // 소나기
  expect(screen.getByText('수록 1회')).toBeInTheDocument()  // 별 헤는 밤
})
```

  - `VolumeWorkList.test.jsx`에 추가:

```jsx
test('다른 권 수록 뱃지를 표시한다', () => {
  const crossDups = new Map([['W000001', [{ volumeNumber: 2, selection_status: 'confirmed' }]]])
  const works = [{ ...WORKS[0], work_id: 'W000001' }]
  render(<VolumeWorkList works={works} tasksByVw={TASKS} members={[]} crossDups={crossDups}
    selectedId={null} onSelect={() => {}} onMove={() => {}} />)
  expect(screen.getByText('2권 확정')).toBeInTheDocument()
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- src/tests/SearchPane.test.jsx src/tests/VolumeWorkList.test.jsx` / Expected: FAIL

- [ ] **Step 3: 구현**
  - `SearchPane.jsx` grouped memo를 집계형으로:

```jsx
  const grouped = useMemo(() => {
    const filtered = filterWorks(works, { curriculum, genre, query })
    const map = new Map()
    for (const w of filtered) {
      const key = workKeyOf(w)
      const entry = map.get(key)
      if (entry) entry.count += 1
      else map.set(key, { rep: w, count: 1 })
    }
    return [...map.entries()] // [key, {rep, count}]
  }, [works, curriculum, genre, query])
```

  렌더 루프를 `grouped.slice(0, MAX_SHOWN).map(([key, { rep: w, count }]) => ...)`로 바꾸고, 작가·갈래 줄에 이어 `<span className="shrink-0 text-xs text-gray-400">수록 {count}회</span>`를 행에 추가 (뱃지들 앞).
  - `VolumeWorkList.jsx`: props에 `crossDups = new Map()` 추가. renderRow의 선정 배지 span 바로 앞에:

```jsx
              {(crossDups.get(vw.work_id) || []).map(d => (
                <span key={d.volumeNumber}
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${d.selection_status === 'confirmed' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                  {d.volumeNumber}권 {SELECTION_LABELS[d.selection_status]}
                </span>
              ))}
```

  - `VolumeBoardPage.jsx`: duplicatesByWorkId 아래에:

```jsx
  const crossDups = useMemo(() => {
    const map = new Map()
    for (const [workId, dups] of duplicatesByWorkId) {
      const others = dups.filter(d => d.volumeId !== volumeId)
      if (others.length) map.set(workId, others)
    }
    return map
  }, [duplicatesByWorkId, volumeId])
```

  VolumeWorkList 호출에 `crossDups={crossDups}` 추가.

- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/SearchPane.jsx src/board/VolumeWorkList.jsx src/board/VolumeBoardPage.jsx src/tests/SearchPane.test.jsx src/tests/VolumeWorkList.test.jsx
git commit -m "feat: 검색 수록 횟수·수록 목록 권 간 중복 뱃지"
```

---

### Task 6: 권별 비교 페이지 (/compare)

**Files:**
- Create: `src/board/ComparePage.jsx`
- Modify: `src/components/AppLayout.jsx` (메뉴), `src/App.jsx` (라우트)
- Test: `src/tests/ComparePage.test.jsx`

**Interfaces:**
- Consumes: `listVolumes`/`listAllVolumeWorks`(확장판)/`listAllParts` (Task 3), `groupByPart`/`partLabel`(boardUtils), `SELECTION_LABELS`
- Produces: `/compare` — 권마다 세로 카드(가로 스크롤), 카드 헤더는 권 보드 링크, 부별 그룹, 행: 제목·작가(work_snapshot)·선정 배지·중복 강조(`⚠ N·M권`), 상단 "확정만 보기" 체크박스. 읽기 전용. AppLayout 메뉴에 '권별 비교'(/compare, 권별 작품 목록 다음).

- [ ] **Step 1: 실패하는 테스트 (RED)** — `src/tests/ComparePage.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  listVolumes: vi.fn(),
  listAllVolumeWorks: vi.fn(),
  listAllParts: vi.fn(),
}))
const api = await import('../board/volumeApi.js')
const { default: ComparePage } = await import('../board/ComparePage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

const VOLUMES = [
  { id: 'v1', number: 1, title: '삶', status: '선정중' },
  { id: 'v2', number: 2, title: '성장', status: '기획' },
]
const VW = [
  { id: 'a', volume_id: 'v1', work_id: 'W1', part_id: 'p1', sort_order: 10, selection_status: 'confirmed', work_snapshot: { title: '소나기', author: '황순원' } },
  { id: 'b', volume_id: 'v1', work_id: 'W2', part_id: null, sort_order: 20, selection_status: 'candidate', work_snapshot: { title: '산유화', author: '김소월' } },
  { id: 'c', volume_id: 'v2', work_id: 'W1', part_id: null, sort_order: 10, selection_status: 'candidate', work_snapshot: { title: '소나기', author: '황순원' } },
]
const PARTS = [{ id: 'p1', volume_id: 'v1', number: 1, title: '시', sort_order: 10 }]

function renderPage() {
  return render(<ToastProvider><HashRouter><ComparePage /></HashRouter></ToastProvider>)
}

test('권별 카드에 부 그룹·작품·중복 강조를 표시한다', async () => {
  api.listVolumes.mockResolvedValue(VOLUMES)
  api.listAllVolumeWorks.mockResolvedValue(VW)
  api.listAllParts.mockResolvedValue(PARTS)
  renderPage()
  await waitFor(() => expect(screen.getByText('1권 삶')).toBeInTheDocument())
  expect(screen.getByText('2권 성장')).toBeInTheDocument()
  expect(screen.getByText('1부 시')).toBeInTheDocument()
  expect(screen.getAllByText('소나기')).toHaveLength(2)      // 두 권 모두
  expect(screen.getAllByText(/⚠/)).toHaveLength(2)          // 겹침 강조 2곳
  expect(screen.getByText('산유화')).toBeInTheDocument()
})

test("'확정만 보기'가 후보를 숨긴다", async () => {
  api.listVolumes.mockResolvedValue(VOLUMES)
  api.listAllVolumeWorks.mockResolvedValue(VW)
  api.listAllParts.mockResolvedValue(PARTS)
  renderPage()
  await waitFor(() => screen.getByText('산유화'))
  await userEvent.click(screen.getByLabelText('확정만 보기'))
  expect(screen.queryByText('산유화')).not.toBeInTheDocument()
  expect(screen.getAllByText('소나기')).toHaveLength(1)      // v1의 확정본만
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- src/tests/ComparePage.test.jsx` / Expected: FAIL

- [ ] **Step 3: 구현** — `src/board/ComparePage.jsx`:

```jsx
// 권별 비교: 모든 권의 수록 목록을 한 화면에서 나란히 본다 (읽기 전용, 설계 §10 2c)
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listVolumes, listAllVolumeWorks, listAllParts } from './volumeApi.js'
import { groupByPart, partLabel } from './boardUtils.js'
import { SELECTION_LABELS } from './constants.js'
import { useToast } from '../components/Toast.jsx'

const SELECTION_BADGE = {
  candidate: 'bg-gray-100 text-gray-700',
  hold: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  excluded: 'bg-gray-200 text-gray-400 line-through',
}

export default function ComparePage() {
  const [volumes, setVolumes] = useState([])
  const [allVw, setAllVw] = useState([])
  const [allParts, setAllParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmedOnly, setConfirmedOnly] = useState(false)
  const { show } = useToast()

  useEffect(() => {
    Promise.all([listVolumes(), listAllVolumeWorks(), listAllParts()])
      .then(([vs, vw, ps]) => { setVolumes(vs); setAllVw(vw); setAllParts(ps) })
      .catch(err => show(err.message))
      .finally(() => setLoading(false))
  }, [show])

  // work_id → 수록 권 번호 목록 (제외 상태는 겹침 판정에서 뺀다)
  const volumesByWork = useMemo(() => {
    const map = new Map()
    for (const w of allVw) {
      if (w.selection_status === 'excluded') continue
      if (!map.has(w.work_id)) map.set(w.work_id, [])
      map.get(w.work_id).push(w.volume_id)
    }
    return map
  }, [allVw])

  const numberByVolumeId = useMemo(
    () => Object.fromEntries(volumes.map(v => [v.id, v.number])), [volumes],
  )

  if (loading) return <p className="text-gray-500">불러오는 중…</p>

  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        <h2 className="text-lg font-bold">권별 비교</h2>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={confirmedOnly} onChange={e => setConfirmedOnly(e.target.checked)} />
          확정만 보기
        </label>
        <span className="text-xs text-gray-400">노란 배경 = 다른 권과 겹치는 작품 (제외 상태는 겹침에서 뺌)</span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {volumes.map(v => {
          const works = allVw
            .filter(w => w.volume_id === v.id)
            .filter(w => !confirmedOnly || w.selection_status === 'confirmed')
            .sort((a, b) => a.sort_order - b.sort_order)
          const parts = allParts.filter(p => p.volume_id === v.id)
          const groups = groupByPart(works, parts)
          return (
            <div key={v.id} className="w-72 shrink-0 rounded border border-gray-200">
              <Link to={`/volumes/${v.id}`} className="block border-b border-gray-200 bg-gray-50 px-3 py-2 font-semibold hover:bg-gray-100">
                {v.number}권 {v.title}
                <span className="ml-2 text-xs font-normal text-gray-500">{works.length}편 · {v.status}</span>
              </Link>
              <div className="max-h-[70vh] overflow-y-auto p-2">
                {groups.map((g, i) => (
                  <div key={g.part ? g.part.id : `none-${i}`}>
                    {parts.length > 0 && (
                      <div className="mt-2 mb-1 text-xs font-semibold text-gray-400">
                        {g.part ? partLabel(g.part) : '미배정'}
                      </div>
                    )}
                    <ul className="space-y-0.5">
                      {g.works.map(w => {
                        const others = (volumesByWork.get(w.work_id) || []).filter(id => id !== v.id)
                        const isDup = others.length > 0
                        return (
                          <li key={w.id}
                            className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-sm ${isDup ? 'bg-amber-50' : ''}`}>
                            <span className="min-w-0 flex-1 truncate">
                              {w.work_snapshot.title}
                              <span className="ml-1 text-xs text-gray-400">{w.work_snapshot.author}</span>
                            </span>
                            {isDup && (
                              <span className="shrink-0 text-xs text-amber-700">
                                ⚠ {others.map(id => numberByVolumeId[id]).sort((a, b) => a - b).join('·')}권
                              </span>
                            )}
                            <span className={`shrink-0 rounded px-1 py-0.5 text-xs ${SELECTION_BADGE[w.selection_status]}`}>
                              {SELECTION_LABELS[w.selection_status]}
                            </span>
                          </li>
                        )
                      })}
                      {!g.works.length && <li className="py-0.5 text-xs text-gray-300">없음</li>}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {!volumes.length && <p className="text-sm text-gray-400">아직 권이 없습니다.</p>}
      </div>
    </div>
  )
}
```

  - `AppLayout.jsx` MENU에 `{ to: '/compare', label: '권별 비교' }`를 '권별 작품 목록' 다음에 추가
  - `App.jsx`: `import ComparePage from './board/ComparePage.jsx'` + `/volumes/:id` 라우트 다음에 `<Route path="/compare" element={<ComparePage />} />`

- [ ] **Step 4: 통과 확인** — Run: `npm test && npm run build` / Expected: 전부 PASS + 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add src/board/ComparePage.jsx src/components/AppLayout.jsx src/App.jsx src/tests/ComparePage.test.jsx
git commit -m "feat: 권별 비교 페이지 (부 그룹·중복 강조·확정만 필터)"
```

---

### Task 7: 사용자 SQL 적용 + 실사동 검증 + 배포

**Files:** 없음

- [ ] **Step 1: [사용자 작업]** `docs/setup-phase2c.md` — Studio SQL Editor에서 `supabase/phase2c.sql` 실행
- [ ] **Step 2: 로컬 실사동** — 로그인 후:
  - 목록·패널에서 제작 상태 흔적이 없고 진행률 n/m·담당자·마감은 그대로인지
  - 권 상태 select: '제작중'인 기존 권이 그대로 표시되며 4종+legacy 옵션인지 → 실제 값으로 변경해 보기
  - 업무 추가 팝오버가 6종 프리셋인지
  - 패널에서 검토 의견 등록·삭제, 작성자 이름·시각 표시
  - 검색 결과 "수록 N회", 수록 목록 행의 다른 권 뱃지
  - 상단 메뉴 "권별 비교" → 권 카드·부 그룹·⚠ 중복 강조·확정만 보기
- [ ] **Step 3: 배포**

```bash
git push origin master
git tag phase2c-done && git push origin phase2c-done
```

배포 후 운영 사이트에서 검토 의견 1건 등록·비교 페이지 확인.

---

## Self-Review 결과

- **커버리지**: 2c 6개 항목 전부 대응 — 단순화(T1·T2), 프리셋(T1), 검토 의견(T3·T4), 수록 횟수(T5), 중복 뱃지(T5), 비교 페이지(T6).
- **타입 일관성**: crossDups Map 형태(T5 정의=VolumeBoardPage 계산=VolumeWorkList 소비) 일치. listAllVolumeWorks 확장 필드(part_id, sort_order, work_snapshot)를 T6이 소비. filterVolumeWorks 축소 시그니처를 T2가 소비. TASK_PRESETS 6종을 T2 테스트가 소비(image, sort 20).
- **의도적 결정**: T1·T2는 중간 상태가 레드라 한 커밋으로 묶음(같은 구현자에게 연속 배정 권장). 비교 페이지의 겹침 판정에서 excluded 제외(제외한 작품은 더 이상 경합이 아님). 수록 횟수는 검색 결과만(패널은 추후). 의견 Realtime 미적용(패널 열 때 로드로 충분, 기록됨).
- **알려진 한계**: legacy '제작중' 권은 사용자가 값을 바꾸면 목록에서 사라짐(의도). 비교 페이지는 폴링·실시간 없음(새로고침 반영).
