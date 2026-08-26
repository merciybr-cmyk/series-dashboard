# 4단계: 일정(캘린더) + 자료실 + 연락처 제거 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 월간 캘린더로 회의·마감 일정을 관리하고(확인 대상자를 지정하면 그들의 홈 '내 할 일'에 표시), 자료실을 "회의록은 서버 업로드·대용량은 클라우드 링크" 정책으로 열고, 연락처 탭을 제거한다.

**Architecture:** schedules 테이블에 kind('회의'/'마감')와 attendee_ids(uuid[]) 컬럼 추가(2026-08-26 사용자 결정). 캘린더는 순수 함수(monthGrid)로 격자를 만들고 이벤트를 날짜에 매핑. 자료실은 기존 files 테이블·attachments 버킷 재사용(volume_work_id null = 자료실 자료, volume_id로 공통/권별 구분). 홈 '내 할 일'과 '다가오는 마감'에 일정을 업무와 통합 정렬.

**Tech Stack:** 기존과 동일.

**Spec:** [2026-08-13-series-dashboard-design-v2.md](../specs/2026-08-13-series-dashboard-design-v2.md) §5.3 일정/자료실 (본 계획이 사용자 결정으로 세부를 확정)

## Global Constraints

- 일정 종류는 '회의'/'마감' 2종(DB check). 확인 대상자는 attendee_ids uuid[] — **대상자의 홈 '내 할 일'에만** 뜬다(완료 전·D-day 정렬 통합). '다가오는 마감(7일)'에는 대상자 여부와 무관하게 미완료 일정 전부 표시
- 일정 입력·완료·삭제는 전원 가능(전원 편집 원칙 유지 — 주 사용자는 편집자). 수정은 삭제 후 재등록으로 갈음(YAGNI, 계획에 명시)
- 자료실: 서버 업로드는 회의록 등 소용량(기존 50MB 검사 재사용), 대용량은 클라우드 링크 — 화면에 안내 문구 명시. 저장 경로 `library/…`, 한글 파일명 새니타이즈·원본명 다운로드는 기존 규칙 재사용
- 자료실 자료 = files에서 volume_work_id IS NULL인 행. volume_id는 선택(공통=null). 작품 자료(패널)와 완전 분리
- 연락처 메뉴·라우트 제거. §5.2 개인화(담당 권 우선)는 입력 UI가 사라지므로 **무기 보류로 재판정** (Studio에서 assigned_volumes를 넣으면 추후 지원 검토 — 스펙에 기록)
- 캘린더: 월간 격자(일요일 시작), 이전/다음 달 이동, 오늘 표시, 날짜 클릭 → 그 날짜 일정 목록+등록 폼. 이벤트 칩: 회의=파랑, 마감=빨강 계열, 완료=회색 취소선
- 홈 일정 항목은 📅 표시 + /schedule 링크. date-only 비교는 daysUntil 재사용
- 기존 테스트 112건 유지. TDD. 한국어. 커밋 관례 유지

## 파일 구조

```
생성: supabase/phase4.sql            # schedules에 kind·attendee_ids
생성: docs/setup-phase4.md
수정: src/board/volumeApi.js         # 일정 4종 + 자료실 3종 API
생성: src/board/calendarUtils.js     # monthGrid, ymd, eventsByDate
생성: src/board/SchedulePage.jsx     # 캘린더 + 일정 목록/등록
생성: src/board/LibraryPage.jsx      # 자료실
수정: src/board/homeUtils.js         # (변경 없음 — 통합은 HomePage에서) ※ 필요 시만
수정: src/pages/HomePage.jsx         # 내 할 일·다가오는 마감에 일정 통합
수정: src/components/AppLayout.jsx   # 연락처 제거
수정: src/App.jsx                    # 라우트 교체·제거
테스트: calendarUtils/SchedulePage/LibraryPage/HomePage/volumeApi 추가·갱신
```

---

### Task 1: phase4.sql + 일정·자료실 API

**Files:**
- Create: `supabase/phase4.sql`, `docs/setup-phase4.md`
- Modify: `src/board/volumeApi.js`
- Test: `src/tests/volumeApi.test.js` (추가)

**Interfaces (Produces):**
- `listSchedules() → schedule[]` — due_date 오름차순. 행: {id, title, kind, due_date, volume_id, attendee_ids, done, ...}
- `createSchedule({title, kind, due_date, volume_id, attendee_ids}) → schedule` — volume_id는 null 허용, attendee_ids 기본 []
- `updateSchedule(id, patch) → schedule` (done 토글용)
- `deleteSchedule(id) → void`
- `listLibraryFiles() → file[]` — `volume_work_id IS NULL`인 행, created_at 내림차순
- `uploadLibraryFile(file, volumeId) → fileRow` — 경로 `library/${Date.now()}_${safeName}` (uploadFile과 동일한 새니타이즈), insert {name: file.name, kind:'upload', storage_path, volume_id: volumeId ?? null}
- `addLibraryLink(name, url, volumeId) → fileRow` — http(s) 검증은 addFileLink와 동일 규칙
- (deleteFile·getFileUrl은 기존 함수 재사용 — 자료실 행에도 그대로 동작)

- [ ] **Step 1: supabase/phase4.sql**

```sql
-- 4단계: 일정에 종류·확인 대상자 추가 (2026-08-26 사용자 결정)
-- 적용: Supabase Studio SQL Editor에서 1회 실행

alter table public.schedules
  add column kind text not null default '마감' check (kind in ('회의', '마감')),
  add column attendee_ids uuid[] not null default '{}';
```

- [ ] **Step 2: docs/setup-phase4.md** — "SQL Editor에서 supabase/phase4.sql 실행. 이것이 전부다." 형식(기존 setup-phase2c.md와 동일 톤)

- [ ] **Step 3: 실패하는 테스트 추가 (RED)** — `src/tests/volumeApi.test.js` 끝에:

```js
test('일정·자료실 API가 존재한다', () => {
  for (const fn of ['listSchedules', 'createSchedule', 'updateSchedule', 'deleteSchedule',
    'listLibraryFiles', 'uploadLibraryFile', 'addLibraryLink']) {
    expect(typeof api[fn]).toBe('function')
  }
})

test('createSchedule: 기본값과 함께 insert한다', async () => {
  fromResults.push({ data: { id: 's1', title: '3권 편집회의', kind: '회의' }, error: null })
  const s = await api.createSchedule({ title: '3권 편집회의', kind: '회의', due_date: '2026-09-01', volume_id: null, attendee_ids: ['m1'] })
  expect(s.kind).toBe('회의')
  expect(mockSupabase.from).toHaveBeenCalledWith('schedules')
})

test('uploadLibraryFile: library/ 경로에 새니타이즈 키로 업로드한다', async () => {
  const upload = vi.fn().mockResolvedValue({ error: null })
  mockSupabase.storage = { from: vi.fn(() => ({ upload })) }
  fromResults.push({ data: { id: 'f1', kind: 'upload', name: '회의록_0826.hwp' }, error: null })
  const row = await api.uploadLibraryFile({ name: '회의록_0826.hwp', size: 100 }, null)
  expect(row.kind).toBe('upload')
  expect(upload.mock.calls[0][0]).toMatch(/^library\/\d+_[\w.-]+$/)
})

test('addLibraryLink: http(s) 외 스킴을 거부한다', async () => {
  await expect(api.addLibraryLink('자료', 'ftp://x', null)).rejects.toThrow('http')
})
```

- [ ] **Step 4: 실패 확인** — Run: `npm test -- src/tests/volumeApi.test.js` / Expected: FAIL

- [ ] **Step 5: 구현** — `volumeApi.js`. 일정 섹션 신설(genre_picks 섹션 뒤):

```js
// ---------- schedules (일정 — 회의·마감, 2026-08-26 결정) ----------

export async function listSchedules() {
  return unwrap(await supabase.from('schedules').select('*').order('due_date'))
}

export async function createSchedule({ title, kind, due_date, volume_id = null, attendee_ids = [] }) {
  return unwrap(
    await supabase.from('schedules')
      .insert({ title, kind, due_date, volume_id, attendee_ids })
      .select().single(),
  )
}

export async function updateSchedule(id, patch) {
  return unwrap(await supabase.from('schedules').update(patch).eq('id', id).select().single())
}

export async function deleteSchedule(id) {
  unwrap(await supabase.from('schedules').delete().eq('id', id))
}
```

자료실 섹션(files 섹션에 추가):

```js
// 자료실: volume_work_id 없는 행. 회의록 등 소용량만 업로드, 대용량은 클라우드 링크 정책.
export async function listLibraryFiles() {
  return unwrap(
    await supabase.from('files').select('*')
      .is('volume_work_id', null)
      .order('created_at', { ascending: false }),
  )
}

export async function uploadLibraryFile(file, volumeId = null) {
  const safeName = file.name.replace(/[^\w.-]+/g, '_')
  const path = `library/${Date.now()}_${safeName}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw new Error(error.message)
  return unwrap(
    await supabase.from('files')
      .insert({ name: file.name, kind: 'upload', storage_path: path, volume_id: volumeId ?? null })
      .select().single(),
  )
}

export async function addLibraryLink(name, url, volumeId = null) {
  if (!/^https?:\/\//i.test(url)) throw new Error('링크는 http:// 또는 https:// 로 시작해야 합니다')
  return unwrap(
    await supabase.from('files')
      .insert({ name, kind: 'link', url, volume_id: volumeId ?? null })
      .select().single(),
  )
}
```

- [ ] **Step 6: 통과 확인** — Run: `npm test` / Expected: 전부 PASS (112→116)

- [ ] **Step 7: Commit** — `feat: 일정(kind·attendee_ids) SQL + 일정·자료실 API`

---

### Task 2: calendarUtils (순수 함수)

**Files:**
- Create: `src/board/calendarUtils.js`
- Test: `src/tests/calendarUtils.test.js`

**Interfaces (Produces):**
- `ymd(date) → 'YYYY-MM-DD'` (로컬 기준)
- `monthGrid(year, month0) → Date[][]` — 일요일 시작 주 단위 격자, 앞뒤 달 날짜 포함해 4~6주
- `eventsByDate(schedules) → Map<'YYYY-MM-DD', schedule[]>`
- `monthLabel(year, month0) → '2026년 9월'`

- [ ] **Step 1: 실패하는 테스트 작성 (RED)** — `src/tests/calendarUtils.test.js`:

```js
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
```

- [ ] **Step 2: RED 확인 → Step 3: 구현**

```js
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
```

- [ ] **Step 4: 통과 확인** (112→116→120) → **Step 5: Commit** — `feat: 캘린더 격자 순수 함수`

---

### Task 3: SchedulePage (캘린더 + 등록/완료/삭제)

**Files:**
- Create: `src/board/SchedulePage.jsx`
- Modify: `src/App.jsx` — `/schedule` Placeholder를 SchedulePage로 교체
- Test: `src/tests/SchedulePage.test.jsx`

**Interfaces:**
- Consumes: Task 1 일정 API + listVolumes + listMembers, Task 2 calendarUtils, MultiSelectDropdown(참석자 이름 다중 선택 — VolumeWorkList 담당자 필터와 동일한 이름↔id 매핑 패턴), useToast
- Produces: `/schedule` — 상단 [◀ 2026년 9월 ▶] + 격자(오늘 파란 테두리, 다른 달 날짜 회색, 이벤트 칩: 회의 `bg-blue-100 text-blue-800`/마감 `bg-red-100 text-red-800`/완료 `line-through text-gray-400`, 셀당 3개+"+N"), 날짜 클릭 → 아래 "N월 N일 일정" 목록(완료 체크박스·삭제 ✕ confirm·확인 대상자 이름들·관련 권) + 등록 폼(제목, 종류 select 회의/마감, 관련 권 select(없음/각 권), 확인 대상자 MultiSelectDropdown). 수정 기능 없음(삭제 후 재등록 안내 툴팁)

- [ ] **Step 1: 실패하는 테스트 작성 (RED)** — `src/tests/SchedulePage.test.jsx`:

```jsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  listSchedules: vi.fn(),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  listVolumes: vi.fn().mockResolvedValue([{ id: 'v1', number: 1, title: '삶', status: '선정중' }]),
  listMembers: vi.fn().mockResolvedValue([{ id: 'm1', name: '윤보라' }, { id: 'm2', name: '김위원' }]),
}))
const api = await import('../board/volumeApi.js')
const { default: SchedulePage } = await import('../board/SchedulePage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')
const { ymd } = await import('../board/calendarUtils.js')

const TODAY = ymd(new Date())

function renderPage() {
  return render(<ToastProvider><SchedulePage /></ToastProvider>)
}

test('오늘 날짜의 일정이 캘린더와 목록에 보인다', async () => {
  api.listSchedules.mockResolvedValue([
    { id: 's1', title: '편집회의', kind: '회의', due_date: TODAY, volume_id: null, attendee_ids: ['m2'], done: false },
  ])
  renderPage()
  await waitFor(() => expect(screen.getAllByText('편집회의').length).toBeGreaterThanOrEqual(1))
  expect(screen.getByText(/김위원/)).toBeInTheDocument() // 목록의 확인 대상자
})

test('일정을 등록하면 createSchedule이 호출된다', async () => {
  api.listSchedules.mockResolvedValue([])
  api.createSchedule.mockResolvedValue({ id: 's9', title: '원고 마감', kind: '마감', due_date: TODAY, volume_id: null, attendee_ids: [], done: false })
  renderPage()
  await waitFor(() => screen.getByLabelText('일정 제목'))
  await userEvent.type(screen.getByLabelText('일정 제목'), '원고 마감')
  await userEvent.selectOptions(screen.getByLabelText('종류'), '마감')
  await userEvent.click(screen.getByRole('button', { name: '일정 등록' }))
  expect(api.createSchedule).toHaveBeenCalledWith(expect.objectContaining({
    title: '원고 마감', kind: '마감', due_date: TODAY,
  }))
  await waitFor(() => expect(screen.getAllByText('원고 마감').length).toBeGreaterThanOrEqual(1))
})

test('완료 체크와 삭제가 동작한다', async () => {
  api.listSchedules.mockResolvedValue([
    { id: 's1', title: '편집회의', kind: '회의', due_date: TODAY, volume_id: null, attendee_ids: [], done: false },
  ])
  api.updateSchedule.mockResolvedValue({ id: 's1', title: '편집회의', kind: '회의', due_date: TODAY, volume_id: null, attendee_ids: [], done: true })
  api.deleteSchedule.mockResolvedValue()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  renderPage()
  await waitFor(() => screen.getByRole('checkbox', { name: /편집회의 완료/ }))
  await userEvent.click(screen.getByRole('checkbox', { name: /편집회의 완료/ }))
  expect(api.updateSchedule).toHaveBeenCalledWith('s1', { done: true })
  await userEvent.click(screen.getByRole('button', { name: '편집회의 삭제' }))
  expect(api.deleteSchedule).toHaveBeenCalledWith('s1')
  window.confirm.mockRestore()
})
```

- [ ] **Step 2: RED 확인 → Step 3: 구현** — `src/board/SchedulePage.jsx` (아래 골격을 완전한 형태로 구현):

핵심 구조 (구현자는 이 계약을 정확히 지킨다 — 세부 스타일은 기존 페이지 관례 재사용):

```jsx
// 일정: 월간 캘린더 + 회의·마감 등록 (2026-08-26 사용자 결정)
// - 확인 대상자(attendee_ids)로 지정된 구성원의 홈 '내 할 일'에 뜬다
// - 수정은 삭제 후 재등록 (YAGNI)
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from './volumeApi.js'
import { ymd, monthGrid, eventsByDate, monthLabel } from './calendarUtils.js'
import MultiSelectDropdown from './MultiSelectDropdown.jsx'
import { useToast } from '../components/Toast.jsx'

const KIND_CHIP = { '회의': 'bg-blue-100 text-blue-800', '마감': 'bg-red-100 text-red-800' }

export default function SchedulePage() { ... }
```

상태: `cursor {y, m}`(오늘 기준), `selected`(ymd, 기본 오늘), `schedules/volumes/members`, 폼(title, kind='회의', volumeId='', attendeeIds=[]). 로드: listSchedules/listVolumes/listMembers. 격자 렌더: monthGrid(cursor.y, cursor.m) → 주×7 테이블, 셀에 날짜 숫자(오늘 `ring-1 ring-blue-500`, 다른 달 `text-gray-300`), eventsByDate 칩(제목 truncate, KIND_CHIP, done이면 `line-through text-gray-400 bg-gray-100`), 3개 초과 시 `+N`. 셀 클릭 → setSelected. 선택 날짜 섹션: `{M}월 {D}일 일정` 목록 — 행: 완료 체크박스(aria-label `${title} 완료`) · 종류 칩 · 제목 · 관련 권(`{number}권`) · 확인 대상자 이름들(join ', ') · 삭제 버튼(aria-label `${title} 삭제`, confirm '이 일정을 삭제할까요?'). 등록 폼: input(aria-label '일정 제목'), select(aria-label '종류', 회의/마감), select(aria-label '관련 권', 없음+각 권), MultiSelectDropdown(label '확인 대상자', 이름 배열↔id 매핑), 버튼 '일정 등록' → createSchedule({title, kind, due_date: selected, volume_id: volumeId || null, attendee_ids}) → 성공 시 로컬 추가·폼 리셋, 실패 토스트. 완료 토글 → updateSchedule(id, {done}), 삭제 → deleteSchedule.

`App.jsx`: `import SchedulePage from './board/SchedulePage.jsx'` + `/schedule` 라우트 교체.

- [ ] **Step 4: 통과+빌드 확인** (120→123) → **Step 5: Commit** — `feat: 일정 캘린더 (회의·마감, 확인 대상자)`

---

### Task 4: LibraryPage + 연락처 제거

**Files:**
- Create: `src/board/LibraryPage.jsx`
- Modify: `src/App.jsx`(라이브러리 라우트 교체 + 연락처 라우트 제거), `src/components/AppLayout.jsx`(연락처 메뉴 제거)
- Test: `src/tests/LibraryPage.test.jsx`

**Interfaces:**
- Consumes: Task 1의 listLibraryFiles/uploadLibraryFile/addLibraryLink + 기존 deleteFile/getFileUrl + listVolumes + listMembers(등록자 이름), useToast
- Produces: `/library` — 상단 안내 문구("서버 업로드는 회의록 등 소용량 파일만(50MB), 원고·PDF 등 대용량 자료는 클라우드 링크로 등록해 주세요"), 필터 select(aria-label '권 필터': 전체/공통/각 권), [회의록 업로드](숨김 file input aria-label '자료실 파일 선택', 50MB 검사·토스트는 패널과 동일 문구) + 권 선택 select(aria-label '등록할 권', 기본 공통), [클라우드 링크 등록] 토글 폼(이름·URL·권). 목록 행: 📄/🔗 이름(클릭=열기: 링크는 새 탭, 업로드는 getFileUrl(path, name) 새 탭) · 권 태그(공통이면 '공통') · 등록자 이름 · 날짜 · 삭제 ✕(confirm)
- 연락처: MENU에서 제거, `/contacts` 라우트 삭제(연락처 Placeholder 접근 시 catch-all AuthCallback이 홈으로 보냄 — 별도 처리 불필요)

- [ ] **Step 1: 실패하는 테스트 작성 (RED)** — `src/tests/LibraryPage.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  listLibraryFiles: vi.fn(),
  uploadLibraryFile: vi.fn(),
  addLibraryLink: vi.fn(),
  deleteFile: vi.fn(),
  getFileUrl: vi.fn(),
  listVolumes: vi.fn().mockResolvedValue([{ id: 'v1', number: 1, title: '삶', status: '선정중' }]),
  listMembers: vi.fn().mockResolvedValue([{ id: 'm1', name: '윤보라' }]),
}))
const api = await import('../board/volumeApi.js')
const { default: LibraryPage } = await import('../board/LibraryPage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

function renderPage() {
  return render(<ToastProvider><LibraryPage /></ToastProvider>)
}

test('자료 목록을 등록자·권 태그와 함께 보여준다', async () => {
  api.listLibraryFiles.mockResolvedValue([
    { id: 'f1', kind: 'upload', name: '8월 회의록.hwp', volume_id: null, uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', storage_path: 'library/x' },
    { id: 'f2', kind: 'link', name: '1권 원고 모음', volume_id: 'v1', uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', url: 'https://drive.example.com' },
  ])
  renderPage()
  await waitFor(() => expect(screen.getByText(/8월 회의록\.hwp/)).toBeInTheDocument())
  expect(screen.getByText('공통')).toBeInTheDocument()
  expect(screen.getByText('1권')).toBeInTheDocument()
})

test('권 필터가 목록을 거른다', async () => {
  api.listLibraryFiles.mockResolvedValue([
    { id: 'f1', kind: 'upload', name: '회의록.hwp', volume_id: null, uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', storage_path: 'p' },
    { id: 'f2', kind: 'link', name: '1권 자료', volume_id: 'v1', uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', url: 'https://x.com' },
  ])
  renderPage()
  await waitFor(() => screen.getByText(/회의록\.hwp/))
  await userEvent.selectOptions(screen.getByLabelText('권 필터'), '공통')
  expect(screen.queryByText('1권 자료')).not.toBeInTheDocument()
  expect(screen.getByText(/회의록\.hwp/)).toBeInTheDocument()
})

test('클라우드 링크를 등록한다', async () => {
  api.listLibraryFiles.mockResolvedValue([])
  api.addLibraryLink.mockResolvedValue({ id: 'f9', kind: 'link', name: '원고 폴더', volume_id: null, uploaded_by: 'm1', created_at: '2026-08-26T09:00:00Z', url: 'https://d.com' })
  renderPage()
  await waitFor(() => screen.getByRole('button', { name: '클라우드 링크 등록' }))
  await userEvent.click(screen.getByRole('button', { name: '클라우드 링크 등록' }))
  await userEvent.type(screen.getByPlaceholderText('자료 이름'), '원고 폴더')
  await userEvent.type(screen.getByPlaceholderText('https://…'), 'https://d.com')
  await userEvent.click(screen.getByRole('button', { name: '등록' }))
  expect(api.addLibraryLink).toHaveBeenCalledWith('원고 폴더', 'https://d.com', null)
  await waitFor(() => expect(screen.getByText('원고 폴더')).toBeInTheDocument())
})
```

- [ ] **Step 2: RED 확인 → Step 3: 구현** — LibraryPage(위 계약대로 — 목록·필터·업로드·링크 폼·삭제·열기. 패널 자료 섹션의 핸들러 패턴 재사용, 등록자 이름은 members 매핑, 날짜는 toLocaleDateString), AppLayout MENU에서 연락처 항목 삭제, App.jsx에서 `/library` 교체·`/contacts` 라우트 삭제(연락처 Placeholder import 정리)

- [ ] **Step 4: 통과+빌드 확인** (123→126) → **Step 5: Commit** — `feat: 자료실(회의록 업로드·클라우드 링크) + 연락처 탭 제거`

---

### Task 5: 홈 '내 할 일'·'다가오는 마감'에 일정 통합

**Files:**
- Modify: `src/pages/HomePage.jsx`
- Test: `src/tests/HomePage.test.jsx` (목·테스트 추가)

**Interfaces:**
- Consumes: Task 1 listSchedules
- Produces:
  - load에 listSchedules 추가 (Promise.all 7번째)
  - 내 할 일: 기존 업무 + **내가 확인 대상자인 미완료 일정**을 통합해 sortMyTasks로 정렬. 일정 항목은 `📅 {kind} · {title}` (+관련 권 있으면 `{n}권 · ` 접두) 표시, D-day 동일, 링크 `/schedule`
  - 다가오는 마감(7일): 기존 업무 + 미완료 일정 전부(대상자 무관) 통합, due_date 순. 일정 항목 동일 표기
  - 구현: computed에서 `const mySchedules = data.schedules.filter(s => !s.done && (s.attendee_ids || []).includes(member?.id))`; 통합 배열 원소는 `{ kind: 'task'|'schedule', id, due_date, ... }` 래퍼로 만들어 sortMyTasks에 통과(정렬 키는 due_date만 쓰므로 그대로 동작). 렌더에서 kind 분기

- [ ] **Step 1: 실패하는 테스트 추가 (RED)** — HomePage.test.jsx: 목 팩토리에 `listSchedules: vi.fn().mockResolvedValue([])` 추가, setup에 schedules 파라미터 추가. 신규 테스트:

```jsx
test('확인 대상자인 일정이 내 할 일에 📅로 뜬다', async () => {
  setup({
    schedules: [
      { id: 's1', title: '편집회의', kind: '회의', due_date: futureDateStr(3), volume_id: null, attendee_ids: ['m1'], done: false },
      { id: 's2', title: '남의 회의', kind: '회의', due_date: futureDateStr(3), volume_id: null, attendee_ids: ['m2'], done: false },
    ],
  })
  await waitFor(() => expect(screen.getByText(/📅 회의 · 편집회의/)).toBeInTheDocument())
  expect(screen.queryByText(/남의 회의/)).toBeInTheDocument() // 다가오는 마감에는 전체 표시
  const myCard = screen.getByText('내 할 일').closest('section')
  expect(within(myCard).queryByText(/남의 회의/)).not.toBeInTheDocument()
})
```

(`within`을 '@testing-library/react'에서 import, `futureDateStr`은 파일에 이미 있는 헬퍼 재사용 — 없으면 동일 구현 추가)

- [ ] **Step 2: RED 확인 → Step 3: 구현** — 위 계약대로 HomePage 수정 (렌더 분기: schedule 항목은 Link to="/schedule", 텍스트 `📅 {kind} · {제목}`; 관련 권 번호는 data.volumes에서 volume_id 매칭)

- [ ] **Step 4: 통과+빌드 확인** (126→127) → **Step 5: Commit** — `feat: 홈 내 할 일·마감에 일정 통합`

---

### Task 6: 사용자 SQL + 실사동 검증 + 배포

- [ ] **Step 1: [사용자 작업]** Studio에서 `supabase/phase4.sql` 실행
- [ ] **Step 2: 실사동** — 일정: 캘린더에 회의 등록(확인 대상자 = 본인) → 캘린더 칩·목록 표시 → 홈 내 할 일에 📅 표시 → 완료 체크 → 홈에서 사라짐. 자료실: 회의록 파일 업로드(한글 파일명)·클라우드 링크 등록·권 필터·열기·삭제. 연락처 메뉴 사라짐 확인
- [ ] **Step 3: 배포** — push → `phase4-done` 태그

---

## Self-Review 결과

- **커버리지**: 일정(캘린더·회의/마감·대상자·홈 통합 — T1·T2·T3·T5), 자료실(회의록 업로드+클라우드 링크 정책 — T1·T4), 연락처 제거(T4). 사용자 결정 3건 모두 반영.
- **타입 일관성**: schedules 행 형태(kind·attendee_ids·done)를 T3 폼·T5 홈이 동일 소비. ymd/monthGrid 시그니처 T2↔T3. uploadLibraryFile(file, volumeId) T1↔T4. 자료실 행에 기존 deleteFile/getFileUrl 재사용 가능(kind·storage_path 동일 스키마).
- **의도적 결정**: 일정 수정 미제공(삭제 후 재등록), 대상자 아닌 일정도 '다가오는 마감'에는 표시(팀 전체 가시성), 자료실 realtime 없음(수동 새로고침 — 파일 변경은 §7 범위 외 기존 방침), 연락처 제거로 §5.2 개인화 무기 보류.
- **알려진 한계**: attendee_ids는 uuid[] — 구성원 삭제 시 잔존 id는 이름 미표시로만 나타남(구성원 삭제는 Studio 수동 작업이라 빈도 극히 낮음).
