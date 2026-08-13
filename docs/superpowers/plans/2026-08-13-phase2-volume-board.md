# 2단계: 권별 작품 목록 + 상세 패널 + Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 권을 만들고, 기존 작품 DB(1만 행 시트)를 검색해 권에 작품을 추가·선정·정렬하며, 작품별 제작 업무 체크리스트를 관리하고, 이 모든 변경이 다른 사용자 화면에 실시간 반영되는 핵심 화면을 완성한다.

**Architecture:** 시트 CSV → `parseCSV`(literature-db 이식) → 메모리 검색. 작품 식별은 `works_registry`의 영구 `work_id`(권 추가 시점에 발급, title+author_base 정규화 키와 별칭으로 매칭). 권 화면 상태는 `useVolumeBoard` 훅이 소유하고, supabase 호출은 전부 `volumeApi.js`에 격리, Realtime 이벤트는 디바운스 후 재조회로 정합성 확보.

**Tech Stack:** React 19, react-router-dom 7(HashRouter), @supabase/supabase-js 2 (Postgres+Realtime), Tailwind 4, Vitest 4 + Testing Library (supabase/api는 목킹).

**Spec:** [docs/superpowers/specs/2026-08-13-series-dashboard-design-v2.md](../specs/2026-08-13-series-dashboard-design-v2.md) — 특히 §3(works_registry), §4(데이터 모델), §5.1(화면), §7(Realtime)

## Global Constraints

- 비용 0원, 무료 플랜만 (설계 §13). service-role 키 커밋 금지, 프런트에는 anon key만 (설계 §6.5)
- 작품 원본(시트)은 읽기 전용. 대시보드는 선정·업무 데이터만 Supabase에 쓴다 (설계 §2 원칙)
- 관계 연결 기준은 `work_id`, 표시는 시트 데이터, 대비책은 `work_snapshot` (설계 §3)
- 중복 판정은 문자열이 아니라 반드시 `work_id` 기준 (설계 §3, 완료 기준 10)
- `created_by`/`updated_by`는 DB 트리거가 자동 기록 — 클라이언트에서 보내지 않는다 (설계 §6.4)
- UI 문구 한국어. 상태 라벨: 후보/보류/확정/제외, 미착수/진행 중/검토 중/완료
- 저장 버튼 없는 즉시 저장, 실패 시 토스트 + 재조회 롤백 (설계 §5.1, §7)
- 이번 단계에서 하지 않는 것: 드래그 정렬(위/아래 버튼만, 드래그는 5단계), 엑셀 내보내기·저작권 뱃지(5단계), 홈 화면(3단계), 시트 재연결 UI(5단계)
- 기존 테스트 9건을 깨지 않는다. 커밋 메시지는 `feat:`/`test:`/`chore:` + 한국어

## 파일 구조

```
src/
├─ works/                      # 시트 작품 데이터 (읽기 전용 세계)
│  ├─ chosung.js               # literature-db 이식 (그대로)
│  ├─ parseCSV.js              # literature-db 이식 (그대로)
│  ├─ filterWorks.js           # literature-db 이식 (간소화: 교육과정·장르·검색어만)
│  ├─ workKey.js               # 정규화 키 + 레지스트리 매칭
│  └─ useWorksData.js          # CSV fetch + 파생필드 + 모듈 캐시
├─ board/                      # 권 보드 (쓰기 세계)
│  ├─ constants.js             # 상태 라벨, 업무 프리셋
│  ├─ boardUtils.js            # D-day, 진행률, 정렬, 목록 필터 (순수 함수)
│  ├─ volumeApi.js             # 모든 supabase 호출
│  ├─ useVolumeBoard.js        # 권 화면 상태 + 액션 + Realtime
│  ├─ VolumesPage.jsx          # 권 목록 + 새 권 만들기  (/volumes)
│  ├─ VolumeBoardPage.jsx      # 권 보드 조립           (/volumes/:id)
│  ├─ SearchPane.jsx           # 좌측: 작품 검색 + 추가
│  ├─ VolumeWorkList.jsx       # 우측: 수록 목록 + 필터 바
│  ├─ WorkDetailPanel.jsx      # 작품 상세 패널 (drawer)
│  └─ MultiSelectDropdown.jsx  # 체크박스 드롭다운
├─ components/Toast.jsx        # 전역 토스트 (실패 알림)
supabase/phase2.sql            # works_registry 유니크 인덱스
docs/setup-phase2.md           # 사용자 작업: SQL 1줄 + 시크릿/env 1개
```

각 Task의 코드는 자기 완결적이다 — 다른 Task의 파일을 수정할 때는 정확한 위치를 명시한다.

---

### Task 1: 작품 데이터 유틸 이식 (chosung, parseCSV, filterWorks)

**Files:**
- Create: `src/works/chosung.js`, `src/works/parseCSV.js`, `src/works/filterWorks.js`
- Test: `src/tests/works-utils.test.js`

**Interfaces:**
- Produces:
  - `toChosung(str) → string`, `isChosungQuery(str) → boolean`
  - `parseCSV(csvText) → work[]` — work는 `{'작품명','지은이','장르','교육과정','교과서명',..., _authorBase, _titleChosung, _authorChosung, _subject}` 형태
  - `extractAuthorBase(author) → string`, `withDerivedFields(work) → work`
  - `filterWorks(works, {curriculum=[], genre=[], query=''}) → work[]`
  - `getUniqueValues(works, field) → string[]`

원본은 `D:\교과서 문학 단행본 시리즈\literature-db\src\utils\`의 동명 파일. chosung.js와 parseCSV.js는 **그대로 복사**하고, filterWorks.js는 대시보드에 필요한 필터(교육과정·장르·검색어)만 남긴다.

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/works-utils.test.js`

```js
import { toChosung, isChosungQuery } from '../works/chosung.js'
import { parseCSV, extractAuthorBase } from '../works/parseCSV.js'
import { filterWorks, getUniqueValues } from '../works/filterWorks.js'

const CSV = [
  '교육과정,체제,구분,학년,학기,교과서명,출판사,장르,작품명,지은이',
  '7차,국정,중등,1,1,중학 국어 1-1,,소설,소나기,황순원',
  '2015,검정,고등,1,1,문학,지학사,현대시,"별 헤는 밤",윤동주',
  '2015,검정,고등,1,1,문학,지학사,소설,소나기,황순원',
].join('\n')

test('toChosung: 한글을 초성으로 바꾼다', () => {
  expect(toChosung('김소월')).toBe('ㄱㅅㅇ')
})

test('isChosungQuery: 초성만이면 true', () => {
  expect(isChosungQuery('ㅅㄴㄱ')).toBe(true)
  expect(isChosungQuery('소나기')).toBe(false)
})

test('extractAuthorBase: 괄호 주석을 제거한다', () => {
  expect(extractAuthorBase('황순원(黃順元)')).toBe('황순원')
})

test('parseCSV: 행을 객체로 만들고 파생 필드를 붙인다', () => {
  const works = parseCSV(CSV)
  expect(works).toHaveLength(3)
  expect(works[0]['작품명']).toBe('소나기')
  expect(works[0]._authorBase).toBe('황순원')
  expect(works[1]._titleChosung).toBe('ㅂ ㅎㄴ ㅂ')
})

test('filterWorks: 교육과정·장르·검색어(초성 포함)로 거른다', () => {
  const works = parseCSV(CSV)
  expect(filterWorks(works, { curriculum: ['7차'] })).toHaveLength(1)
  expect(filterWorks(works, { genre: ['현대시'] })).toHaveLength(1)
  expect(filterWorks(works, { query: '소나기' })).toHaveLength(2)
  expect(filterWorks(works, { query: 'ㅅㄴㄱ' })).toHaveLength(2)
  expect(filterWorks(works, { query: '윤동주' })).toHaveLength(1)
})

test('getUniqueValues: 중복 없이 정렬해 돌려준다', () => {
  const works = parseCSV(CSV)
  expect(getUniqueValues(works, '장르')).toEqual(['소설', '현대시'])
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/tests/works-utils.test.js`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**

`src/works/chosung.js` — literature-db 원본 그대로:

```js
// 한글 초성 추출 및 초성 검색 판별 유틸 (literature-db에서 이식)

const CHOSUNG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
]
const CHOSUNG_SET = new Set(CHOSUNG)
const HANGUL_BASE = 0xac00 // '가'
const HANGUL_LAST = 0xd7a3 // '힣'

// 문자열의 한글 음절을 초성으로 변환한다. 한글이 아닌 문자는 그대로 둔다.
export function toChosung(str) {
  if (!str) return ''
  let out = ''
  for (const ch of str) {
    const code = ch.charCodeAt(0)
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      out += CHOSUNG[Math.floor((code - HANGUL_BASE) / 588)]
    } else {
      out += ch
    }
  }
  return out
}

// 공백을 제외한 모든 글자가 초성 자모이면 true (초성 검색 의도로 판단)
export function isChosungQuery(str) {
  const compact = (str || '').replace(/\s/g, '')
  if (!compact) return false
  return [...compact].every(ch => CHOSUNG_SET.has(ch))
}
```

`src/works/parseCSV.js` — literature-db 원본 그대로 (import 경로만 동일 폴더):

```js
// 시트 CSV 파서 (literature-db에서 이식)
import { toChosung } from './chosung.js'

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

export function extractAuthorBase(author) {
  if (!author) return ''
  return author.replace(/\(.*?\)/g, '').trim()
}

// 교과서명으로 과목을 도출한다. '문학' 포함이면 문학, 그 외는 국어.
export function subjectOf(work) {
  return (work['교과서명'] || '').includes('문학') ? '문학' : '국어'
}

// 검색용 파생 필드(작가 기준명·초성·과목)를 작품 객체에 부여한다.
export function withDerivedFields(work) {
  const authorBase = extractAuthorBase(work['지은이'])
  return {
    ...work,
    _authorBase: authorBase,
    _titleChosung: toChosung(work['작품명']),
    _authorChosung: toChosung(authorBase),
    _subject: subjectOf(work),
  }
}

export function parseCSV(csvText) {
  const lines = csvText.trim().split('\n')
  const headers = parseCSVLine(lines[0])

  return lines.slice(1).map(line => {
    const values = parseCSVLine(line)
    const work = {}
    headers.forEach((header, i) => {
      work[header] = values[i] || ''
    })
    return withDerivedFields(work)
  }).filter(w => w['작품명'])
}
```

`src/works/filterWorks.js` — 대시보드용 간소판:

```js
// 작품 검색 필터 (literature-db filterWorks의 간소판: 교육과정·장르·검색어)
import { toChosung, isChosungQuery } from './chosung.js'

export function filterWorks(works, { curriculum = [], genre = [], query = '' } = {}) {
  const trimmedQuery = query.trim()
  const chosungMode = isChosungQuery(trimmedQuery)
  const q = trimmedQuery.toLowerCase()
  const cq = trimmedQuery.replace(/\s/g, '')

  return works.filter(work => {
    if (curriculum.length && !curriculum.includes(work['교육과정'])) return false
    if (genre.length && !genre.includes(work['장르'])) return false
    if (trimmedQuery) {
      if (chosungMode) {
        const titleCho = work._titleChosung ?? toChosung(work['작품명'])
        const authorCho = work._authorChosung ?? toChosung(work._authorBase ?? '')
        if (!titleCho.includes(cq) && !authorCho.includes(cq)) return false
      } else if (
        !work['작품명'].toLowerCase().includes(q) &&
        !(work._authorBase ?? '').toLowerCase().includes(q)
      ) {
        return false
      }
    }
    return true
  })
}

export function getUniqueValues(works, field) {
  return [...new Set(works.map(w => w[field]).filter(Boolean))].sort()
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 전부 PASS (기존 9건 + 신규 6건)

- [ ] **Step 5: Commit**

```bash
git add src/works src/tests/works-utils.test.js
git commit -m "feat: 작품 데이터 유틸 이식 (초성·CSV 파서·검색 필터)"
```

---

### Task 2: 작품 키·레지스트리 매칭 + 유니크 인덱스 SQL

**Files:**
- Create: `src/works/workKey.js`, `supabase/phase2.sql`, `docs/setup-phase2.md`
- Test: `src/tests/workKey.test.js`

**Interfaces:**
- Consumes: work 객체 (`'작품명'`, `_authorBase` 필드 — Task 1의 parseCSV 산출물)
- Produces:
  - `normText(s) → string` — 공백 정리 + 소문자화
  - `keyOf(title, authorBase) → string` — `norm(title)__norm(author)` 정규화 키
  - `workKeyOf(work) → string` — 시트 행에서 키 생성
  - `buildRegistryMap(registryRows) → Map<key, work_id>` — 대표 표기 + aliases 모두 등록. registryRow는 `{work_id, title, author_base, aliases: [{title, author_base}]}`
  - `snapshotOf(work, curricula) → {title, author, genre, curriculum}` — volume_works.work_snapshot·registry.snapshot용
  - `curriculaOf(works, key) → string[]` — 같은 작품의 교육과정 목록 (중복 제거, 정렬)

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/workKey.test.js`

```js
import { normText, keyOf, workKeyOf, buildRegistryMap, snapshotOf, curriculaOf } from '../works/workKey.js'

test('normText: 연속 공백을 하나로, 앞뒤 공백 제거, 소문자화', () => {
  expect(normText('  별  헤는   밤 ')).toBe('별 헤는 밤')
  expect(normText('THE Road')).toBe('the road')
})

test('keyOf: 표기 공백 차이가 있어도 같은 키', () => {
  expect(keyOf('별헤는 밤', '윤동주')).toBe(keyOf('별헤는  밤', '윤동주'))
  expect(keyOf('소나기', '황순원')).not.toBe(keyOf('소나기', '피천득'))
})

test('workKeyOf: 시트 행에서 키를 만든다', () => {
  expect(workKeyOf({ '작품명': '소나기', _authorBase: '황순원' })).toBe(keyOf('소나기', '황순원'))
})

test('buildRegistryMap: 대표 표기와 별칭 모두 등록한다', () => {
  const map = buildRegistryMap([
    {
      work_id: 'W000001', title: '별 헤는 밤', author_base: '윤동주',
      aliases: [{ title: '별헤는 밤', author_base: '윤동주' }],
    },
  ])
  expect(map.get(keyOf('별 헤는 밤', '윤동주'))).toBe('W000001')
  expect(map.get(keyOf('별헤는 밤', '윤동주'))).toBe('W000001')
  expect(map.get(keyOf('없는 작품', '윤동주'))).toBeUndefined()
})

test('snapshotOf / curriculaOf', () => {
  const works = [
    { '작품명': '소나기', '지은이': '황순원', _authorBase: '황순원', '장르': '소설', '교육과정': '7차' },
    { '작품명': '소나기', '지은이': '황순원', _authorBase: '황순원', '장르': '소설', '교육과정': '2015' },
  ]
  const curricula = curriculaOf(works, workKeyOf(works[0]))
  expect(curricula).toEqual(['2015', '7차'])
  expect(snapshotOf(works[0], curricula)).toEqual({
    title: '소나기', author: '황순원', genre: '소설', curriculum: ['2015', '7차'],
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/tests/workKey.test.js`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `src/works/workKey.js`

```js
// 작품 정규화 키와 works_registry 매칭 (설계 §3.2)
// 관계의 기준은 work_id이고, 이 키는 "시트 행 ↔ 레지스트리" 경계에서만 쓴다.

export function normText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function keyOf(title, authorBase) {
  return `${normText(title)}__${normText(authorBase)}`
}

export function workKeyOf(work) {
  return keyOf(work['작품명'], work._authorBase)
}

// registryRows: [{work_id, title, author_base, aliases:[{title,author_base}]}]
export function buildRegistryMap(registryRows) {
  const map = new Map()
  for (const row of registryRows) {
    map.set(keyOf(row.title, row.author_base), row.work_id)
    for (const a of row.aliases || []) {
      map.set(keyOf(a.title, a.author_base), row.work_id)
    }
  }
  return map
}

export function curriculaOf(works, key) {
  const set = new Set()
  for (const w of works) {
    if (workKeyOf(w) === key && w['교육과정']) set.add(w['교육과정'])
  }
  return [...set].sort()
}

export function snapshotOf(work, curricula = []) {
  return {
    title: work['작품명'],
    author: work['지은이'],
    genre: work['장르'],
    curriculum: curricula,
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 5: supabase/phase2.sql 작성** — 동시 등록 경합으로 같은 작품이 두 번 등록되는 것을 DB에서 차단:

```sql
-- 2단계 스키마 보강: 같은 작품(title+author_base)의 중복 등록 차단.
-- 적용: Supabase Studio SQL Editor에서 1회 실행 (docs/setup-phase2.md 참고)
create unique index works_registry_title_author_key
  on public.works_registry (title, author_base);
```

- [ ] **Step 6: docs/setup-phase2.md 작성** — 2단계에서 사람이 할 일 모음 (Task 3의 env 항목 포함, 실행 시점은 2단계 마지막):

```markdown
# 2단계 세팅 절차 (1회, 사람 작업)

## 1. 스키마 보강
Supabase Studio → SQL Editor에서 `supabase/phase2.sql` 내용을 붙여넣고 Run.

## 2. 작품 시트 CSV 주소 등록
literature-db 프로젝트의 `.env` 파일에 있는 `VITE_SHEETS_CSV_URL=` 줄을 그대로 복사해서:
1. 이 저장소의 `.env.local`에 한 줄 추가
2. GitHub 저장소 Settings → Secrets and variables → Actions →
   New repository secret: Name `VITE_SHEETS_CSV_URL`, 값은 URL 부분만
```

- [ ] **Step 7: Commit**

```bash
git add src/works/workKey.js src/tests/workKey.test.js supabase/phase2.sql docs/setup-phase2.md
git commit -m "feat: 작품 정규화 키·레지스트리 매칭 + 중복 등록 차단 인덱스"
```

---

### Task 3: useWorksData (시트 CSV 로드 훅) + env 배선

**Files:**
- Create: `src/works/useWorksData.js`
- Modify: `.env.example` (한 줄 추가), `.github/workflows/deploy.yml` (build env에 한 줄 추가)
- Test: `src/tests/useWorksData.test.jsx`

**Interfaces:**
- Consumes: `parseCSV` (Task 1), env `VITE_SHEETS_CSV_URL`
- Produces: `useWorksData() → { works, loading, error, retry }` — works는 파생 필드 포함 배열. 모듈 캐시로 세션당 1회만 fetch.

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/useWorksData.test.jsx`

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const CSV = '교육과정,장르,작품명,지은이,교과서명\n7차,소설,소나기,황순원,중학 국어 1-1'

const { useWorksData, _resetWorksCache } = await import('../works/useWorksData.js')

function Probe() {
  const { works, loading, error } = useWorksData()
  if (loading) return <div>로딩</div>
  if (error) return <div>오류:{error}</div>
  return <div>건수:{works.length} 첫작품:{works[0]?.['작품명']}</div>
}

beforeEach(() => {
  _resetWorksCache()
  vi.unstubAllGlobals()
})

test('CSV를 받아 파싱해 제공한다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CSV) }))
  render(<Probe />)
  await waitFor(() => expect(screen.getByText('건수:1 첫작품:소나기')).toBeInTheDocument())
})

test('실패하면 error를 제공한다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
  render(<Probe />)
  await waitFor(() => expect(screen.getByText(/오류:/)).toBeInTheDocument())
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/tests/useWorksData.test.jsx`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `src/works/useWorksData.js`

```js
// 작품 시트 CSV를 1회 로드해 모든 화면이 공유한다.
import { useEffect, useState } from 'react'
import { parseCSV } from './parseCSV.js'

let cache = null           // 성공한 works 배열
let inflight = null        // 진행 중 Promise (중복 fetch 방지)

export function _resetWorksCache() { // 테스트 전용
  cache = null
  inflight = null
}

async function loadWorks() {
  const url = import.meta.env.VITE_SHEETS_CSV_URL
  if (!url) throw new Error('VITE_SHEETS_CSV_URL 환경변수가 필요합니다')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`작품 데이터를 불러올 수 없습니다 (HTTP ${res.status})`)
  return parseCSV(await res.text())
}

export function useWorksData() {
  const [works, setWorks] = useState(cache || [])
  const [loading, setLoading] = useState(!cache)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (cache) return
    let cancelled = false
    setLoading(true)
    setError(null)
    inflight = inflight || loadWorks()
    inflight
      .then(data => {
        cache = data
        if (!cancelled) setWorks(data)
      })
      .catch(err => {
        inflight = null
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [attempt])

  return { works, loading, error, retry: () => setAttempt(a => a + 1) }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 5: env 배선** — `.env.example` 끝에 추가:

```
VITE_SHEETS_CSV_URL=https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/pub?output=csv
```

`.github/workflows/deploy.yml`의 `npm run build` env 블록을 다음으로 교체 (기존 두 줄 유지 + 한 줄 추가):

```yaml
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
          VITE_SHEETS_CSV_URL: ${{ secrets.VITE_SHEETS_CSV_URL }}
```

로컬 `.env.local`에는 사용자가 literature-db의 값을 복사해 넣는다 (docs/setup-phase2.md — 이 Task에서는 파일을 건드리지 않는다. `.env.local`은 커밋 금지).

- [ ] **Step 6: Commit**

```bash
git add src/works/useWorksData.js src/tests/useWorksData.test.jsx .env.example .github/workflows/deploy.yml
git commit -m "feat: 작품 시트 CSV 로드 훅 + 환경변수 배선"
```

---

### Task 4: 보드 상수·순수 유틸 (라벨, D-day, 진행률, 정렬, 목록 필터)

**Files:**
- Create: `src/board/constants.js`, `src/board/boardUtils.js`
- Test: `src/tests/boardUtils.test.js`

**Interfaces:**
- Produces (constants):
  - `SELECTION_LABELS = {candidate:'후보', hold:'보류', confirmed:'확정', excluded:'제외'}`
  - `PRODUCTION_LABELS = {not_started:'미착수', in_progress:'진행 중', review:'검토 중', completed:'완료'}`
  - `TASK_STATUS_LABELS = {todo:'예정', in_progress:'진행 중', review:'검토 중', done:'완료'}`
  - `TASK_PRESETS = [{type, label} × 10]` — 본문 확보/저작권 확인/원고 작성/해제 작성/부가 원고/이미지 확보/편집 검토/조판/교정/최종 확인
- Produces (boardUtils):
  - `daysUntil(dateStr, now=new Date()) → number` — 로컬(KST) 자정 기준 일수. 오늘=0, 지남=음수
  - `dDayLabel(days) → string` — `'D-3' | 'D-Day' | 'D+2'`
  - `tasksProgress(tasks) → {done, total}`
  - `nextSortOrder(rows) → number` — `max(sort_order)+10`, 빈 배열이면 10
  - `swapPlan(sortedRows, id, dir) → null | [{id, sort_order}, {id, sort_order}]` — 이웃과 sort_order 교환. 끝이면 null
  - `nearestDue(tasks) → string|null` — 미완료 업무 중 가장 이른 due_date
  - `filterVolumeWorks(rows, tasksByVw, filters, now) → rows` — filters는 `{selection=[], production=[], assignee=[], dueSoon=false, hideCompleted=false}`. dueSoon = 미완료 업무 중 7일 이내(지남 포함) 마감 존재. assignee는 업무 담당자 member id 배열

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/boardUtils.test.js`

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/tests/boardUtils.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/board/constants.js`:

```js
// 상태 라벨과 업무 프리셋 (설계 §4). 프리셋은 상수 배열 — 종류 추가는 여기만 고치면 된다.

export const SELECTION_LABELS = {
  candidate: '후보',
  hold: '보류',
  confirmed: '확정',
  excluded: '제외',
}

export const PRODUCTION_LABELS = {
  not_started: '미착수',
  in_progress: '진행 중',
  review: '검토 중',
  completed: '완료',
}

export const TASK_STATUS_LABELS = {
  todo: '예정',
  in_progress: '진행 중',
  review: '검토 중',
  done: '완료',
}

export const TASK_PRESETS = [
  { type: 'source', label: '작품 본문 확보' },
  { type: 'copyright', label: '저작권 확인' },
  { type: 'manuscript', label: '작품 원고 작성' },
  { type: 'commentary', label: '해제 작성' },
  { type: 'extra', label: '부가 원고 작성' },
  { type: 'image', label: '이미지 확보' },
  { type: 'edit_review', label: '편집 검토' },
  { type: 'typeset', label: '조판' },
  { type: 'proof', label: '교정' },
  { type: 'final', label: '최종 확인' },
]
```

`src/board/boardUtils.js`:

```js
// 권 보드 순수 유틸. 날짜는 항상 로컬(KST) 자정 기준 date-only 비교 (설계 §8).

const DAY_MS = 86400000

function localMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// 'YYYY-MM-DD' → 로컬 자정 Date (UTC 해석 방지를 위해 직접 파싱)
function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysUntil(dateStr, now = new Date()) {
  return Math.round((parseDate(dateStr) - localMidnight(now)) / DAY_MS)
}

export function dDayLabel(days) {
  if (days === 0) return 'D-Day'
  return days > 0 ? `D-${days}` : `D+${-days}`
}

export function tasksProgress(tasks) {
  return {
    done: tasks.filter(t => t.status === 'done').length,
    total: tasks.length,
  }
}

export function nextSortOrder(rows) {
  if (!rows.length) return 10
  return Math.max(...rows.map(r => r.sort_order)) + 10
}

// sortedRows는 sort_order 오름차순 정렬 전제. 이웃과 순서값을 교환한다.
export function swapPlan(sortedRows, id, dir) {
  const i = sortedRows.findIndex(r => r.id === id)
  const j = dir === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= sortedRows.length) return null
  return [
    { id: sortedRows[i].id, sort_order: sortedRows[j].sort_order },
    { id: sortedRows[j].id, sort_order: sortedRows[i].sort_order },
  ]
}

export function nearestDue(tasks) {
  const dues = tasks
    .filter(t => t.status !== 'done' && t.due_date)
    .map(t => t.due_date)
    .sort()
  return dues[0] ?? null
}

export function filterVolumeWorks(rows, tasksByVw, filters = {}, now = new Date()) {
  const { selection = [], production = [], assignee = [], dueSoon = false, hideCompleted = false } = filters
  return rows.filter(row => {
    const tasks = tasksByVw[row.id] || []
    if (selection.length && !selection.includes(row.selection_status)) return false
    if (production.length && !production.includes(row.production_status)) return false
    if (assignee.length && !tasks.some(t => assignee.includes(t.assignee_id))) return false
    if (dueSoon) {
      const hit = tasks.some(t => t.status !== 'done' && t.due_date && daysUntil(t.due_date, now) <= 7)
      if (!hit) return false
    }
    if (hideCompleted && row.production_status === 'completed') return false
    return true
  })
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/constants.js src/board/boardUtils.js src/tests/boardUtils.test.js
git commit -m "feat: 보드 상수·순수 유틸 (D-day·진행률·정렬·목록 필터)"
```

---

### Task 5: volumeApi (모든 Supabase 호출)

**Files:**
- Create: `src/board/volumeApi.js`
- Test: `src/tests/volumeApi.test.js`

**Interfaces:**
- Consumes: `supabase` (`src/lib/supabaseClient.js`), `keyOf`/`buildRegistryMap`/`snapshotOf` (Task 2), `nextSortOrder` (Task 4)
- Produces (전부 async, 실패 시 Error throw):
  - `listVolumes() → volume[]` (number 오름차순)
  - `createVolume({number, title}) → volume`
  - `updateVolume(id, patch) → volume`
  - `getBoard(volumeId) → {volume, works, tasks}` — works는 sort_order 순, tasks는 해당 권 전체
  - `listAllVolumeWorks() → [{id, volume_id, work_id, selection_status, volumes:{number,title}}]`
  - `listRegistry() → registryRow[]`
  - `ensureWorkId(work, curricula, registryMap) → work_id` — 맵에서 찾으면 그 ID, 없으면 insert(경합 시 재조회)
  - `addWorkToVolume({volumeId, work, curricula, registryMap, sortOrder}) → volume_work` (중복이면 Error '이미 이 권에 있는 작품입니다')
  - `updateVolumeWork(id, patch) → volume_work`
  - `deleteVolumeWork(id) → void`
  - `applySortSwap(pairs) → void` — swapPlan 결과 반영
  - `addTasks(volumeWorkId, items) → task[]` — items는 `[{task_type, title, sort_order}]`
  - `updateTask(id, patch) → task`
  - `deleteTask(id) → void`
  - `listMembers() → member[]`
  - `listActivityFor(recordIds) → activity[]` (최신순 5건)
  - `subscribeBoard(onChange) → unsubscribe` — volume_works·work_tasks 변경 구독

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/volumeApi.test.js` (supabase 목킹, 핵심 분기만)

```js
import { vi } from 'vitest'

// 체이너블 쿼리 목: 어떤 메서드 체인이든 마지막에 resolve(result)
function chain(result) {
  const p = Promise.resolve(result)
  const obj = new Proxy(() => {}, {
    get(_, prop) {
      if (prop === 'then') return p.then.bind(p)
      if (prop === 'catch') return p.catch.bind(p)
      if (prop === 'finally') return p.finally.bind(p)
      return () => obj
    },
    apply() { return obj },
  })
  return obj
}

const fromResults = []
const mockSupabase = {
  from: vi.fn(() => chain(fromResults.shift() ?? { data: [], error: null })),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}
vi.mock('../lib/supabaseClient', () => ({ supabase: mockSupabase }))

const api = await import('../board/volumeApi.js')
const { keyOf } = await import('../works/workKey.js')

beforeEach(() => {
  fromResults.length = 0
  mockSupabase.from.mockClear()
})

const WORK = { '작품명': '소나기', '지은이': '황순원', _authorBase: '황순원', '장르': '소설', '교육과정': '7차' }

test('ensureWorkId: 레지스트리 맵에 있으면 조회 없이 그 ID를 쓴다', async () => {
  const map = new Map([[keyOf('소나기', '황순원'), 'W000007']])
  const id = await api.ensureWorkId(WORK, ['7차'], map)
  expect(id).toBe('W000007')
  expect(mockSupabase.from).not.toHaveBeenCalled()
})

test('ensureWorkId: 없으면 insert하고 새 ID를 받는다', async () => {
  fromResults.push({ data: { work_id: 'W000042' }, error: null }) // insert().select().single()
  const id = await api.ensureWorkId(WORK, ['7차'], new Map())
  expect(id).toBe('W000042')
  expect(mockSupabase.from).toHaveBeenCalledWith('works_registry')
})

test('addWorkToVolume: unique 위반(23505)이면 한국어 메시지로 바꾼다', async () => {
  fromResults.push({ data: { work_id: 'W000001' }, error: null })  // registry insert
  fromResults.push({ data: null, error: { code: '23505', message: 'duplicate' } }) // volume_works insert
  await expect(
    api.addWorkToVolume({ volumeId: 'v1', work: WORK, curricula: [], registryMap: new Map(), sortOrder: 10 }),
  ).rejects.toThrow('이미 이 권에 있는 작품입니다')
})

test('listVolumes: 오류면 throw', async () => {
  fromResults.push({ data: null, error: { message: 'boom' } })
  await expect(api.listVolumes()).rejects.toThrow('boom')
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/tests/volumeApi.test.js`
Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `src/board/volumeApi.js`

```js
// 권 보드의 모든 Supabase 호출. UI는 이 모듈만 통해 서버와 대화한다.
import { supabase } from '../lib/supabaseClient'
import { keyOf, snapshotOf } from '../works/workKey.js'

function unwrap({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}

// ---------- volumes ----------

export async function listVolumes() {
  return unwrap(await supabase.from('volumes').select('*').order('number'))
}

export async function createVolume({ number, title }) {
  return unwrap(await supabase.from('volumes').insert({ number, title }).select().single())
}

export async function updateVolume(id, patch) {
  return unwrap(await supabase.from('volumes').update(patch).eq('id', id).select().single())
}

// ---------- 보드 로드 ----------

export async function getBoard(volumeId) {
  const volume = unwrap(await supabase.from('volumes').select('*').eq('id', volumeId).single())
  const works = unwrap(
    await supabase.from('volume_works').select('*').eq('volume_id', volumeId).order('sort_order'),
  )
  const ids = works.map(w => w.id)
  const tasks = ids.length
    ? unwrap(await supabase.from('work_tasks').select('*').in('volume_work_id', ids).order('sort_order'))
    : []
  return { volume, works, tasks }
}

// 중복 수록 뱃지용: 전체 권의 수록 현황 (권 번호 포함)
export async function listAllVolumeWorks() {
  return unwrap(
    await supabase.from('volume_works')
      .select('id, volume_id, work_id, selection_status, volumes(number, title)'),
  )
}

// ---------- works_registry ----------

export async function listRegistry() {
  return unwrap(await supabase.from('works_registry').select('*'))
}

// 맵에서 찾으면 기존 ID. 없으면 insert — 동시 등록 경합(23505)이면 재조회.
export async function ensureWorkId(work, curricula, registryMap) {
  const existing = registryMap.get(keyOf(work['작품명'], work._authorBase))
  if (existing) return existing

  const row = {
    title: work['작품명'],
    author_base: work._authorBase,
    snapshot: snapshotOf(work, curricula),
  }
  const { data, error } = await supabase.from('works_registry').insert(row).select('work_id').single()
  if (!error) return data.work_id
  if (error.code === '23505') {
    const again = unwrap(
      await supabase.from('works_registry').select('work_id')
        .eq('title', row.title).eq('author_base', row.author_base).single(),
    )
    return again.work_id
  }
  throw new Error(error.message)
}

// ---------- volume_works ----------

export async function addWorkToVolume({ volumeId, work, curricula, registryMap, sortOrder }) {
  const workId = await ensureWorkId(work, curricula, registryMap)
  const { data, error } = await supabase.from('volume_works').insert({
    volume_id: volumeId,
    work_id: workId,
    work_snapshot: snapshotOf(work, curricula),
    sort_order: sortOrder,
  }).select().single()
  if (error) {
    if (error.code === '23505') throw new Error('이미 이 권에 있는 작품입니다')
    throw new Error(error.message)
  }
  return data
}

export async function updateVolumeWork(id, patch) {
  return unwrap(await supabase.from('volume_works').update(patch).eq('id', id).select().single())
}

export async function deleteVolumeWork(id) {
  unwrap(await supabase.from('volume_works').delete().eq('id', id))
}

export async function applySortSwap(pairs) {
  for (const { id, sort_order } of pairs) {
    unwrap(await supabase.from('volume_works').update({ sort_order }).eq('id', id).select().single())
  }
}

// ---------- work_tasks ----------

export async function addTasks(volumeWorkId, items) {
  return unwrap(
    await supabase.from('work_tasks')
      .insert(items.map(it => ({ ...it, volume_work_id: volumeWorkId })))
      .select(),
  )
}

export async function updateTask(id, patch) {
  return unwrap(await supabase.from('work_tasks').update(patch).eq('id', id).select().single())
}

export async function deleteTask(id) {
  unwrap(await supabase.from('work_tasks').delete().eq('id', id))
}

// ---------- 기타 ----------

export async function listMembers() {
  return unwrap(await supabase.from('members').select('id, name, role, affiliation').order('name'))
}

export async function listActivityFor(recordIds) {
  if (!recordIds.length) return []
  return unwrap(
    await supabase.from('activity_log').select('*')
      .in('record_id', recordIds).order('id', { ascending: false }).limit(5),
  )
}

// ---------- Realtime (설계 §7) ----------

export function subscribeBoard(onChange) {
  const ch = supabase.channel('board-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'volume_works' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'work_tasks' }, onChange)
    .subscribe()
  return () => supabase.removeChannel(ch)
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/volumeApi.js src/tests/volumeApi.test.js
git commit -m "feat: volumeApi — 권·수록작품·업무·레지스트리·Realtime 호출 계층"
```

---

### Task 6: Toast + useVolumeBoard 훅 (상태·액션·Realtime)

**Files:**
- Create: `src/components/Toast.jsx`, `src/board/useVolumeBoard.js`
- Modify: `src/App.jsx` — `<AuthProvider>` 바로 안쪽을 `<ToastProvider>`로 감싼다
- Test: `src/tests/useVolumeBoard.test.jsx`

**Interfaces:**
- Consumes: `volumeApi`(Task 5 전체), `nextSortOrder`/`swapPlan`(Task 4)
- Produces:
  - `<ToastProvider>` + `useToast() → { show(message) }` — 3초 자동 사라짐
  - `useVolumeBoard(volumeId) → { volume, works, tasksByVw, members, loading, error, actions }`
    - `tasksByVw`: `{ [volume_work_id]: task[] }`
    - `actions.addWork(work, curricula, registryMap)` / `actions.setVolumeWork(id, patch)` / `actions.removeWork(id)` / `actions.move(id, dir)` / `actions.addTasks(vwId, items)` / `actions.setTask(id, patch)` / `actions.removeTask(id)` / `actions.reload()`
    - 모든 액션: 성공 시 서버 응답으로 로컬 패치, 실패 시 `useToast().show(메시지)` + `reload()`
    - Realtime: `subscribeBoard`로 구독, 이벤트 수신 시 300ms 디바운스 후 `reload()`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/useVolumeBoard.test.jsx`

```jsx
import { render, screen, waitFor, act } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  getBoard: vi.fn(),
  listMembers: vi.fn().mockResolvedValue([{ id: 'm1', name: '김편집' }]),
  subscribeBoard: vi.fn(() => () => {}),
  addWorkToVolume: vi.fn(),
  updateVolumeWork: vi.fn(),
  deleteVolumeWork: vi.fn(),
  applySortSwap: vi.fn(),
  addTasks: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}))
const api = await import('../board/volumeApi.js')
const { useVolumeBoard } = await import('../board/useVolumeBoard.js')
const { ToastProvider } = await import('../components/Toast.jsx')

const BOARD = {
  volume: { id: 'v1', number: 3, title: '성장' },
  works: [{ id: 'vw1', volume_id: 'v1', work_id: 'W000001', sort_order: 10, selection_status: 'candidate', production_status: 'not_started', work_snapshot: { title: '소나기', author: '황순원' } }],
  tasks: [{ id: 't1', volume_work_id: 'vw1', status: 'todo', title: '해제 작성' }],
}

function Probe() {
  const { volume, works, tasksByVw, loading, actions } = useVolumeBoard('v1')
  if (loading) return <div>로딩</div>
  return (
    <div>
      <div>권:{volume.number} 작품수:{works.length} vw1업무:{(tasksByVw.vw1 || []).length}</div>
      <button onClick={() => actions.setTask('t1', { status: 'done' })}>완료</button>
    </div>
  )
}

function renderProbe() {
  return render(<ToastProvider><Probe /></ToastProvider>)
}

test('보드를 로드해 works/tasksByVw를 제공한다', async () => {
  api.getBoard.mockResolvedValue(BOARD)
  renderProbe()
  await waitFor(() => expect(screen.getByText('권:3 작품수:1 vw1업무:1')).toBeInTheDocument())
})

test('setTask 성공 시 로컬 상태를 패치한다', async () => {
  api.getBoard.mockResolvedValue(BOARD)
  api.updateTask.mockResolvedValue({ ...BOARD.tasks[0], status: 'done' })
  renderProbe()
  await waitFor(() => screen.getByText('완료'))
  await act(() => screen.getByText('완료').click())
  expect(api.updateTask).toHaveBeenCalledWith('t1', { status: 'done' })
})

test('실패하면 reload로 롤백한다', async () => {
  api.getBoard.mockResolvedValue(BOARD)
  api.updateTask.mockRejectedValue(new Error('네트워크 오류'))
  renderProbe()
  await waitFor(() => screen.getByText('완료'))
  await act(() => screen.getByText('완료').click())
  await waitFor(() => expect(api.getBoard).toHaveBeenCalledTimes(2)) // 초기 1 + 롤백 1
})

test('Realtime 이벤트가 오면 다시 로드한다', async () => {
  vi.useFakeTimers()
  api.getBoard.mockResolvedValue(BOARD)
  let fire
  api.subscribeBoard.mockImplementation(cb => { fire = cb; return () => {} })
  renderProbe()
  await act(async () => { await vi.runOnlyPendingTimersAsync() })
  act(() => { fire({}); fire({}) }) // 연속 2회 → 디바운스로 1회만
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  expect(api.getBoard).toHaveBeenCalledTimes(2)
  vi.useRealTimers()
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/tests/useVolumeBoard.test.jsx`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/components/Toast.jsx`:

```jsx
import { createContext, useCallback, useContext, useRef, useState } from 'react'

const ToastContext = createContext({ show: () => {} })

export function ToastProvider({ children }) {
  const [message, setMessage] = useState(null)
  const timer = useRef(null)

  const show = useCallback(msg => {
    setMessage(msg)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(null), 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {message && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
```

`src/board/useVolumeBoard.js`:

```js
// 권 보드 화면의 상태·액션·실시간 동기화를 소유하는 훅.
// 원칙: 액션은 서버 성공 응답으로 로컬 패치, 실패는 토스트 + 전체 재조회(롤백).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from './volumeApi.js'
import { nextSortOrder, swapPlan } from './boardUtils.js'
import { useToast } from '../components/Toast.jsx'

export function useVolumeBoard(volumeId) {
  const [volume, setVolume] = useState(null)
  const [works, setWorks] = useState([])
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { show } = useToast()
  const debounceRef = useRef(null)

  const reload = useCallback(async () => {
    try {
      const board = await api.getBoard(volumeId)
      setVolume(board.volume)
      setWorks(board.works)
      setTasks(board.tasks)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [volumeId])

  useEffect(() => {
    setLoading(true)
    reload()
    api.listMembers().then(setMembers).catch(() => {})
    const unsubscribe = api.subscribeBoard(() => {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(reload, 300)
    })
    return () => {
      clearTimeout(debounceRef.current)
      unsubscribe()
    }
  }, [reload])

  // 실패 공통 처리: 토스트 + 재조회 롤백
  const guard = useCallback(async fn => {
    try {
      return await fn()
    } catch (err) {
      show(err.message)
      reload()
      return null
    }
  }, [show, reload])

  const tasksByVw = useMemo(() => {
    const map = {}
    for (const t of tasks) (map[t.volume_work_id] ||= []).push(t)
    return map
  }, [tasks])

  const actions = useMemo(() => ({
    reload,

    addWork: (work, curricula, registryMap) => guard(async () => {
      const row = await api.addWorkToVolume({
        volumeId, work, curricula, registryMap, sortOrder: nextSortOrder(works),
      })
      setWorks(ws => [...ws, row])
      return row
    }),

    setVolumeWork: (id, patch) => guard(async () => {
      const row = await api.updateVolumeWork(id, patch)
      setWorks(ws => ws.map(w => (w.id === id ? row : w)))
      return row
    }),

    removeWork: id => guard(async () => {
      await api.deleteVolumeWork(id)
      setWorks(ws => ws.filter(w => w.id !== id))
      setTasks(ts => ts.filter(t => t.volume_work_id !== id))
    }),

    move: (id, dir) => guard(async () => {
      const pairs = swapPlan(works, id, dir)
      if (!pairs) return
      await api.applySortSwap(pairs)
      setWorks(ws => {
        const orderOf = Object.fromEntries(pairs.map(p => [p.id, p.sort_order]))
        return ws.map(w => (orderOf[w.id] != null ? { ...w, sort_order: orderOf[w.id] } : w))
          .sort((a, b) => a.sort_order - b.sort_order)
      })
    }),

    addTasks: (vwId, items) => guard(async () => {
      const rows = await api.addTasks(vwId, items)
      setTasks(ts => [...ts, ...rows])
      return rows
    }),

    setTask: (id, patch) => guard(async () => {
      const row = await api.updateTask(id, patch)
      setTasks(ts => ts.map(t => (t.id === id ? row : t)))
      return row
    }),

    removeTask: id => guard(async () => {
      await api.deleteTask(id)
      setTasks(ts => ts.filter(t => t.id !== id))
    }),
  }), [guard, reload, volumeId, works])

  return { volume, works, tasksByVw, members, loading, error, actions }
}
```

`src/App.jsx` 수정 — import 추가 후 `<AuthProvider>` 안쪽 최상단을 감싼다:

```jsx
import { ToastProvider } from './components/Toast.jsx'
// ...
export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <HashRouter>
          {/* 기존 Routes 그대로 */}
        </HashRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 전부 PASS (기존 스모크 포함)

- [ ] **Step 5: Commit**

```bash
git add src/components/Toast.jsx src/board/useVolumeBoard.js src/tests/useVolumeBoard.test.jsx src/App.jsx
git commit -m "feat: useVolumeBoard 훅 — 보드 상태·액션·Realtime 디바운스 재조회 + 토스트"
```

---

### Task 7: VolumesPage (권 목록 + 새 권 만들기) + 라우팅

**Files:**
- Create: `src/board/VolumesPage.jsx`
- Modify: `src/App.jsx` — `/volumes` Placeholder를 VolumesPage로 교체, `/volumes/:id` 라우트 추가(임시로 VolumesPage를 가리켰다가 Task 10에서 교체)
- Test: `src/tests/VolumesPage.test.jsx`

**Interfaces:**
- Consumes: `listVolumes`/`createVolume` (Task 5), `PRODUCTION_LABELS`(Task 4), `useToast`(Task 6)
- Produces: `/volumes`에서 권 카드 목록(번호·주제명·상태), "새 권 추가" 인라인 폼(번호·주제명), 카드 클릭 → `/volumes/:id` 이동

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/VolumesPage.test.jsx`

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  listVolumes: vi.fn(),
  createVolume: vi.fn(),
}))
const api = await import('../board/volumeApi.js')
const { default: VolumesPage } = await import('../board/VolumesPage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

function renderPage() {
  return render(<ToastProvider><HashRouter><VolumesPage /></HashRouter></ToastProvider>)
}

test('권 목록을 보여준다', async () => {
  api.listVolumes.mockResolvedValue([
    { id: 'v1', number: 1, title: '가족', status: '선정중' },
    { id: 'v2', number: 2, title: '성장', status: '기획' },
  ])
  renderPage()
  await waitFor(() => expect(screen.getByText('가족')).toBeInTheDocument())
  expect(screen.getByText('성장')).toBeInTheDocument()
  expect(screen.getByText('선정중')).toBeInTheDocument()
})

test('새 권을 추가하면 목록에 나타난다', async () => {
  api.listVolumes.mockResolvedValue([])
  api.createVolume.mockResolvedValue({ id: 'v9', number: 9, title: '자연', status: '기획' })
  renderPage()
  await waitFor(() => screen.getByRole('button', { name: '새 권 추가' }))
  await userEvent.type(screen.getByLabelText('권 번호'), '9')
  await userEvent.type(screen.getByLabelText('주제명'), '자연')
  await userEvent.click(screen.getByRole('button', { name: '새 권 추가' }))
  expect(api.createVolume).toHaveBeenCalledWith({ number: 9, title: '자연' })
  await waitFor(() => expect(screen.getByText('자연')).toBeInTheDocument())
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/tests/VolumesPage.test.jsx`
Expected: FAIL

- [ ] **Step 3: 구현** — `src/board/VolumesPage.jsx`

```jsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listVolumes, createVolume } from './volumeApi.js'
import { useToast } from '../components/Toast.jsx'

export default function VolumesPage() {
  const [volumes, setVolumes] = useState([])
  const [loading, setLoading] = useState(true)
  const [number, setNumber] = useState('')
  const [title, setTitle] = useState('')
  const { show } = useToast()

  useEffect(() => {
    listVolumes().then(setVolumes).catch(err => show(err.message)).finally(() => setLoading(false))
  }, [show])

  async function handleCreate(e) {
    e.preventDefault()
    try {
      const v = await createVolume({ number: Number(number), title: title.trim() })
      setVolumes(vs => [...vs, v].sort((a, b) => a.number - b.number))
      setNumber('')
      setTitle('')
    } catch (err) {
      show(/duplicate|23505/i.test(err.message) ? '이미 있는 권 번호입니다' : err.message)
    }
  }

  if (loading) return <p className="text-gray-500">불러오는 중…</p>

  return (
    <div className="max-w-3xl">
      <h2 className="mb-4 text-lg font-bold">권별 작품 목록</h2>

      <ul className="mb-6 space-y-2">
        {volumes.map(v => (
          <li key={v.id}>
            <Link
              to={`/volumes/${v.id}`}
              className="flex items-center gap-3 rounded border border-gray-200 px-4 py-3 hover:bg-gray-50"
            >
              <span className="font-semibold">{v.number}권</span>
              <span className="flex-1">{v.title}</span>
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{v.status}</span>
            </Link>
          </li>
        ))}
        {!volumes.length && <li className="text-sm text-gray-500">아직 권이 없습니다. 아래에서 추가하세요.</li>}
      </ul>

      <form onSubmit={handleCreate} className="flex items-end gap-3 rounded border border-gray-200 p-4">
        <div>
          <label className="block text-xs text-gray-500" htmlFor="vol-number">권 번호</label>
          <input id="vol-number" type="number" required min="1" value={number}
            onChange={e => setNumber(e.target.value)}
            className="w-24 rounded border border-gray-300 px-2 py-1" />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500" htmlFor="vol-title">주제명</label>
          <input id="vol-title" required value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="예: 다양한 삶의 모습"
            className="w-full rounded border border-gray-300 px-2 py-1" />
        </div>
        <button type="submit" className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white">
          새 권 추가
        </button>
      </form>
    </div>
  )
}
```

`src/App.jsx` 수정 — import 추가:

```jsx
import VolumesPage from './board/VolumesPage.jsx'
```

라우트 교체 (`/volumes` Placeholder 줄을 다음 두 줄로):

```jsx
            <Route path="/volumes" element={<VolumesPage />} />
            <Route path="/volumes/:id" element={<VolumesPage />} /> {/* Task 10에서 VolumeBoardPage로 교체 */}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/VolumesPage.jsx src/tests/VolumesPage.test.jsx src/App.jsx
git commit -m "feat: 권 목록 페이지 (새 권 추가 포함)"
```

---

### Task 8: MultiSelectDropdown + SearchPane (작품 검색·추가·중복 뱃지)

**Files:**
- Create: `src/board/MultiSelectDropdown.jsx`, `src/board/SearchPane.jsx`
- Test: `src/tests/SearchPane.test.jsx`

**Interfaces:**
- Consumes: `useWorksData`(Task 3), `filterWorks`/`getUniqueValues`(Task 1), `workKeyOf`/`curriculaOf`(Task 2)
- Produces:
  - `<MultiSelectDropdown label options selected onChange />` — options: string[], selected: string[], onChange(next: string[])
  - `<SearchPane works duplicatesByKey onAdd />`
    - `works`: 시트 작품 배열 (부모가 useWorksData로 로드해 내려줌)
    - `duplicatesByKey`: `Map<workKey, [{volumeNumber, selection_status}]>` — 부모(Task 10)가 registry+listAllVolumeWorks로 계산
    - `onAdd(representativeWork, curricula)`: 추가 버튼 클릭 시 호출. representativeWork는 그 작품의 첫 시트 행
    - 검색 결과는 **작품 단위로 중복 제거**(workKeyOf 기준)해 최대 50개 표시 + 총 건수 표시
    - 이미 수록된 권이 있으면 "2권 수록" 뱃지 표시

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/SearchPane.test.jsx`

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const { default: SearchPane } = await import('../board/SearchPane.jsx')
const { workKeyOf } = await import('../works/workKey.js')

const WORKS = [
  { '작품명': '소나기', '지은이': '황순원', _authorBase: '황순원', '장르': '소설', '교육과정': '7차', _titleChosung: 'ㅅㄴㄱ', _authorChosung: 'ㅎㅅㅇ' },
  { '작품명': '소나기', '지은이': '황순원', _authorBase: '황순원', '장르': '소설', '교육과정': '2015', _titleChosung: 'ㅅㄴㄱ', _authorChosung: 'ㅎㅅㅇ' },
  { '작품명': '별 헤는 밤', '지은이': '윤동주', _authorBase: '윤동주', '장르': '현대시', '교육과정': '2015', _titleChosung: 'ㅂ ㅎㄴ ㅂ', _authorChosung: 'ㅇㄷㅈ' },
]

test('작품 단위로 묶어 보여주고, 추가 시 대표 행과 교육과정 목록을 넘긴다', async () => {
  const onAdd = vi.fn()
  render(<SearchPane works={WORKS} duplicatesByKey={new Map()} onAdd={onAdd} />)
  // 소나기는 2행이지만 1건으로 묶임
  expect(screen.getAllByRole('button', { name: '추가' })).toHaveLength(2)
  await userEvent.click(screen.getAllByRole('button', { name: '추가' })[0])
  expect(onAdd).toHaveBeenCalledWith(
    expect.objectContaining({ '작품명': '소나기' }),
    ['2015', '7차'],
  )
})

test('검색어로 거른다', async () => {
  render(<SearchPane works={WORKS} duplicatesByKey={new Map()} onAdd={() => {}} />)
  await userEvent.type(screen.getByPlaceholderText(/작품명·작가/), '윤동주')
  await waitFor(() => expect(screen.getAllByRole('button', { name: '추가' })).toHaveLength(1))
  expect(screen.getByText('별 헤는 밤')).toBeInTheDocument()
})

test('이미 수록된 작품에는 권 뱃지를 단다', () => {
  const dup = new Map([[workKeyOf(WORKS[0]), [{ volumeNumber: 2, selection_status: 'confirmed' }]]])
  render(<SearchPane works={WORKS} duplicatesByKey={dup} onAdd={() => {}} />)
  expect(screen.getByText('2권 수록')).toBeInTheDocument()
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/tests/SearchPane.test.jsx`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/board/MultiSelectDropdown.jsx`:

```jsx
import { useEffect, useRef, useState } from 'react'

export default function MultiSelectDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function toggle(value) {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`rounded border px-2 py-1 text-sm ${selected.length ? 'border-blue-400 text-blue-700' : 'border-gray-300 text-gray-600'}`}
      >
        {label}{selected.length ? ` ${selected.length}` : ''} ▾
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-44 overflow-auto rounded border border-gray-200 bg-white p-2 shadow-lg">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 py-0.5 text-sm">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              {opt}
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 text-xs text-gray-500 underline">
              모두 해제
            </button>
          )}
        </div>
      )}
    </div>
  )
}
```

`src/board/SearchPane.jsx`:

```jsx
// 좌측 작품 검색 패널: 시트 작품을 작품 단위로 묶어 보여주고 권에 추가한다.
import { useMemo, useState } from 'react'
import { filterWorks, getUniqueValues } from '../works/filterWorks.js'
import { workKeyOf, curriculaOf } from '../works/workKey.js'
import MultiSelectDropdown from './MultiSelectDropdown.jsx'

const MAX_SHOWN = 50

export default function SearchPane({ works, duplicatesByKey, onAdd }) {
  const [query, setQuery] = useState('')
  const [curriculum, setCurriculum] = useState([])
  const [genre, setGenre] = useState([])

  const curriculumOptions = useMemo(() => getUniqueValues(works, '교육과정'), [works])
  const genreOptions = useMemo(() => getUniqueValues(works, '장르'), [works])

  // 필터 → 작품 단위 그룹핑 (첫 행을 대표로)
  const grouped = useMemo(() => {
    const filtered = filterWorks(works, { curriculum, genre, query })
    const map = new Map()
    for (const w of filtered) {
      const key = workKeyOf(w)
      if (!map.has(key)) map.set(key, w)
    }
    return [...map.entries()] // [key, 대표행]
  }, [works, curriculum, genre, query])

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="작품명·작가 검색 (초성 가능)"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <MultiSelectDropdown label="교육과정" options={curriculumOptions} selected={curriculum} onChange={setCurriculum} />
        <MultiSelectDropdown label="갈래" options={genreOptions} selected={genre} onChange={setGenre} />
      </div>

      <p className="mb-1 text-xs text-gray-400">작품 {grouped.length}건{grouped.length > MAX_SHOWN ? ` (상위 ${MAX_SHOWN}건 표시)` : ''}</p>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {grouped.slice(0, MAX_SHOWN).map(([key, w]) => {
          const dups = duplicatesByKey.get(key) || []
          return (
            <li key={key} className="flex items-center gap-2 rounded border border-gray-100 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{w['작품명']}</div>
                <div className="truncate text-xs text-gray-500">
                  {w._authorBase} · {w['장르']}
                </div>
              </div>
              {dups.map(d => (
                <span key={d.volumeNumber} className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                  {d.volumeNumber}권 수록
                </span>
              ))}
              <button
                type="button"
                onClick={() => onAdd(w, curriculaOf(works, key))}
                className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white"
              >
                추가
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/MultiSelectDropdown.jsx src/board/SearchPane.jsx src/tests/SearchPane.test.jsx
git commit -m "feat: 작품 검색 패널 — 필터·작품 단위 그룹핑·중복 뱃지·추가"
```

---

### Task 9: VolumeWorkList (수록 목록 + 필터 바) + WorkDetailPanel (상세·업무 체크리스트)

**Files:**
- Create: `src/board/VolumeWorkList.jsx`, `src/board/WorkDetailPanel.jsx`
- Test: `src/tests/VolumeWorkList.test.jsx`, `src/tests/WorkDetailPanel.test.jsx`

**Interfaces:**
- Consumes: `SELECTION_LABELS`/`PRODUCTION_LABELS`/`TASK_PRESETS`(Task 4), `tasksProgress`/`nearestDue`/`daysUntil`/`dDayLabel`/`filterVolumeWorks`(Task 4), `listActivityFor`(Task 5)
- Produces:
  - `<VolumeWorkList works tasksByVw members selectedId onSelect onMove />`
    - 행: 제목/작가(work_snapshot), 선정·제작 배지, 진행률 `n/m`, 최근접 마감 D-day, ▲▼ 버튼
    - 필터 바: 선정 상태·제작 상태·담당자 MultiSelect + "마감 임박"·"완료 숨김" 체크박스
    - 행 클릭 → `onSelect(volumeWork.id)`
  - `<WorkDetailPanel volumeWork tasks members duplicates actions onClose />`
    - `duplicates`: `[{volumeNumber, selection_status}]` (이 작품의 다른 권 수록)
    - `actions`: useVolumeBoard의 actions (setVolumeWork, addTasks, setTask, removeTask, removeWork)
    - 섹션: 작품 정보(스냅숏+다른 권 수록) / 선정(상태 select+메모) / 제작(상태 select, 진행률, 업무 체크리스트, 프리셋 다중 추가+직접 입력, 담당자·마감 인라인 편집, 삭제) / 이력(listActivityFor 최근 5건)
    - 모든 업무 done && production_status !== 'completed' → "모든 업무가 완료되었습니다. 제작 상태를 '완료'로 변경할까요?" + [완료로 변경] 버튼

- [ ] **Step 1: 실패하는 테스트 작성**

`src/tests/VolumeWorkList.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const { default: VolumeWorkList } = await import('../board/VolumeWorkList.jsx')

const WORKS = [
  { id: 'vw1', sort_order: 10, selection_status: 'confirmed', production_status: 'in_progress', work_snapshot: { title: '소나기', author: '황순원' } },
  { id: 'vw2', sort_order: 20, selection_status: 'candidate', production_status: 'not_started', work_snapshot: { title: '별 헤는 밤', author: '윤동주' } },
]
const TASKS = { vw1: [{ id: 't1', status: 'done' }, { id: 't2', status: 'todo', due_date: '2099-01-01' }], vw2: [] }

test('행에 배지·진행률을 표시하고 클릭하면 onSelect', async () => {
  const onSelect = vi.fn()
  render(<VolumeWorkList works={WORKS} tasksByVw={TASKS} members={[]} selectedId={null} onSelect={onSelect} onMove={() => {}} />)
  expect(screen.getByText('소나기')).toBeInTheDocument()
  expect(screen.getByText('확정')).toBeInTheDocument()
  expect(screen.getByText('진행 중')).toBeInTheDocument()
  expect(screen.getByText('1/2')).toBeInTheDocument()
  await userEvent.click(screen.getByText('소나기'))
  expect(onSelect).toHaveBeenCalledWith('vw1')
})

test('선정 상태 필터가 목록을 거른다', async () => {
  render(<VolumeWorkList works={WORKS} tasksByVw={TASKS} members={[]} selectedId={null} onSelect={() => {}} onMove={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: /선정 상태/ }))
  await userEvent.click(screen.getByLabelText('후보'))
  expect(screen.queryByText('소나기')).not.toBeInTheDocument()
  expect(screen.getByText('별 헤는 밤')).toBeInTheDocument()
})

test('▼를 누르면 onMove(id, "down")', async () => {
  const onMove = vi.fn()
  render(<VolumeWorkList works={WORKS} tasksByVw={TASKS} members={[]} selectedId={null} onSelect={() => {}} onMove={onMove} />)
  await userEvent.click(screen.getAllByRole('button', { name: '아래로' })[0])
  expect(onMove).toHaveBeenCalledWith('vw1', 'down')
})
```

`src/tests/WorkDetailPanel.test.jsx`:

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  listActivityFor: vi.fn().mockResolvedValue([]),
}))
const { default: WorkDetailPanel } = await import('../board/WorkDetailPanel.jsx')

const VW = {
  id: 'vw1', selection_status: 'confirmed', production_status: 'in_progress', note: '',
  work_snapshot: { title: '소나기', author: '황순원', genre: '소설', curriculum: ['7차', '2015'] },
}
const MEMBERS = [{ id: 'm1', name: '김편집' }]

function makeActions() {
  return {
    setVolumeWork: vi.fn(), addTasks: vi.fn(), setTask: vi.fn(), removeTask: vi.fn(), removeWork: vi.fn(),
  }
}

test('작품 정보·다른 권 수록·진행률을 보여준다', () => {
  const tasks = [{ id: 't1', title: '해제 작성', status: 'done' }, { id: 't2', title: '교정', status: 'todo' }]
  render(<WorkDetailPanel volumeWork={VW} tasks={tasks} members={MEMBERS}
    duplicates={[{ volumeNumber: 2, selection_status: 'confirmed' }]} actions={makeActions()} onClose={() => {}} />)
  expect(screen.getByText('소나기')).toBeInTheDocument()
  expect(screen.getByText(/2권/)).toBeInTheDocument()
  expect(screen.getByText('1/2')).toBeInTheDocument()
})

test('체크박스로 업무를 완료 처리한다', async () => {
  const actions = makeActions()
  const tasks = [{ id: 't1', title: '해제 작성', status: 'todo' }]
  render(<WorkDetailPanel volumeWork={VW} tasks={tasks} members={MEMBERS} duplicates={[]} actions={actions} onClose={() => {}} />)
  await userEvent.click(screen.getByRole('checkbox', { name: /해제 작성/ }))
  expect(actions.setTask).toHaveBeenCalledWith('t1', { status: 'done' })
})

test('프리셋을 골라 업무를 추가한다', async () => {
  const actions = makeActions()
  render(<WorkDetailPanel volumeWork={VW} tasks={[]} members={MEMBERS} duplicates={[]} actions={actions} onClose={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: '업무 추가' }))
  await userEvent.click(screen.getByLabelText('해제 작성'))
  await userEvent.click(screen.getByLabelText('교정'))
  await userEvent.click(screen.getByRole('button', { name: '선택한 업무 추가' }))
  expect(actions.addTasks).toHaveBeenCalledWith('vw1', [
    { task_type: 'commentary', title: '해제 작성', sort_order: 10 },
    { task_type: 'proof', title: '교정', sort_order: 20 },
  ])
})

test('모든 업무 완료 시 제작 완료 제안이 뜬다', async () => {
  const actions = makeActions()
  const tasks = [{ id: 't1', title: '교정', status: 'done' }]
  render(<WorkDetailPanel volumeWork={VW} tasks={tasks} members={MEMBERS} duplicates={[]} actions={actions} onClose={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: '완료로 변경' }))
  expect(actions.setVolumeWork).toHaveBeenCalledWith('vw1', { production_status: 'completed' })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/tests/VolumeWorkList.test.jsx src/tests/WorkDetailPanel.test.jsx`
Expected: FAIL

- [ ] **Step 3: 구현**

`src/board/VolumeWorkList.jsx`:

```jsx
// 우측 수록 목록: 배지·진행률·마감 요약 + 필터 바 + 순서 이동
import { useMemo, useState } from 'react'
import { SELECTION_LABELS, PRODUCTION_LABELS } from './constants.js'
import { tasksProgress, nearestDue, daysUntil, dDayLabel, filterVolumeWorks } from './boardUtils.js'
import MultiSelectDropdown from './MultiSelectDropdown.jsx'

const SELECTION_BADGE = {
  candidate: 'bg-gray-100 text-gray-700',
  hold: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  excluded: 'bg-gray-200 text-gray-400 line-through',
}
const PRODUCTION_BADGE = {
  not_started: 'bg-gray-100 text-gray-500',
  in_progress: 'bg-green-100 text-green-800',
  review: 'bg-purple-100 text-purple-800',
  completed: 'bg-blue-600 text-white',
}

export default function VolumeWorkList({ works, tasksByVw, members, selectedId, onSelect, onMove }) {
  const [selection, setSelection] = useState([])
  const [production, setProduction] = useState([])
  const [assignee, setAssignee] = useState([])
  const [dueSoon, setDueSoon] = useState(false)
  const [hideCompleted, setHideCompleted] = useState(false)

  const memberNameById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m.name])), [members])

  const selectionKeys = Object.keys(SELECTION_LABELS)
  const productionKeys = Object.keys(PRODUCTION_LABELS)

  const filtered = useMemo(
    () => filterVolumeWorks(works, tasksByVw, {
      selection, production, assignee, dueSoon, hideCompleted,
    }),
    [works, tasksByVw, selection, production, assignee, dueSoon, hideCompleted],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <MultiSelectDropdown label="선정 상태"
          options={selectionKeys.map(k => SELECTION_LABELS[k])}
          selected={selection.map(k => SELECTION_LABELS[k])}
          onChange={labels => setSelection(selectionKeys.filter(k => labels.includes(SELECTION_LABELS[k])))} />
        <MultiSelectDropdown label="제작 상태"
          options={productionKeys.map(k => PRODUCTION_LABELS[k])}
          selected={production.map(k => PRODUCTION_LABELS[k])}
          onChange={labels => setProduction(productionKeys.filter(k => labels.includes(PRODUCTION_LABELS[k])))} />
        <MultiSelectDropdown label="담당자"
          options={members.map(m => m.name)}
          selected={assignee.map(id => memberNameById[id]).filter(Boolean)}
          onChange={names => setAssignee(members.filter(m => names.includes(m.name)).map(m => m.id))} />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={dueSoon} onChange={e => setDueSoon(e.target.checked)} /> 마감 임박
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={hideCompleted} onChange={e => setHideCompleted(e.target.checked)} /> 완료 숨김
        </label>
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {filtered.map(vw => {
          const tasks = tasksByVw[vw.id] || []
          const { done, total } = tasksProgress(tasks)
          const due = nearestDue(tasks)
          return (
            <li
              key={vw.id}
              className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${selectedId === vw.id ? 'border-blue-400 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}
              onClick={() => onSelect(vw.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{vw.work_snapshot.title}</div>
                <div className="truncate text-xs text-gray-500">{vw.work_snapshot.author}</div>
              </div>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${SELECTION_BADGE[vw.selection_status]}`}>
                {SELECTION_LABELS[vw.selection_status]}
              </span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${PRODUCTION_BADGE[vw.production_status]}`}>
                {PRODUCTION_LABELS[vw.production_status]}
              </span>
              {total > 0 && <span className="shrink-0 text-xs text-gray-600">{done}/{total}</span>}
              {due && (
                <span className={`shrink-0 text-xs ${daysUntil(due) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {dDayLabel(daysUntil(due))}
                </span>
              )}
              <span className="flex shrink-0 flex-col" onClick={e => e.stopPropagation()}>
                <button type="button" aria-label="위로" onClick={() => onMove(vw.id, 'up')} className="text-xs text-gray-400 hover:text-gray-700">▲</button>
                <button type="button" aria-label="아래로" onClick={() => onMove(vw.id, 'down')} className="text-xs text-gray-400 hover:text-gray-700">▼</button>
              </span>
            </li>
          )
        })}
        {!filtered.length && <li className="py-8 text-center text-sm text-gray-400">표시할 작품이 없습니다</li>}
      </ul>
    </div>
  )
}
```

`src/board/WorkDetailPanel.jsx`:

```jsx
// 작품 상세 패널 (설계 §5.1): 정보 / 선정 / 제작(업무 체크리스트) / 이력
import { useEffect, useMemo, useState } from 'react'
import { SELECTION_LABELS, PRODUCTION_LABELS, TASK_PRESETS } from './constants.js'
import { tasksProgress, daysUntil, dDayLabel } from './boardUtils.js'
import { listActivityFor } from './volumeApi.js'

function Section({ title, children }) {
  return (
    <section className="border-t border-gray-100 px-4 py-3">
      <h4 className="mb-2 text-xs font-semibold text-gray-400">{title}</h4>
      {children}
    </section>
  )
}

export default function WorkDetailPanel({ volumeWork: vw, tasks, members, duplicates, actions, onClose }) {
  const [adding, setAdding] = useState(false)
  const [picked, setPicked] = useState([])       // 프리셋 type 배열
  const [customTitle, setCustomTitle] = useState('')
  const [note, setNote] = useState(vw.note || '')
  const [activity, setActivity] = useState([])

  useEffect(() => { setNote(vw.note || '') }, [vw.id, vw.note])

  useEffect(() => {
    listActivityFor([vw.id, ...tasks.map(t => t.id)]).then(setActivity).catch(() => setActivity([]))
  }, [vw.id, vw.updated_at, tasks])

  const { done, total } = tasksProgress(tasks)
  const allDone = total > 0 && done === total
  const snap = vw.work_snapshot

  const nextOrder = useMemo(() => (tasks.length ? Math.max(...tasks.map(t => t.sort_order ?? 0)) + 10 : 10), [tasks])

  function submitTasks() {
    const items = []
    let order = nextOrder
    for (const p of TASK_PRESETS) {
      if (picked.includes(p.type)) {
        items.push({ task_type: p.type, title: p.label, sort_order: order })
        order += 10
      }
    }
    if (customTitle.trim()) {
      items.push({ task_type: 'custom', title: customTitle.trim(), sort_order: order })
    }
    if (items.length) actions.addTasks(vw.id, items)
    setPicked([])
    setCustomTitle('')
    setAdding(false)
  }

  return (
    <aside className="flex h-full w-96 shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white">
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="flex-1">
          <h3 className="text-lg font-bold">{snap.title}</h3>
          <p className="text-sm text-gray-500">{snap.author} · {snap.genre}</p>
          <p className="text-xs text-gray-400">교육과정: {(snap.curriculum || []).join(', ') || '-'}</p>
          {duplicates.length > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              다른 권 수록: {duplicates.map(d => `${d.volumeNumber}권(${SELECTION_LABELS[d.selection_status]})`).join(', ')}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-700">✕</button>
      </div>

      <Section title="선정">
        <div className="mb-2 flex items-center gap-2">
          <label className="text-sm" htmlFor="sel-status">선정 상태</label>
          <select id="sel-status" value={vw.selection_status}
            onChange={e => actions.setVolumeWork(vw.id, { selection_status: e.target.value })}
            className="rounded border border-gray-300 px-2 py-1 text-sm">
            {Object.entries(SELECTION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          onBlur={() => note !== (vw.note || '') && actions.setVolumeWork(vw.id, { note })}
          placeholder="선정 메모 (선정 이유, 논의 내용)"
          rows={2}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </Section>

      <Section title={`제작 진행 ${total ? `(${done}/${total})` : ''}`}>
        <div className="mb-2 flex items-center gap-2">
          <label className="text-sm" htmlFor="prod-status">제작 상태</label>
          <select id="prod-status" value={vw.production_status}
            onChange={e => actions.setVolumeWork(vw.id, { production_status: e.target.value })}
            className="rounded border border-gray-300 px-2 py-1 text-sm">
            {Object.entries(PRODUCTION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          {total > 0 && <span className="text-sm text-gray-500">{done}/{total}</span>}
        </div>

        {allDone && vw.production_status !== 'completed' && (
          <div className="mb-2 flex items-center gap-2 rounded bg-blue-50 px-2 py-1.5 text-xs text-blue-800">
            모든 업무가 완료되었습니다.
            <button type="button" onClick={() => actions.setVolumeWork(vw.id, { production_status: 'completed' })}
              className="rounded bg-blue-600 px-2 py-0.5 font-medium text-white">완료로 변경</button>
          </div>
        )}

        <ul className="space-y-1">
          {tasks.map(t => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={t.title}
                checked={t.status === 'done'}
                onChange={() => actions.setTask(t.id, { status: t.status === 'done' ? 'todo' : 'done' })}
              />
              <span className={`flex-1 truncate ${t.status === 'done' ? 'text-gray-400 line-through' : ''}`}>{t.title}</span>
              <select
                value={t.assignee_id || ''}
                aria-label={`${t.title} 담당자`}
                onChange={e => actions.setTask(t.id, { assignee_id: e.target.value || null })}
                className="w-20 rounded border border-gray-200 px-1 py-0.5 text-xs"
              >
                <option value="">담당자</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input
                type="date"
                value={t.due_date || ''}
                aria-label={`${t.title} 마감일`}
                onChange={e => actions.setTask(t.id, { due_date: e.target.value || null })}
                className="rounded border border-gray-200 px-1 py-0.5 text-xs"
              />
              {t.due_date && t.status !== 'done' && (
                <span className={`text-xs ${daysUntil(t.due_date) < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {dDayLabel(daysUntil(t.due_date))}
                </span>
              )}
              <button type="button" aria-label={`${t.title} 삭제`}
                onClick={() => actions.removeTask(t.id)}
                className="text-xs text-gray-300 hover:text-red-500">✕</button>
            </li>
          ))}
        </ul>

        {adding ? (
          <div className="mt-2 rounded border border-gray-200 p-2">
            <div className="grid grid-cols-2 gap-1">
              {TASK_PRESETS.map(p => (
                <label key={p.type} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={picked.includes(p.type)}
                    onChange={() => setPicked(ps => ps.includes(p.type) ? ps.filter(x => x !== p.type) : [...ps, p.type])} />
                  {p.label}
                </label>
              ))}
            </div>
            <input
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              placeholder="직접 입력 (선택)"
              className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={submitTasks}
                className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white">선택한 업무 추가</button>
              <button type="button" onClick={() => setAdding(false)} className="text-sm text-gray-500">취소</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            className="mt-2 rounded border border-dashed border-gray-300 px-3 py-1 text-sm text-gray-500 hover:border-gray-400">
            업무 추가
          </button>
        )}
      </Section>

      <Section title="최근 변경">
        <ul className="space-y-1 text-xs text-gray-500">
          {activity.map(a => (
            <li key={a.id}>
              {new Date(a.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {' · '}{a.table_name === 'work_tasks' ? '업무' : '작품'} {a.action === 'insert' ? '추가' : a.action === 'delete' ? '삭제' : '변경'}
            </li>
          ))}
          {!activity.length && <li className="text-gray-300">기록 없음</li>}
        </ul>
      </Section>

      <div className="mt-auto px-4 py-3">
        <button
          type="button"
          onClick={() => { if (window.confirm('이 작품을 권에서 제거할까요? (이력에 남습니다)')) { actions.removeWork(vw.id); onClose() } }}
          className="text-xs text-red-400 underline hover:text-red-600"
        >
          권에서 제거
        </button>
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/board/VolumeWorkList.jsx src/board/WorkDetailPanel.jsx src/tests/VolumeWorkList.test.jsx src/tests/WorkDetailPanel.test.jsx
git commit -m "feat: 수록 목록(배지·진행률·필터)과 작품 상세 패널(업무 체크리스트)"
```

---

### Task 10: VolumeBoardPage 조립 + 라우팅 완성

**Files:**
- Create: `src/board/VolumeBoardPage.jsx`
- Modify: `src/App.jsx` — `/volumes/:id`를 VolumeBoardPage로 교체
- Test: `src/tests/VolumeBoardPage.test.jsx`

**Interfaces:**
- Consumes: `useVolumeBoard`(Task 6), `useWorksData`(Task 3), `SearchPane`(Task 8), `VolumeWorkList`/`WorkDetailPanel`(Task 9), `listRegistry`/`listAllVolumeWorks`(Task 5), `buildRegistryMap`/`workKeyOf`(Task 2), `PRODUCTION_LABELS` 아님 — volume.status는 volumes 테이블의 한국어 값 그대로
- Produces: `/volumes/:id` 화면. 좌 SearchPane, 우 VolumeWorkList, 선택 시 WorkDetailPanel. 권 헤더(번호·주제명·상태 select: 기획/선정중/확정/제작중/완료). 중복 데이터(registry+전체 수록)는 이 페이지가 로드해 자식에 내려준다.

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/VolumeBoardPage.test.jsx`

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'

vi.mock('../works/useWorksData.js', () => ({
  useWorksData: () => ({
    works: [{ '작품명': '소나기', '지은이': '황순원', _authorBase: '황순원', '장르': '소설', '교육과정': '7차', _titleChosung: 'ㅅㄴㄱ', _authorChosung: 'ㅎㅅㅇ' }],
    loading: false, error: null, retry: () => {},
  }),
}))
vi.mock('../board/volumeApi.js', () => ({
  getBoard: vi.fn().mockResolvedValue({
    volume: { id: 'v1', number: 3, title: '성장', status: '선정중' },
    works: [], tasks: [],
  }),
  listMembers: vi.fn().mockResolvedValue([]),
  listRegistry: vi.fn().mockResolvedValue([]),
  listAllVolumeWorks: vi.fn().mockResolvedValue([]),
  subscribeBoard: vi.fn(() => () => {}),
  updateVolume: vi.fn(),
  addWorkToVolume: vi.fn(), updateVolumeWork: vi.fn(), deleteVolumeWork: vi.fn(),
  applySortSwap: vi.fn(), addTasks: vi.fn(), updateTask: vi.fn(), deleteTask: vi.fn(),
  listActivityFor: vi.fn().mockResolvedValue([]),
}))
const { default: VolumeBoardPage } = await import('../board/VolumeBoardPage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

test('권 헤더·검색 패널·수록 목록이 함께 렌더링된다', async () => {
  window.location.hash = '#/volumes/v1'
  render(
    <ToastProvider>
      <HashRouter>
        <Routes><Route path="/volumes/:id" element={<VolumeBoardPage />} /></Routes>
      </HashRouter>
    </ToastProvider>,
  )
  await waitFor(() => expect(screen.getByText(/3권/)).toBeInTheDocument())
  expect(screen.getByText('성장')).toBeInTheDocument()
  expect(screen.getByPlaceholderText(/작품명·작가/)).toBeInTheDocument()
  expect(screen.getByText('표시할 작품이 없습니다')).toBeInTheDocument()
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/tests/VolumeBoardPage.test.jsx`
Expected: FAIL

- [ ] **Step 3: 구현** — `src/board/VolumeBoardPage.jsx`

```jsx
// 권 보드 화면 조립: 좌 검색, 우 수록 목록, 우측 끝 상세 패널
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useWorksData } from '../works/useWorksData.js'
import { buildRegistryMap, workKeyOf, keyOf } from '../works/workKey.js'
import { useVolumeBoard } from './useVolumeBoard.js'
import * as api from './volumeApi.js'
import SearchPane from './SearchPane.jsx'
import VolumeWorkList from './VolumeWorkList.jsx'
import WorkDetailPanel from './WorkDetailPanel.jsx'
import { useToast } from '../components/Toast.jsx'

const VOLUME_STATUSES = ['기획', '선정중', '확정', '제작중', '완료']

export default function VolumeBoardPage() {
  const { id: volumeId } = useParams()
  const { works: sheetWorks, loading: sheetLoading, error: sheetError, retry } = useWorksData()
  const board = useVolumeBoard(volumeId)
  const { show } = useToast()

  const [registry, setRegistry] = useState([])
  const [allVw, setAllVw] = useState([])
  const [selectedId, setSelectedId] = useState(null)

  const loadDupData = useCallback(() => {
    api.listRegistry().then(setRegistry).catch(() => {})
    api.listAllVolumeWorks().then(setAllVw).catch(() => {})
  }, [])
  useEffect(loadDupData, [loadDupData, board.works])

  const registryMap = useMemo(() => buildRegistryMap(registry), [registry])

  // work_id → 수록처 목록, 그리고 시트 키 → 수록처 목록 (registry 경유)
  const duplicatesByWorkId = useMemo(() => {
    const map = new Map()
    for (const vw of allVw) {
      if (!map.has(vw.work_id)) map.set(vw.work_id, [])
      map.get(vw.work_id).push({ volumeNumber: vw.volumes?.number, volumeId: vw.volume_id, selection_status: vw.selection_status })
    }
    return map
  }, [allVw])

  const duplicatesByKey = useMemo(() => {
    const map = new Map()
    for (const row of registry) {
      const dups = duplicatesByWorkId.get(row.work_id)
      if (!dups) continue
      map.set(keyOf(row.title, row.author_base), dups)
      for (const a of row.aliases || []) map.set(keyOf(a.title, a.author_base), dups)
    }
    return map
  }, [registry, duplicatesByWorkId])

  async function handleAdd(work, curricula) {
    const row = await board.actions.addWork(work, curricula, registryMap)
    if (row) setSelectedId(row.id)
  }

  async function handleVolumeStatus(status) {
    try {
      await api.updateVolume(volumeId, { status })
      board.actions.reload()
    } catch (err) {
      show(err.message)
    }
  }

  if (board.loading) return <p className="text-gray-500">불러오는 중…</p>
  if (board.error) return <p className="text-red-600">권을 불러올 수 없습니다: {board.error}</p>

  const selectedVw = board.works.find(w => w.id === selectedId) || null
  const selectedDups = selectedVw
    ? (duplicatesByWorkId.get(selectedVw.work_id) || []).filter(d => d.volumeId !== volumeId)
    : []

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-3 flex items-center gap-3">
        <Link to="/volumes" className="text-sm text-gray-400 hover:text-gray-700">← 권 목록</Link>
        <h2 className="text-lg font-bold">{board.volume.number}권</h2>
        <span>{board.volume.title}</span>
        <select
          value={board.volume.status}
          onChange={e => handleVolumeStatus(e.target.value)}
          aria-label="권 상태"
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {VOLUME_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="ml-auto text-sm text-gray-400">
          수록 {board.works.length}건 · 확정 {board.works.filter(w => w.selection_status === 'confirmed').length}건
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="w-96 shrink-0 rounded border border-gray-200 p-3">
          {sheetLoading ? (
            <p className="text-sm text-gray-400">작품 데이터 불러오는 중…</p>
          ) : sheetError ? (
            <div className="text-sm">
              <p className="mb-2 text-red-600">{sheetError}</p>
              <button type="button" onClick={retry} className="rounded border px-3 py-1">다시 시도</button>
            </div>
          ) : (
            <SearchPane works={sheetWorks} duplicatesByKey={duplicatesByKey} onAdd={handleAdd} />
          )}
        </div>

        <div className="min-w-0 flex-1 rounded border border-gray-200 p-3">
          <VolumeWorkList
            works={board.works}
            tasksByVw={board.tasksByVw}
            members={board.members}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={board.actions.move}
          />
        </div>

        {selectedVw && (
          <WorkDetailPanel
            volumeWork={selectedVw}
            tasks={board.tasksByVw[selectedVw.id] || []}
            members={board.members}
            duplicates={selectedDups}
            actions={board.actions}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}
```

`src/App.jsx` 수정 — import 추가 후 임시 라우트를 교체:

```jsx
import VolumeBoardPage from './board/VolumeBoardPage.jsx'
// ...
            <Route path="/volumes/:id" element={<VolumeBoardPage />} />
```

- [ ] **Step 4: 통과 확인 + 빌드**

Run: `npm test && npm run build`
Expected: 전부 PASS, 빌드 성공

- [ ] **Step 5: Commit**

```bash
git add src/board/VolumeBoardPage.jsx src/tests/VolumeBoardPage.test.jsx src/App.jsx
git commit -m "feat: 권 보드 페이지 조립 — 검색·수록 목록·상세 패널·중복 데이터 배선"
```

---

### Task 11: 사용자 세팅 + 실사동 검증 + 배포

**Files:** 없음 (검증·배포만)

- [ ] **Step 1: [사용자 작업]** `docs/setup-phase2.md` 수행 — ①`supabase/phase2.sql`을 Studio에서 실행 ②literature-db의 `VITE_SHEETS_CSV_URL`을 `.env.local`과 GitHub 시크릿에 추가

- [ ] **Step 2: 로컬 실사동 확인** — `npm run dev` 후 로그인하여:
  - 권 목록에서 새 권 생성 (예: 1권 "다양한 삶의 모습")
  - 검색(초성 포함)·교육과정/갈래 필터 동작
  - 작품 추가 → `후보/미착수`로 목록에 나타남 (완료 기준 1)
  - 같은 작품 재추가 시 "이미 이 권에 있는 작품입니다" 토스트
  - 상세 패널: 선정 상태 `확정` 변경, 메모 저장 (완료 기준 2)
  - 프리셋 다중 선택으로 업무 등록, 담당자·마감 지정 (완료 기준 3·4)
  - 체크박스 완료 → 진행률 즉시 갱신 (완료 기준 7)
  - 전부 완료 → "완료로 변경" 제안 → 원클릭 (완료 기준 8)
  - ▲▼로 순서 조정
  - Supabase Table Editor에서 works_registry에 `W000001` 형식 ID 생성 확인 (완료 기준 1·10)

- [ ] **Step 3: 실시간 확인** — 브라우저 2개(일반+시크릿, 같은 계정 가능)로 같은 권을 열고, 한쪽에서 작품 추가·업무 완료 → 다른 쪽에 수 초 내 반영 (완료 기준 9)

- [ ] **Step 4: 다른 권 수록 뱃지 확인** — 2권을 만들어 같은 작품 추가 → 검색 결과와 상세 패널에 "N권 수록" 표시 (완료 기준 10: work_id 기준)

- [ ] **Step 5: 배포 및 태그**

```bash
git push origin master
git tag phase2-done && git push origin phase2-done
```

배포 후 운영 사이트에서 Step 2의 핵심 흐름(권 생성→작품 추가→업무 완료)을 한 번 재확인.

---

## Self-Review 결과

- **커버리지**: 설계 §10 2단계 항목 — 권 관리(Task 7·10), 검색 이식(Task 1·3·8), works_registry(Task 2·5), 상세 패널(Task 9), work_tasks(Task 5·6·9), Realtime(Task 5·6) — 전부 대응. 완료 기준 1~4·7~10을 Task 11에서 시나리오로 검증.
- **타입 일관성**: `actions.*` 시그니처(Task 6 Produces)와 Task 9·10 사용처 일치 확인. `duplicatesByKey`는 Map, `duplicates`는 배열 — 이름으로 구분. `filterVolumeWorks`의 filters 키(selection/production/assignee/dueSoon/hideCompleted)가 Task 4 정의·Task 9 사용에서 동일.
- **의도적 결정**: Realtime은 이벤트별 병합 대신 디바운스 재조회 — 15명 규모에서 단순함이 정확성보다 이득. `applySortSwap`은 행 2개의 순차 업데이트라 원자적이지 않지만 실패 시 reload로 복구. activity_log 조회는 record_id만으로 필터(uuid 충돌 확률 무시 가능).
- **알려진 한계**: 검색 결과 50건 제한(표시만, 필터로 좁히면 됨), 드래그 정렬 없음(5단계), 활동 문구는 간이형(정식 피드 문구는 3단계 홈에서).
```
