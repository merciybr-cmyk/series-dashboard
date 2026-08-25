# 3단계: 홈 화면 + 해제 원고 업로드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인하면 "오늘 내가 할 일"과 "주의가 필요한 작품"이 바로 보이는 홈 화면을 만들고, 작품 상세 패널에서 해제 원고 등 자료를 업로드·링크 첨부해 확정 작품의 산출물 누락을 자동 감지한다.

**Architecture:** 홈은 읽기 전용 집계 화면 — 전역 조회 4종(업무·수록·자료·활동)을 한 번에 로드해 순수 함수(homeUtils)로 우선순위·주의 규칙·진행률·피드 문구를 계산하고, 기존 subscribeBoard로 실시간 갱신. 자료는 Supabase Storage 비공개 버킷(attachments) + 기존 files 테이블(volume_work_id) — 업로더 기록은 DB 트리거.

**Tech Stack:** 기존과 동일 (React 19, supabase-js 2 — storage API 첫 사용, Vitest 4).

**Spec:** [2026-08-13-series-dashboard-design-v2.md](../specs/2026-08-13-series-dashboard-design-v2.md) — §5.1(자료), §5.2(홈), §5.3(구조), §10 3행

## Global Constraints

- 주의 필요 규칙(§5.2 표에서 production 관련 2건 제거된 현행): ①(높음) 마감 지난 미완료 업무 ②(높음) 확정인데 업무 0건 ③(중간) 마감 7일 이내 미완료 업무인데 담당자 미지정 ④(중간) 확정인데 연결 자료 0건. 저작권 규칙(작가 단위)은 5단계로 미룸
- 내 할 일 우선순위: 마감 지남 > 오늘 > 3일 이내 > 7일 이내 > 그 외. 아이콘 🔴/🟠/🟡/(없음). 클릭 시 해당 작품 상세 패널이 열리게 — 딥링크 `/volumes/:id?vw=:vwId`
- 완료 처리는 홈에서 하지 않는다(패널에서) — §5.2 결정
- 다가오는 마감은 work_tasks 기준 7일 이내(미완료)만 — schedules 테이블 통합은 4단계에서
- 홈 구조 순서: [내 할 일 | 주의 필요] → [다가오는 마감] → [권별 진행 현황] → [최근 활동] (§5.3)
- 활동 피드 문구는 순수 함수로 생성·유닛 테스트 (§4 activity_log). 해석 불가한 항목은 일반 문구 폴백 — 절대 크래시 금지
- 자료: 업로드(비공개 버킷 attachments, 50MB/건 클라이언트 검사, 다운로드는 1시간 서명 URL)와 링크 첨부 병행 (§5.1). uploaded_by는 DB 트리거 자동 기록(클라이언트 미전송)
- 자료 섹션 위치: 검토 의견과 최근 변경 사이. 수록 목록 행에는 자료 보유 시 📄 표시
- 부/권 없는 데이터 상태에서도 홈이 빈 안내와 함께 정상 렌더
- date-only 비교는 기존 daysUntil(KST) 재사용. 기존 테스트 80건 유지. TDD. 한국어 문구. 커밋 접두사 관례 유지

## 파일 구조

```
생성: supabase/phase3.sql            # attachments 버킷+스토리지 정책+files.uploaded_by 트리거
생성: docs/setup-phase3.md           # 사용자 SQL 실행 절차
수정: src/board/volumeApi.js         # 전역 조회 3종 + 자료 API 5종
생성: src/board/homeUtils.js         # 우선순위·주의 규칙·진행률·피드 문구 (순수 함수)
수정: src/board/WorkDetailPanel.jsx  # 자료 섹션 (업로드·링크·목록·삭제·다운로드)
수정: src/board/VolumeWorkList.jsx   # 📄 표시 (hasFiles prop)
수정: src/board/VolumeBoardPage.jsx  # 자료 데이터 배선 + ?vw= 딥링크
수정: src/pages/HomePage.jsx         # 자리표시 → 실제 홈 (5개 섹션 + Realtime)
테스트: 신규 homeUtils/HomePage/자료 관련 + 기존 소폭 확장
```

---

### Task 1: phase3.sql + 전역 조회·자료 API

**Files:**
- Create: `supabase/phase3.sql`, `docs/setup-phase3.md`
- Modify: `src/board/volumeApi.js`
- Test: `src/tests/volumeApi.test.js` (추가)

**Interfaces:**
- Produces (전부 async, 실패 시 Error throw):
  - `listAllTasks() → task[]` — 각 행에 `volume_works(id, volume_id, work_id, selection_status, work_snapshot, volumes(number, title))` 중첩
  - `listAllFiles() → [{id, volume_work_id, kind, name}]` — volume_work_id가 있는 행만
  - `listActivity(limit = 20) → activity[]` — id 내림차순
  - `listFiles(volumeWorkId) → file[]` — created_at 오름차순
  - `uploadFile(volumeWorkId, file) → fileRow` — storage 경로 `${volumeWorkId}/${Date.now()}_${file.name}` 업로드 후 files insert(kind 'upload', name=file.name, storage_path). uploaded_by 미전송(트리거)
  - `addFileLink(volumeWorkId, name, url) → fileRow` — kind 'link'
  - `deleteFile(fileRow) → void` — upload면 storage 객체도 제거
  - `getFileUrl(storagePath) → string` — 1시간 서명 URL

- [ ] **Step 1: supabase/phase3.sql 작성**

```sql
-- 3단계 스키마: 자료 업로드용 비공개 버킷 + 업로더 자동 기록 (설계 §5.1 자료)
-- 적용: Supabase Studio SQL Editor에서 1회 실행 (docs/setup-phase3.md)

-- (1) 비공개 버킷
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false);

-- (2) 스토리지 접근: 구성원만 읽기/쓰기
create policy attachments_member_all on storage.objects
  for all to authenticated
  using (bucket_id = 'attachments' and public.is_member())
  with check (bucket_id = 'attachments' and public.is_member());

-- (3) files.uploaded_by 자동 기록 (클라이언트 입력을 믿지 않는다 — §6.4)
create function public.set_file_uploader()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  new.uploaded_by := public.current_member_id();
  return new;
end;
$$;

create trigger files_uploader before insert on public.files
  for each row execute function public.set_file_uploader();
```

- [ ] **Step 2: docs/setup-phase3.md 작성**

```markdown
# 3단계 세팅 절차 (1회, 사람 작업)

Supabase Studio → SQL Editor에서 `supabase/phase3.sql` 내용을 붙여넣고 Run.
성공하면 Storage에 attachments 버킷이 보인다. 이것이 전부다.
```

- [ ] **Step 3: 실패하는 테스트 추가 (RED)** — `src/tests/volumeApi.test.js` 끝에 (기존 chain 목 사용; storage 목은 mockSupabase에 `storage: { from: vi.fn() }` 추가가 필요하면 팩토리에 추가하되 기존 테스트 무수정):

```js
test('전역 조회·자료 API가 존재한다', () => {
  for (const fn of ['listAllTasks', 'listAllFiles', 'listActivity', 'listFiles', 'uploadFile', 'addFileLink', 'deleteFile', 'getFileUrl']) {
    expect(typeof api[fn]).toBe('function')
  }
})

test('uploadFile: storage 업로드 성공 시 files에 insert한다', async () => {
  mockSupabase.storage = {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ error: null }),
    })),
  }
  fromResults.push({ data: { id: 'f1', kind: 'upload', name: '해제.hwp' }, error: null })
  const row = await api.uploadFile('vw1', { name: '해제.hwp', size: 1000 })
  expect(row.kind).toBe('upload')
  expect(mockSupabase.storage.from).toHaveBeenCalledWith('attachments')
})
```

- [ ] **Step 4: 실패 확인** — Run: `npm test -- src/tests/volumeApi.test.js` / Expected: FAIL

- [ ] **Step 5: 구현** — `volumeApi.js`에 추가 (기타 섹션 앞에 자료·전역 조회 섹션 신설):

```js
// ---------- 전역 조회 (홈 화면) ----------

export async function listAllTasks() {
  return unwrap(
    await supabase.from('work_tasks')
      .select('*, volume_works(id, volume_id, work_id, selection_status, work_snapshot, volumes(number, title))'),
  )
}

export async function listAllFiles() {
  return unwrap(
    await supabase.from('files').select('id, volume_work_id, kind, name')
      .not('volume_work_id', 'is', null),
  )
}

export async function listActivity(limit = 20) {
  return unwrap(
    await supabase.from('activity_log').select('*').order('id', { ascending: false }).limit(limit),
  )
}

// ---------- files (작품 자료 — 설계 §5.1) ----------

const BUCKET = 'attachments'

export async function listFiles(volumeWorkId) {
  return unwrap(
    await supabase.from('files').select('*')
      .eq('volume_work_id', volumeWorkId).order('created_at'),
  )
}

export async function uploadFile(volumeWorkId, file) {
  const path = `${volumeWorkId}/${Date.now()}_${file.name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw new Error(error.message)
  return unwrap(
    await supabase.from('files')
      .insert({ name: file.name, volume_work_id: volumeWorkId, kind: 'upload', storage_path: path })
      .select().single(),
  )
}

export async function addFileLink(volumeWorkId, name, url) {
  return unwrap(
    await supabase.from('files')
      .insert({ name, volume_work_id: volumeWorkId, kind: 'link', url })
      .select().single(),
  )
}

export async function deleteFile(fileRow) {
  if (fileRow.kind === 'upload' && fileRow.storage_path) {
    await supabase.storage.from(BUCKET).remove([fileRow.storage_path])
  }
  unwrap(await supabase.from('files').delete().eq('id', fileRow.id))
}

export async function getFileUrl(storagePath) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 3600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
```

- [ ] **Step 6: 통과 확인** — Run: `npm test` / Expected: 전부 PASS (80→82)

- [ ] **Step 7: Commit**

```bash
git add supabase/phase3.sql docs/setup-phase3.md src/board/volumeApi.js src/tests/volumeApi.test.js
git commit -m "feat: 자료 버킷·업로더 트리거 SQL + 전역 조회·자료 API"
```

---

### Task 2: homeUtils (우선순위·주의 규칙·진행률·피드 문구)

**Files:**
- Create: `src/board/homeUtils.js`
- Test: `src/tests/homeUtils.test.js`

**Interfaces:**
- Consumes: `daysUntil`, `dDayLabel` (boardUtils), `SELECTION_LABELS` (constants)
- Produces (전부 순수 함수):
  - `taskUrgency(dueDate, now) → 'overdue'|'today'|'d3'|'d7'|'none'`
  - `urgencyIcon(u) → '🔴'|'🟠'|'🟡'|''` (overdue/today→🔴🟠, d3→🟡, 그 외 '')
  - `sortMyTasks(tasks, now) → tasks` — 긴급도순, 같은 급이면 마감일순(무마감 마지막)
  - `buildAttention(vworks, tasksByVw, fileVwIds, now) → [{level:'high'|'mid', text, volumeId, vwId}]` — Global Constraints의 규칙 ①~④. vworks 행은 listAllVolumeWorks 형태(volumes.number, work_snapshot 포함). high 먼저, 규칙 순서대로
  - `volumeProgress(volumes, allVw, allTasks) → [{volume, total, confirmed, done, taskTotal, pct}]` — pct는 업무 기준(taskTotal 0이면 null)
  - `describeActivity(entry, nameOf) → string` — nameOf(memberId)→이름. 주요 조합(작품 추가/선정 상태 변경/작품 제거/업무 추가/업무 완료/권 생성/부 추가/의견… 등) 한국어 문구, 그 외 "항목을 변경했습니다" 폴백. diff가 null이어도 크래시 금지

- [ ] **Step 1: 실패하는 테스트 작성 (RED)** — `src/tests/homeUtils.test.js`:

```js
import {
  taskUrgency, urgencyIcon, sortMyTasks, buildAttention, volumeProgress, describeActivity,
} from '../board/homeUtils.js'

const NOW = new Date(2026, 7, 25) // 2026-08-25

test('taskUrgency: 지남/오늘/3일/7일/그 외', () => {
  expect(taskUrgency('2026-08-24', NOW)).toBe('overdue')
  expect(taskUrgency('2026-08-25', NOW)).toBe('today')
  expect(taskUrgency('2026-08-28', NOW)).toBe('d3')
  expect(taskUrgency('2026-09-01', NOW)).toBe('d7')
  expect(taskUrgency('2026-10-01', NOW)).toBe('none')
  expect(taskUrgency(null, NOW)).toBe('none')
})

test('urgencyIcon', () => {
  expect(urgencyIcon('overdue')).toBe('🔴')
  expect(urgencyIcon('today')).toBe('🟠')
  expect(urgencyIcon('d3')).toBe('🟡')
  expect(urgencyIcon('d7')).toBe('')
})

test('sortMyTasks: 긴급도순 → 마감일순, 무마감 마지막', () => {
  const sorted = sortMyTasks([
    { id: 'a', due_date: null },
    { id: 'b', due_date: '2026-08-27' },
    { id: 'c', due_date: '2026-08-24' },
    { id: 'd', due_date: '2026-08-26' },
  ], NOW)
  expect(sorted.map(t => t.id)).toEqual(['c', 'd', 'b', 'a'])
})

const VW = (id, sel, num, title) => ({
  id, selection_status: sel, volume_id: 'v' + num,
  volumes: { number: num, title: '주제' }, work_snapshot: { title, author: '작가' },
})

test('buildAttention: 4개 규칙과 우선순위', () => {
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

test('volumeProgress: 권별 확정·업무 진행률', () => {
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

test('describeActivity: 주요 문구와 폴백', () => {
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
  )).toBe('윤보라님이 항목을 변경했습니다')
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- src/tests/homeUtils.test.js` / Expected: FAIL

- [ ] **Step 3: 구현** — `src/board/homeUtils.js`:

```js
// 홈 화면 집계 순수 함수 (설계 §5.2). 화면과 분리해 유닛 테스트한다.
import { daysUntil, dDayLabel } from './boardUtils.js'
import { SELECTION_LABELS } from './constants.js'

export function taskUrgency(dueDate, now = new Date()) {
  if (!dueDate) return 'none'
  const d = daysUntil(dueDate, now)
  if (d < 0) return 'overdue'
  if (d === 0) return 'today'
  if (d <= 3) return 'd3'
  if (d <= 7) return 'd7'
  return 'none'
}

const URGENCY_ORDER = { overdue: 0, today: 1, d3: 2, d7: 3, none: 4 }

export function urgencyIcon(u) {
  return { overdue: '🔴', today: '🟠', d3: '🟡' }[u] || ''
}

export function sortMyTasks(tasks, now = new Date()) {
  return [...tasks].sort((a, b) => {
    const u = URGENCY_ORDER[taskUrgency(a.due_date, now)] - URGENCY_ORDER[taskUrgency(b.due_date, now)]
    if (u) return u
    return (a.due_date || '9999-12-31').localeCompare(b.due_date || '9999-12-31')
  })
}

function workLabel(vw) {
  const num = vw.volumes?.number
  const title = vw.work_snapshot?.title || '작품'
  return `${num != null ? `${num}권 ` : ''}「${title}」`
}

// 주의 필요 규칙 (Global Constraints ①~④). high 먼저.
export function buildAttention(vworks, tasksByVw, fileVwIds, now = new Date()) {
  const high = []
  const mid = []
  for (const vw of vworks) {
    const tasks = tasksByVw[vw.id] || []
    const item = (level, text) =>
      (level === 'high' ? high : mid).push({ level, text, volumeId: vw.volume_id, vwId: vw.id })

    for (const t of tasks) {
      if (t.status !== 'done' && t.due_date && daysUntil(t.due_date, now) < 0) {
        item('high', `${workLabel(vw)} ${t.title} — 마감 ${dDayLabel(daysUntil(t.due_date, now))}`)
      }
    }
    if (vw.selection_status === 'confirmed' && tasks.length === 0) {
      item('high', `${workLabel(vw)} — 확정 작품인데 업무가 없습니다`)
    }
    for (const t of tasks) {
      const d = t.due_date ? daysUntil(t.due_date, now) : null
      if (t.status !== 'done' && d != null && d >= 0 && d <= 7 && !t.assignee_id) {
        item('mid', `${workLabel(vw)} ${t.title} — 마감 ${dDayLabel(d)}인데 담당자가 없습니다`)
      }
    }
    if (vw.selection_status === 'confirmed' && !fileVwIds.has(vw.id)) {
      item('mid', `${workLabel(vw)} — 확정 작품인데 자료가 없습니다 (해제 원고 등)`)
    }
  }
  return [...high, ...mid]
}

export function volumeProgress(volumes, allVw, allTasks) {
  return volumes.map(v => {
    const works = allVw.filter(w => w.volume_id === v.id)
    const tasks = allTasks.filter(t => t.volume_works?.volume_id === v.id)
    const done = tasks.filter(t => t.status === 'done').length
    return {
      volume: v,
      total: works.length,
      confirmed: works.filter(w => w.selection_status === 'confirmed').length,
      done,
      taskTotal: tasks.length,
      pct: tasks.length ? Math.round((done / tasks.length) * 100) : null,
    }
  })
}

export function describeActivity(entry, nameOf) {
  const name = `${nameOf(entry.actor_id) || '누군가'}님이`
  const d = entry.diff || {}
  const t = entry.table_name
  const a = entry.action
  if (t === 'volume_works') {
    if (a === 'insert') return `${name} 「${d.work_snapshot?.title || '작품'}」을(를) 추가했습니다`
    if (a === 'delete') return `${name} 「${d.work_snapshot?.title || '작품'}」을(를) 제거했습니다`
    if (a === 'update' && d.selection_status) {
      return `${name} 선정 상태를 '${SELECTION_LABELS[d.selection_status[1]] || d.selection_status[1]}'(으)로 변경했습니다`
    }
    if (a === 'update' && d.part_id) return `${name} 작품의 부를 변경했습니다`
    if (a === 'update') return `${name} 작품 정보를 변경했습니다`
  }
  if (t === 'work_tasks') {
    if (a === 'insert') return `${name} 업무 '${d.title || ''}'을(를) 추가했습니다`
    if (a === 'delete') return `${name} 업무를 삭제했습니다`
    if (a === 'update' && d.status?.[1] === 'done') return `${name} 업무를 완료했습니다`
    if (a === 'update' && d.assignee_id) return `${name} 업무 담당자를 변경했습니다`
    if (a === 'update' && d.due_date) return `${name} 업무 마감일을 변경했습니다`
    if (a === 'update') return `${name} 업무를 변경했습니다`
  }
  if (t === 'volumes') {
    if (a === 'insert') return `${name} ${d.number != null ? `${d.number}권` : '권'}을 만들었습니다`
    if (a === 'delete') return `${name} 권을 삭제했습니다`
    if (a === 'update') return `${name} 권 정보를 변경했습니다`
  }
  if (t === 'volume_parts') {
    if (a === 'insert') return `${name} 부를 추가했습니다`
    if (a === 'delete') return `${name} 부를 삭제했습니다`
    if (a === 'update') return `${name} 부 정보를 변경했습니다`
  }
  if (t === 'files') {
    if (a === 'insert') return `${name} 자료 '${d.name || ''}'을(를) 등록했습니다`
    if (a === 'delete') return `${name} 자료를 삭제했습니다`
  }
  return `${name} 항목을 변경했습니다`
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm test` / Expected: 전부 PASS (82→88)

- [ ] **Step 5: Commit**

```bash
git add src/board/homeUtils.js src/tests/homeUtils.test.js
git commit -m "feat: 홈 집계 순수 함수 (우선순위·주의 규칙·진행률·피드 문구)"
```

---

### Task 3: 패널 자료 섹션 + 목록 📄 + 보드 배선·딥링크

**Files:**
- Modify: `src/board/WorkDetailPanel.jsx`, `src/board/VolumeWorkList.jsx`, `src/board/VolumeBoardPage.jsx`
- Test: `src/tests/WorkDetailPanel.test.jsx`, `src/tests/VolumeWorkList.test.jsx` (추가)

**Interfaces:**
- Consumes: Task 1의 listFiles/uploadFile/addFileLink/deleteFile/getFileUrl·listAllFiles
- Produces:
  - WorkDetailPanel: 검토 의견과 최근 변경 사이에 "자료" Section — 목록(📄/🔗 name·업로더명·날짜, 업로드건은 [다운] 클릭 시 getFileUrl로 새 탭, [✕] confirm 삭제), [파일 업로드](숨김 input type=file, 50MB 초과 시 토스트 '50MB 이하 파일만 업로드할 수 있습니다. 링크 첨부를 이용해 주세요.'), [링크 첨부] 토글 폼(이름+URL). 새 prop `onFilesChanged`(선택) — 업로드·링크·삭제 성공 후 호출
  - VolumeWorkList: prop `hasFiles = new Set()` — 행 제목 옆 📄 (자료 보유 시)
  - VolumeBoardPage: loadDupData에서 listAllFiles도 조회 → `hasFiles` Set 계산 → 목록·패널 배선(onFilesChanged=loadDupData). `useSearchParams`로 `?vw=` 읽어 마운트 시 selectedId 초기화 (딥링크 — 홈에서 사용)

- [ ] **Step 1: 실패하는 테스트 추가 (RED)**

`WorkDetailPanel.test.jsx` — 목 팩토리에 `listFiles: vi.fn().mockResolvedValue([]), uploadFile: vi.fn(), addFileLink: vi.fn(), deleteFile: vi.fn(), getFileUrl: vi.fn()` 추가 후:

```jsx
test('자료 목록을 업로더 이름과 함께 보여준다', async () => {
  api.listFiles.mockResolvedValue([
    { id: 'f1', kind: 'upload', name: '해제_소나기.hwp', uploaded_by: 'm1', created_at: '2026-08-25T09:00:00Z', storage_path: 'p' },
  ])
  render(<WorkDetailPanel volumeWork={VW} tasks={[]} members={MEMBERS} duplicates={[]} actions={makeActions()} onClose={() => {}} />)
  expect(await screen.findByText(/해제_소나기\.hwp/)).toBeInTheDocument()
})

test('링크 첨부를 등록한다', async () => {
  api.listFiles.mockResolvedValue([])
  api.addFileLink.mockResolvedValue({ id: 'f2', kind: 'link', name: '해제 초고', url: 'https://ex.com', created_at: '2026-08-25T09:00:00Z' })
  render(<WorkDetailPanel volumeWork={VW} tasks={[]} members={MEMBERS} duplicates={[]} actions={makeActions()} onClose={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: '링크 첨부' }))
  await userEvent.type(screen.getByPlaceholderText('자료 이름'), '해제 초고')
  await userEvent.type(screen.getByPlaceholderText('https://…'), 'https://ex.com')
  await userEvent.click(screen.getByRole('button', { name: '등록' }))
  expect(api.addFileLink).toHaveBeenCalledWith('vw1', '해제 초고', 'https://ex.com')
  expect(await screen.findByText('해제 초고')).toBeInTheDocument()
})

test('파일 업로드 input이 uploadFile을 호출한다', async () => {
  api.listFiles.mockResolvedValue([])
  api.uploadFile.mockResolvedValue({ id: 'f3', kind: 'upload', name: 'a.pdf', created_at: '2026-08-25T09:00:00Z' })
  render(<WorkDetailPanel volumeWork={VW} tasks={[]} members={MEMBERS} duplicates={[]} actions={makeActions()} onClose={() => {}} />)
  const input = screen.getByLabelText('파일 선택')
  const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
  await userEvent.upload(input, file)
  expect(api.uploadFile).toHaveBeenCalledWith('vw1', file)
})
```

`VolumeWorkList.test.jsx`:

```jsx
test('자료가 있는 작품에 📄를 표시한다', () => {
  render(<VolumeWorkList works={[WORKS[0]]} tasksByVw={TASKS} members={[]} hasFiles={new Set(['vw1'])}
    selectedId={null} onSelect={() => {}} onMove={() => {}} />)
  expect(screen.getByText('📄')).toBeInTheDocument()
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- src/tests/WorkDetailPanel.test.jsx src/tests/VolumeWorkList.test.jsx` / Expected: FAIL

- [ ] **Step 3: 구현**

`WorkDetailPanel.jsx` — import에 파일 API 추가, props에 `onFilesChanged` 추가, 상태:

```jsx
  const [files, setFiles] = useState([])
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const fileInputRef = useRef(null)
```

로드: `useEffect(() => { listFiles(vw.id).then(setFiles).catch(() => setFiles([])) }, [vw.id])`

핸들러:

```jsx
  async function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 50 * 1024 * 1024) {
      show('50MB 이하 파일만 업로드할 수 있습니다. 링크 첨부를 이용해 주세요.')
      return
    }
    try {
      const row = await uploadFile(vw.id, file)
      setFiles(fs => [...fs, row])
      onFilesChanged?.()
    } catch (err) {
      show(err.message)
    }
  }

  async function submitLink() {
    const name = linkName.trim()
    const url = linkUrl.trim()
    if (!name || !url) return
    try {
      const row = await addFileLink(vw.id, name, url)
      setFiles(fs => [...fs, row])
      setLinkOpen(false); setLinkName(''); setLinkUrl('')
      onFilesChanged?.()
    } catch (err) {
      show(err.message)
    }
  }

  async function removeFile(f) {
    if (!window.confirm(`'${f.name}' 자료를 삭제할까요?`)) return
    try {
      await deleteFile(f)
      setFiles(fs => fs.filter(x => x.id !== f.id))
      onFilesChanged?.()
    } catch (err) {
      show(err.message)
    }
  }

  async function openFile(f) {
    if (f.kind === 'link') { window.open(f.url, '_blank', 'noopener'); return }
    try {
      window.open(await getFileUrl(f.storage_path), '_blank', 'noopener')
    } catch (err) {
      show(err.message)
    }
  }
```

검토 의견 Section과 최근 변경 Section 사이에:

```jsx
      <Section title={`자료 ${files.length ? `(${files.length})` : ''}`}>
        <ul className="mb-2 space-y-1">
          {files.map(f => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <button type="button" onClick={() => openFile(f)}
                className="min-w-0 flex-1 truncate text-left text-blue-700 hover:underline">
                {f.kind === 'link' ? '🔗' : '📄'} {f.name}
              </button>
              <span className="shrink-0 text-xs text-gray-400">
                {memberName(f.uploaded_by)} · {new Date(f.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
              </span>
              <button type="button" aria-label={`${f.name} 삭제`} onClick={() => removeFile(f)}
                className="shrink-0 text-gray-300 hover:text-red-500">✕</button>
            </li>
          ))}
          {!files.length && <li className="text-xs text-gray-300">해제 원고 등 자료를 올려 두세요</li>}
        </ul>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" aria-label="파일 선택" onChange={handleUpload} className="hidden" id="file-upload-input" />
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600">파일 업로드</button>
          <button type="button" onClick={() => setLinkOpen(o => !o)}
            className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600">링크 첨부</button>
        </div>
        {linkOpen && (
          <div className="mt-2 space-y-1">
            <input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="자료 이름"
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
            <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…"
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
            <button type="button" onClick={submitLink}
              className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white">등록</button>
          </div>
        )}
      </Section>
```

(숨김 input은 `className="hidden"`이면 `getByLabelText` 접근이 가능하도록 `aria-label` 유지. `useRef` import 필요. 헤더 주석의 목록에 '자료' 추가.)

`VolumeWorkList.jsx`: props에 `hasFiles = new Set()`, renderRow 제목 div 안 제목 옆에 `{hasFiles.has(vw.id) && <span className="ml-1" title="자료 있음">📄</span>}`.

`VolumeBoardPage.jsx`:
- import `useSearchParams` (react-router-dom), `listAllFiles` 사용은 api.* 경유
- 상태 `const [allFiles, setAllFiles] = useState([])`; loadDupData에 `api.listAllFiles().then(setAllFiles).catch(() => {})` 추가
- `const hasFiles = useMemo(() => new Set(allFiles.map(f => f.volume_work_id)), [allFiles])`
- 딥링크: `const [searchParams] = useSearchParams()` + 마운트 시 1회:

```jsx
  useEffect(() => {
    const vwParam = searchParams.get('vw')
    if (vwParam) setSelectedId(vwParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
```

- VolumeWorkList에 `hasFiles={hasFiles}`, WorkDetailPanel에 `onFilesChanged={loadDupData}` 전달

- [ ] **Step 4: 통과 확인** — Run: `npm test && npm run build` / Expected: 전부 PASS (88→92), 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add src/board/WorkDetailPanel.jsx src/board/VolumeWorkList.jsx src/board/VolumeBoardPage.jsx src/tests/WorkDetailPanel.test.jsx src/tests/VolumeWorkList.test.jsx
git commit -m "feat: 작품 자료 업로드·링크·삭제 + 목록 📄 표시 + 패널 딥링크"
```

---

### Task 4: HomePage (5개 섹션 + Realtime)

**Files:**
- Modify: `src/pages/HomePage.jsx` (자리표시 → 전체 교체)
- Test: `src/tests/HomePage.test.jsx`

**Interfaces:**
- Consumes: `useAuth`(member), volumeApi의 listVolumes/listAllVolumeWorks/listAllTasks/listAllFiles/listActivity/listMembers/subscribeBoard, homeUtils 전부
- Produces: 홈 화면 — §5.3 순서. 내 할 일 항목·주의 필요 항목은 `/volumes/${volumeId}?vw=${vwId}` 링크. Realtime: subscribeBoard + 300ms 디바운스 재로드

- [ ] **Step 1: 실패하는 테스트 작성 (RED)** — `src/tests/HomePage.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: () => ({ member: { id: 'm1', name: '윤보라' }, session: {}, loading: false }),
}))
vi.mock('../board/volumeApi.js', () => ({
  listVolumes: vi.fn(),
  listAllVolumeWorks: vi.fn(),
  listAllTasks: vi.fn(),
  listAllFiles: vi.fn(),
  listActivity: vi.fn(),
  listMembers: vi.fn(),
  subscribeBoard: vi.fn(() => () => {}),
}))
const api = await import('../board/volumeApi.js')
const { default: HomePage } = await import('../pages/HomePage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

const VWROW = {
  id: 'vw1', volume_id: 'v1', work_id: 'W1', selection_status: 'confirmed',
  work_snapshot: { title: '소나기', author: '황순원' }, volumes: { number: 1, title: '삶' },
}

function setup({ tasks = [], vworks = [VWROW], files = [], activity = [] } = {}) {
  api.listVolumes.mockResolvedValue([{ id: 'v1', number: 1, title: '삶', status: '선정중' }])
  api.listAllVolumeWorks.mockResolvedValue(vworks)
  api.listAllTasks.mockResolvedValue(tasks)
  api.listAllFiles.mockResolvedValue(files)
  api.listActivity.mockResolvedValue(activity)
  api.listMembers.mockResolvedValue([{ id: 'm1', name: '윤보라' }])
  return render(<ToastProvider><HashRouter><HomePage /></HashRouter></ToastProvider>)
}

test('내 할 일이 우선순위와 딥링크로 표시된다', async () => {
  setup({
    tasks: [
      { id: 't1', title: '해제 작성', status: 'todo', assignee_id: 'm1', due_date: '2026-01-01', volume_works: VWROW },
      { id: 't2', title: '남의 업무', status: 'todo', assignee_id: 'm2', due_date: '2026-01-01', volume_works: VWROW },
    ],
  })
  await waitFor(() => expect(screen.getByText(/해제 작성/)).toBeInTheDocument())
  expect(screen.queryByText(/남의 업무/)).not.toBeInTheDocument()
  const link = screen.getByRole('link', { name: /해제 작성/ })
  expect(link).toHaveAttribute('href', '#/volumes/v1?vw=vw1')
})

test('주의 필요: 확정인데 업무·자료 없음이 표시된다', async () => {
  setup()
  await waitFor(() => expect(screen.getByText(/업무가 없습니다/)).toBeInTheDocument())
  expect(screen.getByText(/자료가 없습니다/)).toBeInTheDocument()
})

test('권별 진행 현황과 최근 활동 문구가 나온다', async () => {
  setup({
    tasks: [{ id: 't1', title: 'x', status: 'done', assignee_id: null, due_date: null, volume_works: VWROW }],
    activity: [{ id: 1, table_name: 'volume_works', action: 'insert', diff: { work_snapshot: { title: '소나기' } }, actor_id: 'm1', created_at: '2026-08-25T09:00:00Z' }],
  })
  await waitFor(() => expect(screen.getByText(/1권 삶/)).toBeInTheDocument())
  expect(screen.getByText(/윤보라님이 「소나기」을\(를\) 추가했습니다/)).toBeInTheDocument()
})

test('할 일이 없으면 빈 안내가 나온다', async () => {
  setup({ vworks: [] })
  await waitFor(() => expect(screen.getByText(/오늘 처리할 업무가 없습니다/)).toBeInTheDocument())
})
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- src/tests/HomePage.test.jsx` / Expected: FAIL

- [ ] **Step 3: 구현** — `src/pages/HomePage.jsx` 전체 교체:

```jsx
// 홈: 오늘 무엇을 해야 하는지 바로 보이는 화면 (설계 §5.2·§5.3)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider.jsx'
import * as api from '../board/volumeApi.js'
import {
  taskUrgency, urgencyIcon, sortMyTasks, buildAttention, volumeProgress, describeActivity,
} from '../board/homeUtils.js'
import { daysUntil, dDayLabel } from '../board/boardUtils.js'
import { useToast } from '../components/Toast.jsx'

function Card({ title, children }) {
  return (
    <section className="rounded border border-gray-200 p-4">
      <h3 className="mb-2 text-sm font-bold text-gray-700">{title}</h3>
      {children}
    </section>
  )
}

function taskLink(t) {
  return `/volumes/${t.volume_works?.volume_id}?vw=${t.volume_works?.id}`
}

export default function HomePage() {
  const { member } = useAuth()
  const { show } = useToast()
  const [data, setData] = useState(null)
  const debounceRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const [volumes, vworks, tasks, files, activity, members] = await Promise.all([
        api.listVolumes(), api.listAllVolumeWorks(), api.listAllTasks(),
        api.listAllFiles(), api.listActivity(20), api.listMembers(),
      ])
      setData({ volumes, vworks, tasks, files, activity, members })
    } catch (err) {
      show(err.message)
    }
  }, [show])

  useEffect(() => {
    load()
    const unsubscribe = api.subscribeBoard(() => {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(load, 300)
    })
    return () => { clearTimeout(debounceRef.current); unsubscribe() }
  }, [load])

  const computed = useMemo(() => {
    if (!data) return null
    const nameOf = id => data.members.find(m => m.id === id)?.name
    const myTasks = sortMyTasks(
      data.tasks.filter(t => t.assignee_id === member?.id && t.status !== 'done'),
    )
    const tasksByVw = {}
    for (const t of data.tasks) {
      const vwId = t.volume_works?.id
      if (vwId) (tasksByVw[vwId] ||= []).push(t)
    }
    const fileVwIds = new Set(data.files.map(f => f.volume_work_id))
    const attention = buildAttention(data.vworks, tasksByVw, fileVwIds)
    const upcoming = data.tasks
      .filter(t => t.status !== 'done' && t.due_date && daysUntil(t.due_date) >= 0 && daysUntil(t.due_date) <= 7)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
    const progress = volumeProgress(data.volumes, data.vworks, data.tasks)
    const feed = data.activity.map(e => ({
      id: e.id,
      when: new Date(e.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      text: describeActivity(e, nameOf),
    }))
    return { myTasks, attention, upcoming, progress, feed }
  }, [data, member])

  if (!computed) return <p className="text-gray-500">불러오는 중…</p>
  const { myTasks, attention, upcoming, progress, feed } = computed

  return (
    <div className="max-w-5xl space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="내 할 일">
          <ul className="space-y-1.5">
            {myTasks.map(t => (
              <li key={t.id}>
                <Link to={taskLink(t)} className="flex items-center gap-2 text-sm hover:underline">
                  <span>{urgencyIcon(taskUrgency(t.due_date))}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {t.volume_works?.volumes?.number}권 · 「{t.volume_works?.work_snapshot?.title}」 {t.title}
                  </span>
                  {t.due_date && (
                    <span className={`shrink-0 text-xs ${daysUntil(t.due_date) < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {dDayLabel(daysUntil(t.due_date))}
                    </span>
                  )}
                </Link>
              </li>
            ))}
            {!myTasks.length && <li className="text-sm text-gray-400">오늘 처리할 업무가 없습니다 🎉</li>}
          </ul>
        </Card>

        <Card title="주의 필요">
          <ul className="space-y-1.5">
            {attention.slice(0, 8).map((it, i) => (
              <li key={i}>
                <Link to={`/volumes/${it.volumeId}?vw=${it.vwId}`}
                  className={`block truncate text-sm hover:underline ${it.level === 'high' ? 'text-red-700' : 'text-amber-700'}`}>
                  {it.level === 'high' ? '⚠️' : '·'} {it.text}
                </Link>
              </li>
            ))}
            {!attention.length && <li className="text-sm text-gray-400">특이 사항이 없습니다</li>}
          </ul>
        </Card>
      </div>

      <Card title="다가오는 마감 (7일)">
        <ul className="space-y-1 text-sm">
          {upcoming.slice(0, 10).map(t => (
            <li key={t.id} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-gray-400">{dDayLabel(daysUntil(t.due_date))}</span>
              <Link to={taskLink(t)} className="min-w-0 flex-1 truncate hover:underline">
                {t.volume_works?.volumes?.number}권 · 「{t.volume_works?.work_snapshot?.title}」 {t.title}
              </Link>
            </li>
          ))}
          {!upcoming.length && <li className="text-gray-400">7일 이내 마감이 없습니다</li>}
        </ul>
      </Card>

      <Card title="권별 진행 현황">
        <ul className="space-y-2">
          {progress.map(r => (
            <li key={r.volume.id} className="text-sm">
              <Link to={`/volumes/${r.volume.id}`} className="hover:underline">
                <span className="font-medium">{r.volume.number}권 {r.volume.title}</span>
                <span className="ml-2 text-xs text-gray-500">
                  수록 {r.total} · 확정 {r.confirmed} · 업무 {r.done}/{r.taskTotal}
                </span>
              </Link>
              {r.pct != null && (
                <div className="mt-1 h-1.5 w-full rounded bg-gray-100">
                  <div className="h-1.5 rounded bg-blue-500" style={{ width: `${r.pct}%` }} />
                </div>
              )}
            </li>
          ))}
          {!progress.length && <li className="text-sm text-gray-400">아직 권이 없습니다</li>}
        </ul>
      </Card>

      <Card title="최근 활동">
        <ul className="space-y-1 text-xs text-gray-600">
          {feed.map(f => <li key={f.id}><span className="text-gray-400">{f.when}</span> · {f.text}</li>)}
          {!feed.length && <li className="text-gray-300">기록 없음</li>}
        </ul>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm test && npm run build` / Expected: 전부 PASS (92→96), 빌드 성공. 기존 smoke 테스트는 로그인 화면 기준이라 영향 없음

- [ ] **Step 5: Commit**

```bash
git add src/pages/HomePage.jsx src/tests/HomePage.test.jsx
git commit -m "feat: 홈 화면 — 내 할 일·주의 필요·마감·권별 현황·활동 피드"
```

---

### Task 5: 사용자 SQL 적용 + 실사동 검증 + 배포

**Files:** 없음

- [ ] **Step 1: [사용자 작업]** `docs/setup-phase3.md` — Studio SQL Editor에서 `supabase/phase3.sql` 실행 (attachments 버킷 확인)
- [ ] **Step 2: 실사동 검증** (로컬 또는 배포 후):
  - 홈: 내 할 일이 우선순위·D-day와 함께 표시, 클릭 시 해당 작품 패널이 열린 보드로 이동
  - 주의 필요: 확정인데 업무 0건·자료 없음이 자동 표시, 마감 지난 업무 🔴
  - 패널 자료: 파일 업로드(작은 파일) → 목록 표시 → 클릭 다운로드(서명 URL) → 삭제. 링크 첨부 등록. 51MB 파일 거부 문구
  - 수록 목록 행 📄 표시, 업로드 직후 갱신
  - 두 브라우저: 업무 완료가 상대 홈의 내 할 일·진행률에 실시간 반영
- [ ] **Step 3: 배포**

```bash
git push origin master
git tag phase3-done && git push origin phase3-done
```

---

## Self-Review 결과

- **커버리지**: §5.2 홈 5영역(내 할 일 T2·T4 / 주의 필요 4규칙 T2·T4 / 마감 T4 / 권별 현황 T2·T4 / 활동 피드 T2·T4), §5.1 자료(업로드·링크·50MB·서명 URL·📄 — T1·T3), 딥링크(§5.2 "클릭하면 상세 패널" — T3·T4). 저작권 뱃지·schedules 통합은 스펙대로 이후 단계.
- **타입 일관성**: listAllTasks의 중첩 형태(volume_works.volumes.number)를 homeUtils(volumeProgress·workLabel)와 HomePage(taskLink·표시)가 동일하게 소비. fileVwIds Set — T3 hasFiles와 동일 생성식. buildAttention 반환 {level,text,volumeId,vwId} — HomePage 링크 생성과 일치.
- **의도적 결정**: 주의 필요 규칙 ③은 스펙의 "진행 중(담당자 없음)"을 "마감 7일 이내(담당자 없음)"로 적용 — UI가 in_progress 상태를 만들지 않으므로(체크박스 todo↔done) 원문 그대로는 절대 발화하지 않는 죽은 규칙이 됨. 홈 조회는 병렬 6쿼리 1회+실시간 재조회 — 15명 규모에 충분. 업로드 후 보드 📄 갱신은 onFilesChanged 콜백(전역 재조회).
- **알려진 한계**: 활동 피드의 업무 완료 문구에 작품명이 없음(update diff에 title 미포함 — activity_log 트리거 구조상. 필요시 추후 트리거 확장). 홈의 storage 실패는 토스트만.
