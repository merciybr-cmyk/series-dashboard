# 5단계: 갈래 후보 자동 배치 — 구현 계획서

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 갈래별 후보(genre_picks)를 기획안 기준(교육과정기·첫 수록 시기·콘셉트 태그·작가 중복·분량 균형)으로 권에 자동 배치하는 미리보기·조정·적용·되돌리기 화면을 만든다.

**Architecture:** 배치 계산은 순수 모듈 `autoPlace.js`(그리디 + 이동/맞교환 개선)로 분리하고, 화면용 입력 변환·재평가는 `placementUtils.js`, 적용·되돌리기 절차는 api를 주입받는 `placementActions.js`에 둔다. 새 페이지 `/auto-place`는 이 세 모듈을 조합만 한다. DB는 `phase5.sql` 1회 실행(권 교육과정기, 후보 콘셉트 태그, 적용 묶음 테이블).

**Tech Stack:** React 19 + Vite 8 + Tailwind 4, Supabase(supabase-js 2), vitest 4 + Testing Library, xlsx-js-style.

**Spec:** `docs/superpowers/specs/2026-09-28-auto-placement-design.md` — 구현자는 반드시 함께 읽을 것.

## Global Constraints

- 저장소 루트: `D:\교과서 문학 단행본 시리즈\series-dashboard` (이하 모든 경로는 이 기준). 테스트는 루트에서 `npx vitest run` — `src`에서 실행하면 전부 실패한다.
- 작업 브랜치: `phase5` (master에서 분기). 완료 후 master 병합, 태그 `phase5-done`.
- 커밋 메시지 끝에 반드시 트레일러: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- UI 문구는 한국어, 기존 화면의 Tailwind 관례(회색 테두리 카드, `text-sm`, 파랑 주 버튼)를 따른다.
- 가중치(스펙 §2.3, 확정): `base 10, debut +3, concept +4, authorDup −15, balanceBand 3, balancePenalty −10`, 한 권 같은 작가 최대 2편.
- 부 배정: 현대시·고전운문 → 1부('시'), 현대소설 → 2부('소설'), 현대수필·극 → 3부('수필·극'), 고전산문 → 부 미배정(null).
- 적용·되돌리기는 **전원** 가능(권한 분기 없음).
- phase5.sql 미실행 환경에서도 기존 화면이 깨지면 안 된다: 새 컬럼은 행에 그 키가 있을 때만 읽고/쓴다(`'curricula' in volume`, `'concept_volume_ids' in pick`).
- 기존 테스트 135건은 계속 통과해야 한다.

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `src/tests/fixtures/modernPoetry132.json` (신규) | 현대시 132편: 작품명·작가·수록 교육과정·콘셉트 태그 권 번호. 품질 테스트와 시드 SQL의 단일 원천 |
| `src/board/autoPlace.js` (신규) | 배치 계산 순수 모듈 |
| `src/board/constants.js` (수정) | `CURRICULUM_OPTIONS` 추가 |
| `src/board/placementUtils.js` (신규) | 화면 입력 변환, 조정 후 재평가, 되돌리기 판정, 라벨 상수 |
| `supabase/phase5.sql` (신규) | 스키마 + 1~8권 교육과정기 + 시드 |
| `scripts/gen-phase5-seed.mjs` (신규) | 픽스처 → phase5.sql 시드 블록 생성 |
| `docs/setup-phase5.md` (신규) | 사용자용 SQL 실행 안내 |
| `src/board/volumeApi.js` (수정) | 자동 배치용 API 추가, `createPart`에 title 인자 |
| `src/board/VolumesPage.jsx` (수정) | 권 수정 폼에 교육과정기, '자동 배치' 버튼 |
| `src/board/ConceptTags.jsx` (신규) | '어울리는 권' 칩 + 편집 팝오버 |
| `src/board/GenrePicksPage.jsx` (수정) | 후보 행에 ConceptTags |
| `src/board/exportPicks.js` (수정) | `today()` export |
| `src/board/exportPlacement.js` (신규) | 배치안 엑셀 |
| `src/board/placementActions.js` (신규) | 적용·되돌리기 절차, 요약 문구 |
| `src/board/AutoPlacePage.jsx` (신규) | 자동 배치 페이지 |
| `src/App.jsx` (수정) | `/auto-place` 라우트 |

---

### Task 0: 브랜치 만들기

- [ ] **Step 1:** 

```bash
cd "D:/교과서 문학 단행본 시리즈/series-dashboard"
git checkout master && git pull --ff-only 2>/dev/null; git checkout -b phase5
```

(원격 pull이 실패해도 무시 — 로컬 master가 최신이다.)

---

### Task 1: 픽스처와 배치 계산 모듈 `autoPlace.js`

**Files:**
- Create: `src/tests/fixtures/modernPoetry132.json` (복사)
- Create: `src/board/autoPlace.js`
- Test: `src/tests/autoPlace.test.js`

**Interfaces:**
- Consumes: `sortCurricula(list)` from `src/works/workKey.js`
- Produces:
  - `WEIGHTS`, `AUTHOR_LIMIT` (=2)
  - `firstCurriculum(curricula: string[]) → string|null`
  - `isEligible(work, volume) → boolean` — `work.curricula`와 `volume.curricula` 교집합 여부
  - `reasonsFor(work, volume) → ('debut'|'concept'|'balance')[]`
  - `autoPlace({ works, volumes, existing, bucket }) → { placements: [{ workId, volumeId, reasons, warnings: ('authorDup')[] }], unplaceable: [{ workId, reason: 'noEligibleVolume'|'authorLimit' }] }`
    - `works`: `[{ workId, title, author, curricula, conceptVolumeIds }]`
    - `volumes`: `[{ id, number, curricula }]`
    - `existing`: `[{ volumeId, workId, author, bucket, selection_status }]`

- [ ] **Step 1: 픽스처 복사**

```bash
mkdir -p src/tests/fixtures
cp "C:/Users/merci/AppData/Local/Temp/claude/D----------------/a7857b88-8ca7-40f2-89dd-57055b2b9347/scratchpad/modernPoetry132.json" src/tests/fixtures/modernPoetry132.json
node -e "const f=require('./src/tests/fixtures/modernPoetry132.json');console.log(f.length, f[0])"
```

Expected: `132 { title: '절정', author: '이육사', curricula: [ '5차', '6차', '7차', '2007개정', '2009개정', '2015개정' ], conceptVolumes: [ 3 ] }`

- [ ] **Step 2: 실패하는 테스트 작성** — `src/tests/autoPlace.test.js`

```js
import fixture from './fixtures/modernPoetry132.json'
import { autoPlace, firstCurriculum, isEligible, reasonsFor, AUTHOR_LIMIT } from '../board/autoPlace.js'

const PLAN = { 1: ['1차', '2차', '3차'], 2: ['4차'], 3: ['5차'], 4: ['6차'], 5: ['7차'], 6: ['2007개정', '2009개정'], 7: ['2015개정'], 8: ['2022개정'] }
const VOLUMES = Object.entries(PLAN).map(([n, c]) => ({ id: `v${n}`, number: Number(n), curricula: c }))
const V = n => VOLUMES[n - 1]
const W = (workId, title, author, curricula, conceptVolumeIds = []) => ({ workId, title, author, curricula, conceptVolumeIds })

test('firstCurriculum: 차수 → 개정 순으로 가장 이른 값', () => {
  expect(firstCurriculum(['2015개정', '7차', '4차'])).toBe('4차')
  expect(firstCurriculum([])).toBeNull()
})

test('isEligible / reasonsFor', () => {
  const w = W('W1', '서시', '윤동주', ['4차', '2015개정'], ['v7'])
  expect(isEligible(w, V(2))).toBe(true)
  expect(isEligible(w, V(3))).toBe(false)
  expect(reasonsFor(w, V(2))).toEqual(['debut'])
  expect(reasonsFor(w, V(7))).toEqual(['concept'])
  expect(reasonsFor(W('W2', 'x', 'y', ['2015개정', '2022개정']), V(8))).toEqual(['balance'])
})

test('수록 이력 있는 권에만 배치하고, 없으면 noEligibleVolume', () => {
  const works = [W('W1', '서시', '윤동주', ['4차']), W('W2', '낯선 시', '작가', ['1995개정'])]
  const { placements, unplaceable } = autoPlace({ works, volumes: VOLUMES, existing: [], bucket: '현대시' })
  expect(placements).toEqual([{ workId: 'W1', volumeId: 'v2', reasons: ['debut'], warnings: [] }])
  expect(unplaceable).toEqual([{ workId: 'W2', reason: 'noEligibleVolume' }])
})

test('첫 수록 시기 권을 우선하고, 콘셉트 태그가 있으면 그 권을 우선한다', () => {
  const a = W('W1', '진달래꽃', '김소월', ['1차', '4차', '2022개정'])
  const b = W('W2', '산유화', '김소월2', ['1차', '4차', '2022개정'], ['v8'])
  const { placements } = autoPlace({ works: [a, b], volumes: VOLUMES, existing: [], bucket: '현대시' })
  const at = id => placements.find(p => p.workId === id).volumeId
  expect(at('W1')).toBe('v1') // debut +3
  expect(at('W2')).toBe('v8') // concept +4 > debut +3
})

test('같은 권 같은 작가는 피하고, 불가피하면 2편까지만 (authorDup 경고)', () => {
  const works = [
    W('W1', '가', '백석', ['6차']),
    W('W2', '나', '백석', ['6차']),
    W('W3', '다', '백석', ['6차']),
  ]
  const { placements, unplaceable } = autoPlace({ works, volumes: VOLUMES, existing: [], bucket: '현대시' })
  expect(placements).toHaveLength(2)
  expect(placements.every(p => p.volumeId === 'v4' && p.warnings.includes('authorDup'))).toBe(true)
  expect(unplaceable).toEqual([expect.objectContaining({ reason: 'authorLimit' })])
  expect(AUTHOR_LIMIT).toBe(2)
})

test('기존 배치의 작가(다른 갈래 포함)를 중복 계산에 넣는다', () => {
  const existing = [{ volumeId: 'v2', workId: 'X1', author: '윤동주', bucket: '현대수필·극', selection_status: 'candidate' }]
  const w = W('W1', '서시', '윤동주', ['4차', '5차'])
  const { placements } = autoPlace({ works: [w], volumes: VOLUMES, existing, bucket: '현대시' })
  expect(placements[0].volumeId).toBe('v3') // 2권에는 윤동주가 이미 있다
})

test("'제외'된 권에는 다시 제안하지 않고, 제외 행은 작가·편수 계산에서 뺀다", () => {
  const existing = [{ volumeId: 'v2', workId: 'W1', author: '윤동주', bucket: '현대시', selection_status: 'excluded' }]
  const w = W('W1', '서시', '윤동주', ['4차', '5차'])
  const { placements } = autoPlace({ works: [w], volumes: VOLUMES, existing, bucket: '현대시' })
  expect(placements[0].volumeId).toBe('v3')
})

test('편수가 평균±3을 벗어나지 않게 퍼뜨린다', () => {
  // 10편 모두 1권·2권 겸용, 1권이 첫 수록 — 균형 감점 없으면 전부 1권
  const works = Array.from({ length: 10 }, (_, i) => W(`W${i}`, `작품${i}`, `작가${i}`, ['1차', '4차']))
  const two = [V(1), V(2)]
  const { placements } = autoPlace({ works, volumes: two, existing: [], bucket: '현대시' })
  const n1 = placements.filter(p => p.volumeId === 'v1').length
  expect(n1).toBeLessThanOrEqual(5 + 3)
  expect(n1).toBeGreaterThanOrEqual(5)
})

test('같은 입력이면 같은 결과', () => {
  const works = fixture.map((f, i) => W(`W${i}`, f.title, f.author, f.curricula, f.conceptVolumes.map(n => `v${n}`)))
  const a = autoPlace({ works, volumes: VOLUMES, existing: [], bucket: '현대시' })
  const b = autoPlace({ works, volumes: VOLUMES, existing: [], bucket: '현대시' })
  expect(b).toEqual(a)
})

test('품질 기준: 현대시 132편 (스펙 §2.5)', () => {
  const works = fixture.map((f, i) => W(`W${i}`, f.title, f.author, f.curricula, f.conceptVolumes.map(n => `v${n}`)))
  const { placements, unplaceable } = autoPlace({ works, volumes: VOLUMES, existing: [], bucket: '현대시' })
  const byId = new Map(works.map(w => [w.workId, w]))
  expect(unplaceable).toEqual([])
  expect(placements).toHaveLength(132)
  expect(placements.filter(p => !isEligible(byId.get(p.workId), VOLUMES.find(v => v.id === p.volumeId)))).toEqual([])
  const dupPairs = new Set(placements.filter(p => p.warnings.includes('authorDup')).map(p => `${p.volumeId}|${byId.get(p.workId).author}`))
  expect(dupPairs.size).toBeLessThanOrEqual(2)
  expect(placements.filter(p => p.reasons.includes('debut')).length).toBeGreaterThanOrEqual(85)
  expect(placements.filter(p => p.reasons.includes('concept')).length).toBeGreaterThanOrEqual(110)
})
```

- [ ] **Step 2b: 실패 확인**

Run: `npx vitest run src/tests/autoPlace.test.js`
Expected: FAIL — `Failed to resolve import "../board/autoPlace.js"`

- [ ] **Step 3: 구현** — `src/board/autoPlace.js`

```js
// 갈래 후보 자동 배치 계산 (설계 2026-09-28 §2) — 화면과 분리된 순수 모듈.
// 규칙: 수록 교육과정이 겹치는 권에만 배치, 첫 수록 시기·콘셉트 태그 가점,
// 같은 권 같은 작가 감점(최대 2편), 권별 편수가 평균±3을 벗어나면 감점.
import { sortCurricula } from '../works/workKey.js'

// 2026-09-28 132편 시제품 검증으로 확정 (스펙 §2.3 가중치 조정 기록)
export const WEIGHTS = {
  base: 10,
  debut: 3,
  concept: 4,
  authorDup: -15,      // 같은 권에 같은 작가 2편째
  balanceBand: 3,      // 평균 ± 이 값까지는 감점 없음
  balancePenalty: -10, // 범위를 벗어난 1편당
}
export const AUTHOR_LIMIT = 2
const MAX_PASSES = 50
const EPS = 1e-9

export function firstCurriculum(curricula) {
  return sortCurricula(curricula || [])[0] ?? null
}

// 작품이 그 권의 교육과정기에 수록된 이력이 있는가
export function isEligible(work, volume) {
  const set = new Set(volume.curricula || [])
  return (work.curricula || []).some(c => set.has(c))
}

// 배치 근거: 'debut'(첫 수록 시기) / 'concept'(콘셉트 태그) / 둘 다 아니면 'balance'
export function reasonsFor(work, volume) {
  const r = []
  const first = firstCurriculum(work.curricula)
  if (first && (volume.curricula || []).includes(first)) r.push('debut')
  if ((work.conceptVolumeIds || []).includes(volume.id)) r.push('concept')
  return r.length ? r : ['balance']
}

function staticScore(work, volume) {
  const r = reasonsFor(work, volume)
  return WEIGHTS.base
    + (r.includes('debut') ? WEIGHTS.debut : 0)
    + (r.includes('concept') ? WEIGHTS.concept : 0)
}

const authorKey = (volumeId, author) => `${volumeId}|${author}`

// works: [{ workId, title, author, curricula, conceptVolumeIds }]  — 배치 대상(미배치 후보)
// volumes: [{ id, number, curricula }]                              — curricula 빈 권은 호출 전에 제외
// existing: [{ volumeId, workId, author, bucket, selection_status }] — 이미 배치된 행(모든 갈래)
// → { placements: [{ workId, volumeId, reasons, warnings }], unplaceable: [{ workId, reason }] }
export function autoPlace({ works, volumes, existing = [], bucket }) {
  const volumeById = new Map(volumes.map(v => [v.id, v]))
  const excludedPairs = new Set(
    existing.filter(e => e.selection_status === 'excluded').map(e => `${e.volumeId}|${e.workId}`),
  )
  const active = existing.filter(e => e.selection_status !== 'excluded' && volumeById.has(e.volumeId))

  // 상태: 권별 같은 갈래 편수, (권·작가)별 편수(모든 갈래)
  const size = new Map(volumes.map(v => [v.id, 0]))
  const authors = new Map()
  const countAuthor = (vid, a) => authors.get(authorKey(vid, a)) || 0
  const addAuthor = (vid, a, d) => authors.set(authorKey(vid, a), countAuthor(vid, a) + d)
  for (const e of active) {
    if (e.bucket === bucket) size.set(e.volumeId, size.get(e.volumeId) + 1)
    addAuthor(e.volumeId, e.author, 1)
  }
  const existingInBucket = [...size.values()].reduce((a, b) => a + b, 0)
  const avg = volumes.length ? (existingInBucket + works.length) / volumes.length : 0
  const lo = avg - WEIGHTS.balanceBand
  const hi = avg + WEIGHTS.balanceBand
  const outside = n => Math.max(0, lo - n) + Math.max(0, n - hi)
  const dupTerm = n => Math.max(0, n - 1)

  const options = new Map() // workId → 후보 권 id (권 번호순)
  for (const w of works) {
    options.set(w.workId, volumes
      .filter(v => isEligible(w, v) && !excludedPairs.has(`${v.id}|${w.workId}`))
      .sort((a, b) => a.number - b.number)
      .map(v => v.id))
  }

  const assign = new Map() // workId → volumeId
  const workById = new Map(works.map(w => [w.workId, w]))

  // w를 from(null이면 새로 배치)에서 to로 옮길 때의 점수 변화
  function moveDelta(w, from, to) {
    let d = staticScore(w, volumeById.get(to)) - (from ? staticScore(w, volumeById.get(from)) : 0)
    const nt = countAuthor(to, w.author)
    d += WEIGHTS.authorDup * (dupTerm(nt + 1) - dupTerm(nt))
    d += WEIGHTS.balancePenalty * (outside(size.get(to) + 1) - outside(size.get(to)))
    if (from) {
      const nf = countAuthor(from, w.author)
      d += WEIGHTS.authorDup * (dupTerm(nf - 1) - dupTerm(nf))
      d += WEIGHTS.balancePenalty * (outside(size.get(from) - 1) - outside(size.get(from)))
    }
    return d
  }
  function apply(w, from, to) {
    if (from) { size.set(from, size.get(from) - 1); addAuthor(from, w.author, -1) }
    size.set(to, size.get(to) + 1)
    addAuthor(to, w.author, 1)
    assign.set(w.workId, to)
  }
  const hasRoom = (vid, author) => countAuthor(vid, author) < AUTHOR_LIMIT

  // 1) 그리디: 후보 권이 적은 작품부터
  const unplaceable = []
  const order = [...works].sort((a, b) =>
    options.get(a.workId).length - options.get(b.workId).length || a.title.localeCompare(b.title, 'ko'))
  for (const w of order) {
    const opts = options.get(w.workId)
    if (!opts.length) { unplaceable.push({ workId: w.workId, reason: 'noEligibleVolume' }); continue }
    let best = null
    let bestD = -Infinity
    for (const vid of opts) {
      if (!hasRoom(vid, w.author)) continue
      const d = moveDelta(w, null, vid)
      if (d > bestD + EPS) { best = vid; bestD = d }
    }
    if (!best) { unplaceable.push({ workId: w.workId, reason: 'authorLimit' }); continue }
    apply(w, null, best)
  }

  // 2) 개선: 이동 → 맞교환을 점수가 오르는 동안 반복
  const placed = order.filter(w => assign.has(w.workId))
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false
    for (const w of placed) {
      for (const to of options.get(w.workId)) {
        const cur = assign.get(w.workId)
        if (to === cur || !hasRoom(to, w.author)) continue
        if (moveDelta(w, cur, to) > EPS) { apply(w, cur, to); improved = true }
      }
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]
        const b = placed[j]
        const va = assign.get(a.workId)
        const vb = assign.get(b.workId)
        if (va === vb) continue
        if (!options.get(a.workId).includes(vb) || !options.get(b.workId).includes(va)) continue
        const d1 = moveDelta(a, va, vb)
        apply(a, va, vb)
        const d2 = moveDelta(b, vb, va)
        apply(b, vb, va)
        const ok = countAuthor(vb, a.author) <= AUTHOR_LIMIT && countAuthor(va, b.author) <= AUTHOR_LIMIT
        if (ok && d1 + d2 > EPS) { improved = true; continue }
        apply(b, va, vb) // 되돌림
        apply(a, vb, va)
      }
    }
    if (!improved) break
  }

  const placements = [...assign.entries()].map(([workId, volumeId]) => {
    const w = workById.get(workId)
    return {
      workId,
      volumeId,
      reasons: reasonsFor(w, volumeById.get(volumeId)),
      warnings: countAuthor(volumeId, w.author) >= 2 ? ['authorDup'] : [],
    }
  })
  return { placements, unplaceable }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/tests/autoPlace.test.js`
Expected: PASS 9건. (시제품 기준 132편: debut 85, concept 113, 중복 2곳, 실행 < 200ms)

- [ ] **Step 5: 커밋**

```bash
git add src/tests/fixtures/modernPoetry132.json src/board/autoPlace.js src/tests/autoPlace.test.js
git commit -m "feat: 갈래 후보 자동 배치 계산 모듈 (autoPlace)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 화면용 도우미 `placementUtils.js`

**Files:**
- Modify: `src/board/constants.js` (끝에 추가)
- Create: `src/board/placementUtils.js`
- Test: `src/tests/placementUtils.test.js`

**Interfaces:**
- Consumes: Task 1의 `AUTHOR_LIMIT, firstCurriculum, isEligible, reasonsFor`; `bucketOf` (genreUtils), `keyOf, workKeyOf, sortCurricula, curriculumRank` (workKey)
- Produces:
  - `CURRICULUM_OPTIONS: string[]` (constants.js)
  - `PART_BY_BUCKET`, `PART_TITLE`, `REASON_LABELS`, `UNPLACEABLE_LABELS`
  - `curriculaIndex(sheetWorks) → Map<key, Set<string>>`
  - `curriculaForPick(pick, registryRow, index) → { curricula: string[], fromSheet: boolean }`
  - `buildPlacementInput({ picks, volumes, allVw, registry, sheetWorks, bucket }) → { works, volumes, skippedVolumes, existing, sheetFallbackCount }`
    - `works[i] = { workId, title, author, curricula, conceptVolumeIds, snapshot }`
    - `existing[i] = { id, volumeId, workId, title, author, bucket, selection_status }`
  - `evaluateAssignment({ works, volumes, existing, bucket, assignment: Map<workId, volumeId|null> }) → { columns: [{ volume, existing, proposed: [{ work, reasons, warnings }], total }], held: work[] }`
    - `warnings` ⊆ `'ineligible' | 'authorDup' | 'authorOver'`
  - `splitUndoable(rows, { tasks, comments, files }) → { removable: row[], kept: [{ row, reason: 'status'|'tasks'|'comments'|'files' }] }`

- [ ] **Step 1: constants.js 끝에 추가**

```js

// 작품 DB 시트의 교육과정 표기 (권의 교육과정기 선택지 — 5단계 자동 배치)
export const CURRICULUM_OPTIONS = ['1차', '2차', '3차', '4차', '5차', '6차', '7차', '2007개정', '2009개정', '2015개정', '2022개정']
```

- [ ] **Step 2: 실패하는 테스트** — `src/tests/placementUtils.test.js`

```js
import {
  PART_BY_BUCKET, curriculaIndex, curriculaForPick, buildPlacementInput, evaluateAssignment, splitUndoable,
} from '../board/placementUtils.js'
import { keyOf } from '../works/workKey.js'

const SHEET = [
  { '작품명': '서시', '지은이': '윤동주', _authorBase: '윤동주', '장르': '시', '교육과정': '4차' },
  { '작품명': '서시', '지은이': '윤동주', _authorBase: '윤동주', '장르': '시', '교육과정': '2015개정' },
]
const REGISTRY = [
  { work_id: 'W1', title: '서시', author_base: '윤동주', aliases: [] },
  { work_id: 'W2', title: '풀', author_base: '김수영', aliases: [] },
]
const VOLS = [
  { id: 'v2', number: 2, title: '정전', curricula: ['4차'] },
  { id: 'v7', number: 7, title: '온도', curricula: ['2015개정'] },
  { id: 'v9', number: 9, title: '미정', curricula: [] },
]
const pick = (id, workId, title, author, genre, curriculum, concept = []) =>
  ({ id, work_id: workId, work_snapshot: { title, author, genre, curriculum }, concept_volume_ids: concept })

test('PART_BY_BUCKET: 고전산문은 부 미배정', () => {
  expect(PART_BY_BUCKET['현대시']).toBe(1)
  expect(PART_BY_BUCKET['고전운문']).toBe(1)
  expect(PART_BY_BUCKET['현대소설']).toBe(2)
  expect(PART_BY_BUCKET['현대수필·극']).toBe(3)
  expect(PART_BY_BUCKET['고전산문']).toBeNull()
})

test('curriculaForPick: 시트 우선, 없으면 snapshot', () => {
  const index = curriculaIndex(SHEET)
  expect(index.get(keyOf('서시', '윤동주'))).toEqual(new Set(['4차', '2015개정']))
  expect(curriculaForPick(pick('p1', 'W1', '서시', '윤동주', '시', ['7차']), REGISTRY[0], index))
    .toEqual({ curricula: ['4차', '2015개정'], fromSheet: true })
  expect(curriculaForPick(pick('p2', 'W2', '풀', '김수영', '시', ['2015개정', '5차']), REGISTRY[1], index))
    .toEqual({ curricula: ['5차', '2015개정'], fromSheet: false })
})

test('buildPlacementInput: 갈래·미배치만 대상, 교육과정 빈 권 분리', () => {
  const picks = [
    pick('p1', 'W1', '서시', '윤동주', '시', ['4차'], ['v7']),
    pick('p2', 'W2', '풀', '김수영', '시', ['2015개정']),
    pick('p3', 'W3', '춘향전', '미상', '고전산문', ['4차']),
  ]
  const allVw = [{ id: 'r1', volume_id: 'v7', work_id: 'W2', selection_status: 'candidate', work_snapshot: { title: '풀', author: '김수영', genre: '시' } }]
  const input = buildPlacementInput({ picks, volumes: VOLS, allVw, registry: REGISTRY, sheetWorks: SHEET, bucket: '현대시' })
  expect(input.works.map(w => w.workId)).toEqual(['W1']) // W2는 배치됨, W3은 다른 갈래
  expect(input.works[0]).toMatchObject({ title: '서시', author: '윤동주', curricula: ['4차', '2015개정'], conceptVolumeIds: ['v7'] })
  expect(input.volumes.map(v => v.id)).toEqual(['v2', 'v7'])
  expect(input.skippedVolumes.map(v => v.id)).toEqual(['v9'])
  expect(input.existing[0]).toMatchObject({ volumeId: 'v7', workId: 'W2', author: '김수영', bucket: '현대시' })
  expect(input.sheetFallbackCount).toBe(0)
})

test("buildPlacementInput: '제외'로만 들어간 작품은 미배치로 본다", () => {
  const picks = [pick('p2', 'W2', '풀', '김수영', '시', ['2015개정'])]
  const allVw = [{ id: 'r1', volume_id: 'v7', work_id: 'W2', selection_status: 'excluded', work_snapshot: { title: '풀', author: '김수영', genre: '시' } }]
  const input = buildPlacementInput({ picks, volumes: VOLS, allVw, registry: REGISTRY, sheetWorks: [], bucket: '현대시' })
  expect(input.works.map(w => w.workId)).toEqual(['W2'])
  expect(input.sheetFallbackCount).toBe(1)
})

test('evaluateAssignment: 권별 열, 경고, 보류함', () => {
  const works = [
    { workId: 'W1', title: '서시', author: '윤동주', curricula: ['4차'], conceptVolumeIds: [] },
    { workId: 'W4', title: '자화상', author: '윤동주', curricula: ['4차'], conceptVolumeIds: [] },
    { workId: 'W5', title: '참회록', author: '윤동주', curricula: ['5차'], conceptVolumeIds: [] },
  ]
  const existing = [{ id: 'r1', volumeId: 'v2', workId: 'X', title: '별', author: '윤동주', bucket: '현대수필·극', selection_status: 'candidate' }]
  const assignment = new Map([['W1', 'v2'], ['W4', 'v2'], ['W5', null]])
  const { columns, held } = evaluateAssignment({ works, volumes: VOLS.slice(0, 2), existing, bucket: '현대시', assignment })
  expect(columns.map(c => c.volume.number)).toEqual([2, 7])
  expect(columns[0].existing).toEqual([]) // 다른 갈래 기존 행은 열에 안 보이지만 작가 수에는 들어간다
  expect(columns[0].proposed.map(p => p.work.title)).toEqual(['서시', '자화상'])
  expect(columns[0].proposed[0].warnings).toEqual(['authorOver']) // 기존 1 + 제안 2 = 3편
  expect(columns[0].total).toBe(2)
  expect(held.map(w => w.title)).toEqual(['참회록'])
  // 수록 이력 없는 권으로 옮기면 ineligible
  const moved = evaluateAssignment({ works, volumes: VOLS.slice(0, 2), existing: [], bucket: '현대시', assignment: new Map([['W5', 'v7']]) })
  expect(moved.columns[1].proposed[0]).toMatchObject({ reasons: [], warnings: ['ineligible'] })
})

test('splitUndoable: 상태 변경·업무·의견·자료가 있으면 남긴다', () => {
  const rows = [
    { id: 'a', selection_status: 'candidate' },
    { id: 'b', selection_status: 'confirmed' },
    { id: 'c', selection_status: 'candidate' },
    { id: 'd', selection_status: 'candidate' },
    { id: 'e', selection_status: 'candidate' },
  ]
  const { removable, kept } = splitUndoable(rows, { tasks: ['c'], comments: ['d'], files: ['e'] })
  expect(removable.map(r => r.id)).toEqual(['a'])
  expect(kept.map(k => [k.row.id, k.reason])).toEqual([['b', 'status'], ['c', 'tasks'], ['d', 'comments'], ['e', 'files']])
})
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run src/tests/placementUtils.test.js` → FAIL (모듈 없음)

- [ ] **Step 4: 구현** — `src/board/placementUtils.js`

```js
// 자동 배치 화면용 순수 도우미 (설계 2026-09-28 §1.5·§3)
import { bucketOf } from './genreUtils.js'
import { keyOf, workKeyOf, sortCurricula, curriculumRank } from '../works/workKey.js'
import { AUTHOR_LIMIT, firstCurriculum, isEligible, reasonsFor } from './autoPlace.js'

// 갈래 → 부 번호 (고전산문은 2·3부 어느 쪽도 가능해 미배정 — 2026-09-28 사용자 결정)
export const PART_BY_BUCKET = { '현대시': 1, '고전운문': 1, '현대소설': 2, '현대수필·극': 3, '고전산문': null }
export const PART_TITLE = { 1: '시', 2: '소설', 3: '수필·극' }
export const REASON_LABELS = { debut: '첫 수록', concept: '콘셉트', balance: '균형' }
export const UNPLACEABLE_LABELS = {
  noEligibleVolume: '수록 교육과정에 맞는 권 없음',
  authorLimit: '작가 중복 한도(권당 2편) 초과',
  manual: '직접 뺌',
}

// 시트 행 → 작품 키별 교육과정 집합
export function curriculaIndex(sheetWorks) {
  const map = new Map()
  for (const w of sheetWorks || []) {
    if (!w['교육과정']) continue
    const k = workKeyOf(w)
    if (!map.has(k)) map.set(k, new Set())
    map.get(k).add(w['교육과정'])
  }
  return map
}

// 후보의 수록 교육과정: 시트(registry 키 + 별칭) 우선, 못 찾으면 후보 snapshot
export function curriculaForPick(pick, registryRow, index) {
  const keys = registryRow
    ? [keyOf(registryRow.title, registryRow.author_base), ...(registryRow.aliases || []).map(a => keyOf(a.title, a.author_base))]
    : []
  const set = new Set()
  for (const k of keys) for (const c of index.get(k) || []) set.add(c)
  if (set.size) return { curricula: sortCurricula([...set]), fromSheet: true }
  return { curricula: sortCurricula(pick.work_snapshot?.curriculum || []), fromSheet: false }
}

export function buildPlacementInput({ picks, volumes, allVw, registry, sheetWorks, bucket }) {
  const index = curriculaIndex(sheetWorks)
  const registryById = new Map((registry || []).map(r => [r.work_id, r]))
  const placedIds = new Set(allVw.filter(vw => vw.selection_status !== 'excluded').map(vw => vw.work_id))
  let sheetFallbackCount = 0
  const works = picks
    .filter(p => bucketOf(p.work_snapshot?.genre) === bucket && !placedIds.has(p.work_id))
    .map(p => {
      const { curricula, fromSheet } = curriculaForPick(p, registryById.get(p.work_id), index)
      if (!fromSheet) sheetFallbackCount++
      return {
        workId: p.work_id,
        title: p.work_snapshot?.title || '',
        author: p.work_snapshot?.author || '',
        curricula,
        conceptVolumeIds: p.concept_volume_ids || [],
        snapshot: p.work_snapshot,
      }
    })
  const existing = allVw.map(vw => ({
    id: vw.id,
    volumeId: vw.volume_id,
    workId: vw.work_id,
    title: vw.work_snapshot?.title || '',
    author: vw.work_snapshot?.author || '',
    bucket: bucketOf(vw.work_snapshot?.genre),
    selection_status: vw.selection_status,
  }))
  return {
    works,
    volumes: volumes.filter(v => (v.curricula || []).length > 0),
    skippedVolumes: volumes.filter(v => !(v.curricula || []).length),
    existing,
    sheetFallbackCount,
  }
}

const byCurriculumThenTitle = (a, b) =>
  curriculumRank(firstCurriculum(a.curricula) ?? '') - curriculumRank(firstCurriculum(b.curricula) ?? '')
  || a.title.localeCompare(b.title, 'ko')

// 사람이 조정한 배치(assignment)를 다시 평가한다 — 점수 재최적화는 하지 않는다(스펙 §3.2)
export function evaluateAssignment({ works, volumes, existing, bucket, assignment }) {
  const active = existing.filter(e => e.selection_status !== 'excluded')
  const authorCount = new Map()
  const bump = (vid, a) => authorCount.set(`${vid}|${a}`, (authorCount.get(`${vid}|${a}`) || 0) + 1)
  for (const e of active) bump(e.volumeId, e.author)
  for (const w of works) {
    const vid = assignment.get(w.workId)
    if (vid) bump(vid, w.author)
  }
  const columns = [...volumes].sort((a, b) => a.number - b.number).map(v => {
    const ex = active.filter(e => e.volumeId === v.id && e.bucket === bucket)
    const proposed = works
      .filter(w => assignment.get(w.workId) === v.id)
      .sort(byCurriculumThenTitle)
      .map(w => {
        const eligible = isEligible(w, v)
        const n = authorCount.get(`${v.id}|${w.author}`) || 0
        const warnings = []
        if (!eligible) warnings.push('ineligible')
        if (n > AUTHOR_LIMIT) warnings.push('authorOver')
        else if (n >= 2) warnings.push('authorDup')
        return { work: w, reasons: eligible ? reasonsFor(w, v) : [], warnings }
      })
    return { volume: v, existing: ex, proposed, total: ex.length + proposed.length }
  })
  const held = works.filter(w => !assignment.get(w.workId)).sort(byCurriculumThenTitle)
  return { columns, held }
}

// 되돌리기 판정: 적용 뒤 손댄 행은 남긴다(삭제 시 업무·의견이 cascade로 지워지고 자료는 자료실로 새기 때문)
export function splitUndoable(rows, { tasks = [], comments = [], files = [] }) {
  const t = new Set(tasks)
  const c = new Set(comments)
  const f = new Set(files)
  const removable = []
  const kept = []
  for (const r of rows) {
    if (r.selection_status !== 'candidate') kept.push({ row: r, reason: 'status' })
    else if (t.has(r.id)) kept.push({ row: r, reason: 'tasks' })
    else if (c.has(r.id)) kept.push({ row: r, reason: 'comments' })
    else if (f.has(r.id)) kept.push({ row: r, reason: 'files' })
    else removable.push(r)
  }
  return { removable, kept }
}
```

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run src/tests/placementUtils.test.js` → PASS 6건

- [ ] **Step 6: 커밋**

```bash
git add src/board/constants.js src/board/placementUtils.js src/tests/placementUtils.test.js
git commit -m "feat: 자동 배치 화면용 도우미 (입력 변환·재평가·되돌리기 판정)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `phase5.sql`, 시드 생성기, 실행 안내

**Files:**
- Create: `supabase/phase5.sql`
- Create: `scripts/gen-phase5-seed.mjs`
- Create: `docs/setup-phase5.md`
- Test: `src/tests/phase5Seed.test.js`

**Interfaces:**
- Consumes: `src/tests/fixtures/modernPoetry132.json` (Task 1)
- Produces: DB 컬럼 `volumes.curricula text[]`, `genre_picks.concept_volume_ids uuid[]`, 테이블 `placement_batches(id, genre, item_count, created_part_ids, created_by, created_at, undone_at, undone_by)`, `volume_works.placement_batch_id` — Task 4 이후의 API가 이 이름을 쓴다.

- [ ] **Step 1: 실패하는 테스트** — `src/tests/phase5Seed.test.js`

```js
import fs from 'node:fs'
import path from 'node:path'
import fixture from './fixtures/modernPoetry132.json'

const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/phase5.sql'), 'utf8')

test('phase5.sql 시드가 픽스처 132편과 일치한다 (gen-phase5-seed.mjs로 재생성)', () => {
  const block = sql.match(/-- BEGIN SEED[\s\S]*-- END SEED/)[0]
  const rows = block.match(/^ {2}\('.*', '.*', array\[.*\]::int\[\]\)/gm)
  expect(rows).toHaveLength(fixture.length)
  expect(block).toContain("('절정', '이육사', array[3]::int[])")
})

test('phase5.sql이 스키마와 1~8권 교육과정기를 포함한다', () => {
  expect(sql).toContain('alter table public.volumes add column curricula text[]')
  expect(sql).toContain('alter table public.genre_picks add column concept_volume_ids uuid[]')
  expect(sql).toContain('create table public.placement_batches')
  expect(sql).toContain('add column placement_batch_id uuid references public.placement_batches')
  expect(sql).toContain("set curricula = '{2007개정,2009개정}' where number = 6")
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/tests/phase5Seed.test.js` → FAIL (ENOENT phase5.sql)

- [ ] **Step 3: `supabase/phase5.sql` 작성** (시드 블록은 비워 두고 Step 4에서 생성)

```sql
-- 5단계: 갈래 후보 자동 배치 (설계 docs/superpowers/specs/2026-09-28-auto-placement-design.md)
-- 적용: Supabase Studio SQL Editor에서 1회 실행 (docs/setup-phase5.md).
-- 마지막 결과표의 "미매칭 작품"이 비어 있으면(null) 태그 시드 성공.

-- (1) 권 ↔ 교육과정기 (기획안 시리즈 구성)
alter table public.volumes add column curricula text[] not null default '{}';

update public.volumes set curricula = '{1차,2차,3차}' where number = 1;
update public.volumes set curricula = '{4차}' where number = 2;
update public.volumes set curricula = '{5차}' where number = 3;
update public.volumes set curricula = '{6차}' where number = 4;
update public.volumes set curricula = '{7차}' where number = 5;
update public.volumes set curricula = '{2007개정,2009개정}' where number = 6;
update public.volumes set curricula = '{2015개정}' where number = 7;
update public.volumes set curricula = '{2022개정}' where number = 8;

-- (2) 후보 콘셉트 태그 ("어울리는 권")
alter table public.genre_picks add column concept_volume_ids uuid[] not null default '{}';

-- (3) 자동 배치 적용 묶음 (일괄 되돌리기용)
create table public.placement_batches (
  id uuid primary key default gen_random_uuid(),
  genre text not null,
  item_count int not null default 0,
  created_part_ids uuid[] not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid
);

alter table public.placement_batches enable row level security;
create policy placement_batches_member_all on public.placement_batches
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- created_by 자동 기록 (phase2.sql 함수 재사용)
create trigger placement_batches_created_by before insert on public.placement_batches
  for each row execute function public.set_registry_created_by();

-- 되돌린 사람 자동 기록
create function public.set_batch_undone_by()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.undone_at is not null and old.undone_at is null then
    new.undone_by := public.current_member_id();
  end if;
  return new;
end;
$$;

create trigger placement_batches_undone_by before update on public.placement_batches
  for each row execute function public.set_batch_undone_by();

-- (4) 자동 배치로 들어간 행 표시
alter table public.volume_works
  add column placement_batch_id uuid references public.placement_batches (id) on delete set null;

-- (5) 현대시 132편 콘셉트 태그 시드 — 갈래별 후보를 snapshot의 작품명·작가로 찾는다
-- BEGIN SEED
-- END SEED
```

- [ ] **Step 4: 시드 생성기** — `scripts/gen-phase5-seed.mjs`

```js
// phase5.sql의 시드 블록(현대시 132편 콘셉트 태그)을 픽스처에서 생성한다.
// 사용: node scripts/gen-phase5-seed.mjs  → supabase/phase5.sql의 BEGIN SEED ~ END SEED 사이를 교체
import fs from 'node:fs'

const FIXTURE = new URL('../src/tests/fixtures/modernPoetry132.json', import.meta.url)
const SQL = new URL('../supabase/phase5.sql', import.meta.url)
const q = s => `'${String(s).replace(/'/g, "''")}'`

const rows = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
const values = rows
  .map(r => `  (${q(r.title)}, ${q(r.author)}, array[${r.conceptVolumes.join(', ')}]::int[])`)
  .join(',\n')

const block = `-- BEGIN SEED (scripts/gen-phase5-seed.mjs가 생성 — 직접 고치지 말 것)
with seed(title, author, vols) as (values
${values}
), matched as (
  update public.genre_picks p
     set concept_volume_ids = coalesce(
       (select array_agg(v.id order by v.number) from public.volumes v where v.number = any (s.vols)),
       '{}')
    from seed s
   where p.work_snapshot ->> 'title' = s.title
     and p.work_snapshot ->> 'author' = s.author
  returning s.title, s.author
)
select
  (select count(*) from seed) as "시드 편수",
  (select count(*) from matched) as "매칭 편수",
  (select string_agg(s.title || ' / ' || s.author, ', ')
     from seed s
    where not exists (select 1 from matched m where m.title = s.title and m.author = s.author)) as "미매칭 작품";
-- END SEED`

const sql = fs.readFileSync(SQL, 'utf8')
if (!/-- BEGIN SEED[\s\S]*-- END SEED/.test(sql)) throw new Error('phase5.sql에 BEGIN SEED / END SEED 표식이 없습니다')
fs.writeFileSync(SQL, sql.replace(/-- BEGIN SEED[\s\S]*-- END SEED/, () => block))
console.log(`시드 ${rows.length}편을 phase5.sql에 기록했습니다`)
```

Run: `node scripts/gen-phase5-seed.mjs`
Expected: `시드 132편을 phase5.sql에 기록했습니다`

- [ ] **Step 5: 실행 안내** — `docs/setup-phase5.md`

```markdown
# 5단계 DB 업데이트 (자동 배치)

1. Supabase Studio → 왼쪽 **SQL Editor** → New query
2. 저장소의 `supabase/phase5.sql` 내용을 전부 붙여 넣고 **Run**
3. 아래쪽 결과표 확인
   - `시드 편수` 132, `매칭 편수` 132, `미매칭 작품` 비어 있음(NULL) → 성공
   - `미매칭 작품`에 제목이 있으면: 갈래별 후보에서 지웠거나 작품명·작가가 바뀐 작품입니다. 사이트의 갈래별 후보 탭에서 '어울리는 권'을 직접 달면 됩니다.
4. 사이트의 **권별 작품 목록**에서 각 권 옆에 교육과정기(예: 1차·2차·3차)가 보이는지 확인

주의: 한 번만 실행합니다. 두 번 실행하면 "column already exists" 오류가 나지만 데이터는 바뀌지 않습니다.
```

- [ ] **Step 6: 통과 확인** — Run: `npx vitest run src/tests/phase5Seed.test.js` → PASS 2건

- [ ] **Step 7: 커밋**

```bash
git add supabase/phase5.sql scripts/gen-phase5-seed.mjs docs/setup-phase5.md src/tests/phase5Seed.test.js
git commit -m "feat: phase5.sql — 권 교육과정기·콘셉트 태그·적용 묶음 + 현대시 132편 태그 시드

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `volumeApi.js` 자동 배치 API

**Files:**
- Modify: `src/board/volumeApi.js` (`createPart` 시그니처, 파일 끝에 섹션 추가)
- Test: `src/tests/volumeApi.test.js` (끝에 추가 — 기존 `chain`/`fromResults` 목 재사용)

**Interfaces:**
- Produces (Task 5~9가 사용):
  - `createPart(volumeId, number, title = null)` — 기존 호출(`createPart(volumeId, n)`)은 그대로 동작
  - `isMissingSchemaError(err) → boolean`
  - `updatePickConcept(id, conceptVolumeIds) → pick row`
  - `listPlacementBatches() → batch[]` (최신순)
  - `createPlacementBatch(genre) → batch`
  - `updatePlacementBatch(id, patch) → batch`
  - `insertPlacedWork({ volumeId, workId, workSnapshot, partId, batchId, sortOrder }) → row | null` (null = 같은 권에 이미 있음)
  - `listBatchWorks(batchId) → [{ id, volume_id, work_id, part_id, selection_status, work_snapshot, volumes: { number } }]`
  - `listAttachmentRefs(volumeWorkIds) → { tasks: id[], comments: id[], files: id[] }`
  - `deleteVolumeWorks(ids)`
  - `listNonEmptyPartIds(partIds) → id[]`

- [ ] **Step 1: 실패하는 테스트** — `src/tests/volumeApi.test.js` 끝에 추가

```js
test('isMissingSchemaError: phase5 미실행 오류를 알아본다', () => {
  expect(api.isMissingSchemaError(new Error('relation "public.placement_batches" does not exist'))).toBe(true)
  expect(api.isMissingSchemaError(new Error("Could not find the 'curricula' column of 'volumes' in the schema cache"))).toBe(true)
  expect(api.isMissingSchemaError(new Error('network down'))).toBe(false)
})

test('insertPlacedWork: 같은 권 중복(23505)이면 null', async () => {
  fromResults.push({ data: null, error: { code: '23505', message: 'duplicate key' } })
  const row = await api.insertPlacedWork({ volumeId: 'v1', workId: 'W1', workSnapshot: {}, partId: null, batchId: 'b1', sortOrder: 10 })
  expect(row).toBeNull()
})

test('insertPlacedWork: 그 밖의 오류는 던진다', async () => {
  fromResults.push({ data: null, error: { code: '42501', message: 'denied' } })
  await expect(api.insertPlacedWork({ volumeId: 'v1', workId: 'W1', workSnapshot: {}, partId: null, batchId: 'b1', sortOrder: 10 }))
    .rejects.toThrow('denied')
})

test('listAttachmentRefs: 빈 목록이면 조회하지 않는다', async () => {
  expect(await api.listAttachmentRefs([])).toEqual({ tasks: [], comments: [], files: [] })
  expect(mockSupabase.from).not.toHaveBeenCalled()
})

test('listAttachmentRefs: 세 테이블의 volume_work_id를 모은다', async () => {
  fromResults.push({ data: [{ volume_work_id: 'a' }], error: null })
  fromResults.push({ data: [], error: null })
  fromResults.push({ data: [{ volume_work_id: 'b' }], error: null })
  expect(await api.listAttachmentRefs(['a', 'b'])).toEqual({ tasks: ['a'], comments: [], files: ['b'] })
  expect(mockSupabase.from.mock.calls.map(c => c[0])).toEqual(['work_tasks', 'work_comments', 'files'])
})

test('listNonEmptyPartIds: 중복 없이 part_id를 돌려준다', async () => {
  fromResults.push({ data: [{ part_id: 'p1' }, { part_id: 'p1' }], error: null })
  expect(await api.listNonEmptyPartIds(['p1', 'p2'])).toEqual(['p1'])
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/tests/volumeApi.test.js` → 새 6건 FAIL (`api.isMissingSchemaError is not a function` 등)

- [ ] **Step 3: `createPart` 수정** — 기존 함수를 교체

```js
export async function createPart(volumeId, number, title = null) {
  return unwrap(
    await supabase.from('volume_parts')
      .insert({ volume_id: volumeId, number, title, sort_order: number * 10 })
      .select().single(),
  )
}
```

- [ ] **Step 4: 파일 끝에 섹션 추가**

```js

// ---------- 자동 배치 (5단계, 설계 2026-09-28) ----------

// phase5.sql 미실행(컬럼·테이블 없음) 오류인가
export function isMissingSchemaError(err) {
  return /placement_batches|placement_batch_id|concept_volume_ids|curricula|schema cache|does not exist/i
    .test(err?.message || '')
}

export async function updatePickConcept(id, conceptVolumeIds) {
  return unwrap(
    await supabase.from('genre_picks').update({ concept_volume_ids: conceptVolumeIds })
      .eq('id', id).select().single(),
  )
}

export async function listPlacementBatches() {
  return unwrap(await supabase.from('placement_batches').select('*').order('created_at', { ascending: false }))
}

export async function createPlacementBatch(genre) {
  return unwrap(await supabase.from('placement_batches').insert({ genre }).select().single())
}

export async function updatePlacementBatch(id, patch) {
  return unwrap(await supabase.from('placement_batches').update(patch).eq('id', id).select().single())
}

// 자동 배치 1편 추가. 같은 권에 이미 있으면(23505) null — 호출 측이 '건너뜀'으로 처리
export async function insertPlacedWork({ volumeId, workId, workSnapshot, partId, batchId, sortOrder }) {
  const { data, error } = await supabase.from('volume_works').insert({
    volume_id: volumeId,
    work_id: workId,
    work_snapshot: workSnapshot,
    part_id: partId ?? null,
    placement_batch_id: batchId,
    sort_order: sortOrder,
  }).select().single()
  if (error) {
    if (error.code === '23505') return null
    throw new Error(error.message)
  }
  return data
}

export async function listBatchWorks(batchId) {
  return unwrap(
    await supabase.from('volume_works')
      .select('id, volume_id, work_id, part_id, selection_status, work_snapshot, volumes(number)')
      .eq('placement_batch_id', batchId),
  )
}

// 되돌리기 판정용: 행들에 딸린 업무·의견·자료의 volume_work_id
export async function listAttachmentRefs(volumeWorkIds) {
  if (!volumeWorkIds.length) return { tasks: [], comments: [], files: [] }
  const [t, c, f] = await Promise.all([
    supabase.from('work_tasks').select('volume_work_id').in('volume_work_id', volumeWorkIds),
    supabase.from('work_comments').select('volume_work_id').in('volume_work_id', volumeWorkIds),
    supabase.from('files').select('volume_work_id').in('volume_work_id', volumeWorkIds),
  ])
  return {
    tasks: unwrap(t).map(r => r.volume_work_id),
    comments: unwrap(c).map(r => r.volume_work_id),
    files: unwrap(f).map(r => r.volume_work_id),
  }
}

export async function deleteVolumeWorks(ids) {
  if (!ids.length) return
  unwrap(await supabase.from('volume_works').delete().in('id', ids))
}

// 주어진 부 중 아직 작품이 남아 있는 부의 id
export async function listNonEmptyPartIds(partIds) {
  if (!partIds.length) return []
  const rows = unwrap(await supabase.from('volume_works').select('part_id').in('part_id', partIds))
  return [...new Set(rows.map(r => r.part_id))]
}
```

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run src/tests/volumeApi.test.js` → 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/board/volumeApi.js src/tests/volumeApi.test.js
git commit -m "feat: 자동 배치 API (적용 묶음·배치 추가·되돌리기 조회)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 권 목록 — 교육과정기 편집과 '자동 배치' 버튼

**Files:**
- Modify: `src/board/VolumesPage.jsx`
- Test: `src/tests/VolumesPage.test.jsx` (끝에 추가)

**Interfaces:**
- Consumes: `CURRICULUM_OPTIONS` (constants.js), `MultiSelectDropdown`, `sortCurricula`, `updateVolume(id, patch)`

- [ ] **Step 1: 실패하는 테스트** — `src/tests/VolumesPage.test.jsx` 끝에 추가

```js
test('교육과정기가 있는 권은 목록에 표시하고, 수정 폼에서 바꿀 수 있다', async () => {
  api.listVolumes.mockResolvedValue([{ id: 'v2', number: 2, title: '오래 남을 문학의 자리', status: '기획', curricula: ['4차'] }])
  api.updateVolume.mockResolvedValue({ id: 'v2', number: 2, title: '오래 남을 문학의 자리', status: '기획', curricula: ['4차', '5차'] })
  renderPage()
  await waitFor(() => expect(screen.getByText('4차')).toBeInTheDocument())
  await userEvent.click(screen.getByRole('button', { name: '수정' }))
  await userEvent.click(screen.getByRole('button', { name: /교육과정기/ }))
  await userEvent.click(screen.getByLabelText('5차'))
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  expect(api.updateVolume).toHaveBeenCalledWith('v2', { number: 2, title: '오래 남을 문학의 자리', curricula: ['4차', '5차'] })
  await waitFor(() => expect(screen.getByText('4차·5차')).toBeInTheDocument())
})

test('phase5 전(curricula 없음)에는 수정 시 curricula를 보내지 않는다', async () => {
  api.listVolumes.mockResolvedValue([{ id: 'v1', number: 1, title: '첫 장면', status: '기획' }])
  api.updateVolume.mockResolvedValue({ id: 'v1', number: 1, title: '첫 장면', status: '기획' })
  renderPage()
  await waitFor(() => screen.getByRole('button', { name: '수정' }))
  await userEvent.click(screen.getByRole('button', { name: '수정' }))
  expect(screen.queryByRole('button', { name: /교육과정기/ })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '저장' }))
  expect(api.updateVolume).toHaveBeenCalledWith('v1', { number: 1, title: '첫 장면' })
})

test("'자동 배치' 링크가 있다", async () => {
  api.listVolumes.mockResolvedValue([])
  renderPage()
  await waitFor(() => expect(screen.getByRole('link', { name: '자동 배치' })).toHaveAttribute('href', '#/auto-place'))
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/tests/VolumesPage.test.jsx` → 새 3건 FAIL

- [ ] **Step 3: 구현** — `src/board/VolumesPage.jsx` 변경점

import 추가:

```js
import MultiSelectDropdown from './MultiSelectDropdown.jsx'
import { CURRICULUM_OPTIONS } from './constants.js'
import { sortCurricula } from '../works/workKey.js'
```

state 추가(`editTitle` 아래):

```js
  const [editCurricula, setEditCurricula] = useState([])
```

`startEdit` 끝에 추가:

```js
    setEditCurricula(v.curricula || [])
```

`handleUpdate`의 patch 구성을 교체:

```js
  async function handleUpdate(e) {
    e.preventDefault()
    const current = volumes.find(x => x.id === editingId)
    const patch = { number: Number(editNumber), title: editTitle.trim() }
    // phase5.sql 적용 전 DB에는 curricula 컬럼이 없다 — 행에 키가 있을 때만 보낸다
    if (current && 'curricula' in current) patch.curricula = sortCurricula(editCurricula)
    try {
      const v = await updateVolume(editingId, patch)
      setVolumes(vs => vs.map(x => (x.id === v.id ? v : x)).sort((a, b) => a.number - b.number))
      setEditingId(null)
    } catch (err) {
      show(/duplicate|23505/i.test(err.message) ? '이미 있는 권 번호입니다' : err.message)
    }
  }
```

제목 줄 교체 (`<h2 className="mb-4 text-lg font-bold">권별 작품 목록</h2>` →):

```jsx
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-bold">권별 작품 목록</h2>
        <Link to="/auto-place"
          className="ml-auto rounded bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-700">
          자동 배치
        </Link>
      </div>
```

수정 폼: 주제명 `<div className="flex-1">…</div>` 바로 뒤, 저장 버튼 앞에 추가:

```jsx
                {'curricula' in v && (
                  <div>
                    <span className="block text-xs text-gray-500">교육과정기</span>
                    <MultiSelectDropdown label="교육과정기" options={CURRICULUM_OPTIONS}
                      selected={editCurricula} onChange={setEditCurricula} />
                  </div>
                )}
```

목록 행: `<span className="flex-1">{v.title}</span>` 뒤에 추가:

```jsx
                {(v.curricula || []).length > 0 && (
                  <span className="text-xs text-gray-400">{v.curricula.join('·')}</span>
                )}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/tests/VolumesPage.test.jsx` → 전부 PASS

- [ ] **Step 5: 커밋**

```bash
git add src/board/VolumesPage.jsx src/tests/VolumesPage.test.jsx
git commit -m "feat: 권 교육과정기 편집과 '자동 배치' 진입 버튼

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 갈래별 후보 — '어울리는 권' 콘셉트 태그

**Files:**
- Create: `src/board/ConceptTags.jsx`
- Modify: `src/board/GenrePicksPage.jsx`
- Test: `src/tests/GenrePicksPage.test.jsx` (mock 보강 + 끝에 추가)

**Interfaces:**
- Consumes: `listVolumes()`, `updatePickConcept(id, ids)` (Task 4)
- Produces: `<ConceptTags title volumeIds volumes onSave />` — `onSave(nextIds: string[])`

- [ ] **Step 1: 테스트 mock 보강** — `src/tests/GenrePicksPage.test.jsx`의 `vi.mock('../board/volumeApi.js', …)` 객체에 두 줄 추가 (기존 테스트가 새 호출 때문에 깨지지 않게):

```js
  listVolumes: vi.fn().mockResolvedValue([]),
  updatePickConcept: vi.fn(),
```

- [ ] **Step 2: 실패하는 테스트** — 파일 끝에 추가

```js
test("'어울리는 권' 칩으로 콘셉트 태그를 편집한다", async () => {
  api.listVolumes.mockResolvedValue([
    { id: 'v7', number: 7, title: '문학과 함께 자라는 우리' },
    { id: 'v8', number: 8, title: '내일을 여는 문학 수업' },
  ])
  api.listPicks.mockResolvedValue([
    { id: 'p1', work_id: 'W1', concept_volume_ids: ['v7'], work_snapshot: { title: '봄 길', author: '정호승', genre: '시', curriculum: [] } },
  ])
  api.updatePickConcept.mockResolvedValue({})
  renderPage()
  const chip = await screen.findByRole('button', { name: '봄 길 어울리는 권' })
  await waitFor(() => expect(chip).toHaveTextContent('7권')) // 권 목록은 후보와 따로 로드된다
  await userEvent.click(chip)
  await userEvent.click(screen.getByRole('checkbox', { name: /8권/ }))
  expect(api.updatePickConcept).toHaveBeenCalledWith('p1', ['v7', 'v8'])
  await waitFor(() => expect(chip).toHaveTextContent('7권 8권'))
})

test('phase5 전(concept_volume_ids 없음)에는 칩을 보이지 않는다', async () => {
  api.listPicks.mockResolvedValue([
    { id: 'p1', work_id: 'W1', work_snapshot: { title: '봄 길', author: '정호승', genre: '시', curriculum: [] } },
  ])
  renderPage()
  await screen.findByRole('button', { name: '봄 길 제거' })
  expect(screen.queryByRole('button', { name: '봄 길 어울리는 권' })).not.toBeInTheDocument()
})
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run src/tests/GenrePicksPage.test.jsx` → 새 테스트 FAIL, 기존 테스트는 PASS

- [ ] **Step 4: `src/board/ConceptTags.jsx`**

```jsx
// 갈래별 후보의 '어울리는 권' 칩 + 편집 팝오버 (설계 2026-09-28 §3.7)
// 자동 배치 때 태그된 권이 가점(+4)을 받는다.
import { useEffect, useRef, useState } from 'react'

export default function ConceptTags({ title, volumeIds, volumes, onSave }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const tagged = volumes.filter(v => volumeIds.includes(v.id)) // 삭제된 권 id는 자연히 무시
  function toggle(id) {
    onSave(volumeIds.includes(id) ? volumeIds.filter(x => x !== id) : [...volumeIds, id])
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-label={`${title} 어울리는 권`}
        onClick={() => setOpen(o => !o)}
        className="rounded border border-dashed border-purple-300 px-1.5 py-0.5 text-xs text-purple-700 hover:bg-purple-50"
      >
        {tagged.length ? tagged.map(v => `${v.number}권`).join(' ') : '어울리는 권 +'}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded border border-gray-200 bg-white p-2 shadow-lg">
          <p className="mb-1 text-xs text-gray-500">자동 배치 때 가점을 받는 권</p>
          {volumes.map(v => (
            <label key={v.id} className="flex items-center gap-2 py-0.5 text-sm">
              <input type="checkbox" checked={volumeIds.includes(v.id)} onChange={() => toggle(v.id)} />
              <span className="shrink-0">{v.number}권</span>
              <span className="truncate text-xs text-gray-400">{v.title}</span>
            </label>
          ))}
          {!volumes.length && <p className="text-xs text-gray-400">권이 없습니다</p>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: `GenrePicksPage.jsx` 변경**

import 추가: `import ConceptTags from './ConceptTags.jsx'`

state 추가(`allVw` 아래): `const [volumes, setVolumes] = useState([])`

`load` 안에 추가: `api.listVolumes().then(setVolumes).catch(() => {})`

`handleRemove` 위에 추가:

```js
  async function handleConcept(pick, ids) {
    const prev = pick.concept_volume_ids
    setPicks(ps => ps.map(p => (p.id === pick.id ? { ...p, concept_volume_ids: ids } : p)))
    try {
      await api.updatePickConcept(pick.id, ids)
    } catch (err) {
      setPicks(ps => ps.map(p => (p.id === pick.id ? { ...p, concept_volume_ids: prev } : p)))
      show(err.message)
    }
  }
```

후보 행 `<li>` 안, `{dups.map(…)}` 바로 앞에 추가:

```jsx
                  {'concept_volume_ids' in p && (
                    <ConceptTags
                      title={p.work_snapshot?.title}
                      volumeIds={p.concept_volume_ids || []}
                      volumes={volumes}
                      onSave={ids => handleConcept(p, ids)}
                    />
                  )}
```

- [ ] **Step 6: 통과 확인** — Run: `npx vitest run src/tests/GenrePicksPage.test.jsx` → 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add src/board/ConceptTags.jsx src/board/GenrePicksPage.jsx src/tests/GenrePicksPage.test.jsx
git commit -m "feat: 갈래별 후보에 '어울리는 권' 콘셉트 태그 편집

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 배치안 엑셀 `exportPlacement.js`

**Files:**
- Modify: `src/board/exportPicks.js` (`function today()` → `export function today()`)
- Create: `src/board/exportPlacement.js`
- Test: `src/tests/exportPlacement.test.js`

**Interfaces:**
- Consumes: `evaluateAssignment` 결과의 `columns`, `held` (Task 2), `REASON_LABELS`, `UNPLACEABLE_LABELS`, `firstCurriculum`, `today`
- Produces: `placementRows({ columns }) → row[]`, `buildPlacementWorkbook({ bucket, columns, held, holdReasons }) → workbook`, `downloadPlacementExcel(args)`
  - `holdReasons: Map<workId, 'noEligibleVolume'|'authorLimit'|'manual'>`

- [ ] **Step 1: exportPicks.js** — `function today() {` 를 `export function today() {` 로 바꾼다.

- [ ] **Step 2: 실패하는 테스트** — `src/tests/exportPlacement.test.js`

```js
import { placementRows, buildPlacementWorkbook } from '../board/exportPlacement.js'

const v1 = { id: 'v1', number: 1, title: '교과서 문학의 첫 장면', curricula: ['1차', '2차', '3차'] }
const v2 = { id: 'v2', number: 2, title: '오래 남을 문학의 자리', curricula: ['4차'] }
const w = (workId, title, author, curricula) => ({ workId, title, author, curricula, conceptVolumeIds: [] })
const COLUMNS = [
  { volume: v1, existing: [], total: 1, proposed: [{ work: w('W1', '진달래꽃', '김소월', ['1차', '4차']), reasons: ['debut'], warnings: [] }] },
  { volume: v2, existing: [{ title: '님의 침묵', author: '한용운' }], total: 3, proposed: [
    { work: w('W2', '서시', '윤동주', ['4차']), reasons: ['debut', 'concept'], warnings: ['authorDup'] },
    { work: w('W3', '자화상', '윤동주', ['5차', '4차']), reasons: ['balance'], warnings: ['authorDup'] },
  ] },
]
const HELD = [w('W9', '낯선 시', '작가', ['1995개정'])]

test('placementRows: 권·권 내 번호·근거·비고', () => {
  const rows = placementRows({ columns: COLUMNS })
  expect(rows).toHaveLength(3)
  expect(rows[0]).toEqual({
    '권': 1, '교육과정기': '1차·2차·3차', '권 내 번호': 1, '작품명': '진달래꽃', '작가명': '김소월',
    '수록 교육과정': '1차, 4차', '첫 수록 시기': '1차', '배치 근거': '첫 수록', '비고': '',
  })
  expect(rows[1]['배치 근거']).toBe('첫 수록 · 콘셉트')
  expect(rows[1]['비고']).toBe('작가 중복(윤동주) — 2차 조정 대상')
  expect(rows[2]['권 내 번호']).toBe(2)
})

test('buildPlacementWorkbook: 한눈에 보기 / 권별 배치안 / 배치 기준 / 보류함', () => {
  const wb = buildPlacementWorkbook({ bucket: '현대시', columns: COLUMNS, held: HELD, holdReasons: new Map([['W9', 'noEligibleVolume']]) })
  expect(wb.SheetNames).toEqual(['한눈에 보기', '권별 배치안', '배치 기준', '보류함'])
  const ov = wb.Sheets['한눈에 보기']
  expect(ov['B1'].v).toBe('1권')
  expect(ov['C2'].v).toBe('4차')
  expect(ov['C4'].v).toBe('기존 1 + 신규 2')
  expect(ov['C5'].v).toBe('서시 (윤동주)')
  expect(ov['B1'].s.fill.fgColor.rgb).toBe('4472C4')
  expect(ov['C5'].s.fill.fgColor.rgb).toBe('FCE4D6') // 작가 중복 강조
  expect(wb.Sheets['권별 배치안']['D2'].v).toBe('진달래꽃')
  expect(wb.Sheets['보류함']['D2'].v).toBe('수록 교육과정에 맞는 권 없음')
})

test('보류함이 비면 시트를 만들지 않는다', () => {
  const wb = buildPlacementWorkbook({ bucket: '현대시', columns: COLUMNS, held: [], holdReasons: new Map() })
  expect(wb.SheetNames).toEqual(['한눈에 보기', '권별 배치안', '배치 기준'])
})
```

- [ ] **Step 3: 실패 확인** — Run: `npx vitest run src/tests/exportPlacement.test.js` → FAIL

- [ ] **Step 4: 구현** — `src/board/exportPlacement.js`

```js
// 자동 배치안 엑셀 (설계 2026-09-28 §3.4) — 2026-09-28 수동 배치안 엑셀과 같은 구성
import * as XLSX from 'xlsx-js-style'
import { sortCurricula } from '../works/workKey.js'
import { firstCurriculum, WEIGHTS, AUTHOR_LIMIT } from './autoPlace.js'
import { REASON_LABELS, UNPLACEABLE_LABELS } from './placementUtils.js'
import { today } from './exportPicks.js'

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { patternType: 'solid', fgColor: { rgb: '4472C4' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
}
const SUBHEAD_STYLE = {
  font: { bold: true },
  fill: { patternType: 'solid', fgColor: { rgb: 'DDEBF7' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
}
const DUP_STYLE = { fill: { patternType: 'solid', fgColor: { rgb: 'FCE4D6' } } }

const isDup = p => p.warnings.includes('authorDup') || p.warnings.includes('authorOver')

function noteOf(p) {
  const n = []
  if (isDup(p)) n.push(`작가 중복(${p.work.author}) — 2차 조정 대상`)
  if (p.warnings.includes('ineligible')) n.push('수록 이력 없는 권(직접 조정)')
  return n.join(' / ')
}

export function placementRows({ columns }) {
  const rows = []
  for (const col of columns) {
    col.proposed.forEach((p, i) => rows.push({
      '권': col.volume.number,
      '교육과정기': (col.volume.curricula || []).join('·'),
      '권 내 번호': i + 1,
      '작품명': p.work.title,
      '작가명': p.work.author,
      '수록 교육과정': sortCurricula(p.work.curricula).join(', '),
      '첫 수록 시기': firstCurriculum(p.work.curricula) || '',
      '배치 근거': p.reasons.map(r => REASON_LABELS[r]).join(' · '),
      '비고': noteOf(p),
    }))
  }
  return rows
}

function overviewSheet(columns) {
  const aoa = [
    ['권', ...columns.map(c => `${c.volume.number}권`)],
    ['교육과정기', ...columns.map(c => (c.volume.curricula || []).join('·'))],
    ['권 제목', ...columns.map(c => c.volume.title)],
    ['편수', ...columns.map(c => `기존 ${c.existing.length} + 신규 ${c.proposed.length}`)],
  ]
  const maxN = Math.max(0, ...columns.map(c => c.proposed.length))
  for (let k = 0; k < maxN; k++) {
    aoa.push([k + 1, ...columns.map(c => (c.proposed[k] ? `${c.proposed[k].work.title} (${c.proposed[k].work.author})` : ''))])
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 12 }, ...columns.map(() => ({ wch: 28 }))]
  for (let c = 0; c <= columns.length; c++) {
    const top = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (top) top.s = HEADER_STYLE
    for (let r = 1; r <= 3; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })]
      if (cell) cell.s = c === 0 ? HEADER_STYLE : SUBHEAD_STYLE
    }
  }
  columns.forEach((col, ci) => col.proposed.forEach((p, k) => {
    const cell = ws[XLSX.utils.encode_cell({ r: 4 + k, c: ci + 1 })]
    if (cell && isDup(p)) cell.s = DUP_STYLE
  }))
  return ws
}

function listSheet(columns) {
  const ws = XLSX.utils.json_to_sheet(placementRows({ columns }))
  ws['!cols'] = [6, 15, 9, 30, 12, 52, 12, 18, 34].map(wch => ({ wch }))
  for (let c = 0; c < 9; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (cell) cell.s = HEADER_STYLE
  }
  return ws
}

function criteriaSheet(bucket) {
  const aoa = [
    [`${bucket} 자동 배치 기준`],
    ['수록 이력', '작품이 실제로 실린 교육과정기의 권에만 배치(권의 교육과정기는 권 목록에서 설정).'],
    ['첫 수록', `작품이 처음 교과서에 실린 시기의 권에 가점 +${WEIGHTS.debut}.`],
    ['콘셉트', `갈래별 후보의 '어울리는 권' 태그에 있는 권에 가점 +${WEIGHTS.concept}.`],
    ['작가 중복', `같은 권 같은 작가는 감점 ${WEIGHTS.authorDup}, 권당 최대 ${AUTHOR_LIMIT}편.`],
    ['분량', `권별 편수가 평균 ±${WEIGHTS.balanceBand}편을 벗어나면 1편당 ${WEIGHTS.balancePenalty}.`],
    ['배치 근거', "'첫 수록'·'콘셉트'에 해당하지 않으면 '균형'(분량을 맞추려고 배치) — 2차 논의 때 우선 검토 대상."],
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!cols'] = [{ wch: 14 }, { wch: 100 }]
  ws['A1'].s = { font: { bold: true, sz: 13 } }
  return ws
}

function heldSheet(held, holdReasons) {
  const ws = XLSX.utils.json_to_sheet(held.map(w => ({
    '작품명': w.title,
    '작가명': w.author,
    '수록 교육과정': sortCurricula(w.curricula).join(', '),
    '이유': UNPLACEABLE_LABELS[holdReasons.get(w.workId) || 'manual'],
  })))
  ws['!cols'] = [30, 12, 52, 30].map(wch => ({ wch }))
  for (let c = 0; c < 4; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })]
    if (cell) cell.s = HEADER_STYLE
  }
  return ws
}

export function buildPlacementWorkbook({ bucket, columns, held, holdReasons }) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, overviewSheet(columns), '한눈에 보기')
  XLSX.utils.book_append_sheet(wb, listSheet(columns), '권별 배치안')
  XLSX.utils.book_append_sheet(wb, criteriaSheet(bucket), '배치 기준')
  if (held.length) XLSX.utils.book_append_sheet(wb, heldSheet(held, holdReasons), '보류함')
  return wb
}

export function downloadPlacementExcel(args) {
  XLSX.writeFile(buildPlacementWorkbook(args), `${args.bucket}_권별 배치안_${today()}.xlsx`)
}
```

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run src/tests/exportPlacement.test.js src/tests/exportPicks.test.js` → 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add src/board/exportPicks.js src/board/exportPlacement.js src/tests/exportPlacement.test.js
git commit -m "feat: 자동 배치안 엑셀 내보내기

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 적용·되돌리기 절차 `placementActions.js`

**Files:**
- Create: `src/board/placementActions.js`
- Test: `src/tests/placementActions.test.js`

**Interfaces:**
- Consumes: Task 4 API(주입된 `api` 객체로만 호출), Task 2 `PART_BY_BUCKET, PART_TITLE, splitUndoable`, `SELECTION_LABELS`
- Produces:
  - `plannedNewParts({ bucket, items, parts }) → [{ volumeId, number }]`
  - `applyConfirmText({ bucket, items, volumes, newParts }) → string`
  - `applyPlacement({ api, bucket, items }) → { batchId, added, skipped: work[], failed: [{ work, message }], createdParts }`
    - `items: [{ work: { workId, title, snapshot }, volumeId }]`
  - `applySummary(result) → string`
  - `undoBatch({ api, batch }) → { removed, kept: [{ row, reason }], removedParts }`
  - `undoSummary({ removed, kept }) → string`

- [ ] **Step 1: 실패하는 테스트** — `src/tests/placementActions.test.js`

```js
import { vi } from 'vitest'
import {
  plannedNewParts, applyConfirmText, applyPlacement, applySummary, undoBatch, undoSummary,
} from '../board/placementActions.js'

const work = (workId, title) => ({ workId, title, snapshot: { title, author: 'a', genre: '시' } })
const VOLS = [{ id: 'v1', number: 1 }, { id: 'v2', number: 2 }]

function fakeApi(over = {}) {
  return {
    listAllVolumeWorks: vi.fn().mockResolvedValue([]),
    listAllParts: vi.fn().mockResolvedValue([]),
    createPlacementBatch: vi.fn().mockResolvedValue({ id: 'b1' }),
    updatePlacementBatch: vi.fn().mockResolvedValue({}),
    createPart: vi.fn((vid, n) => Promise.resolve({ id: `part-${vid}-${n}` })),
    insertPlacedWork: vi.fn().mockResolvedValue({ id: 'row' }),
    listBatchWorks: vi.fn().mockResolvedValue([]),
    listAttachmentRefs: vi.fn().mockResolvedValue({ tasks: [], comments: [], files: [] }),
    deleteVolumeWorks: vi.fn().mockResolvedValue(),
    listNonEmptyPartIds: vi.fn().mockResolvedValue([]),
    deletePart: vi.fn().mockResolvedValue(),
    ...over,
  }
}

test('plannedNewParts: 그 권에 해당 번호의 부가 없을 때만', () => {
  const items = [{ work: work('W1', '가'), volumeId: 'v1' }, { work: work('W2', '나'), volumeId: 'v2' }]
  const parts = [{ id: 'p', volume_id: 'v1', number: 1 }]
  expect(plannedNewParts({ bucket: '현대시', items, parts })).toEqual([{ volumeId: 'v2', number: 1 }])
  expect(plannedNewParts({ bucket: '고전산문', items, parts })).toEqual([])
})

test('applyConfirmText: 권별 편수 요약과 새 부 안내', () => {
  const items = [{ work: work('W1', '가'), volumeId: 'v2' }, { work: work('W2', '나'), volumeId: 'v1' }, { work: work('W3', '다'), volumeId: 'v2' }]
  const text = applyConfirmText({ bucket: '현대시', items, volumes: VOLS, newParts: [{ volumeId: 'v2', number: 1 }] })
  expect(text).toContain('현대시 3편 → 1권 1 · 2권 2')
  expect(text).toContain("2권에 '1부'가 없어 새로 만듭니다.")
})

test('applyPlacement: 부 확보·정렬 순서·묶음 기록', async () => {
  const api = fakeApi({
    listAllVolumeWorks: vi.fn().mockResolvedValue([{ volume_id: 'v1', work_id: 'X', selection_status: 'candidate', sort_order: 30 }]),
    listAllParts: vi.fn().mockResolvedValue([{ id: 'p1', volume_id: 'v1', number: 1 }]),
  })
  const items = [{ work: work('W1', '가'), volumeId: 'v1' }, { work: work('W2', '나'), volumeId: 'v2' }]
  const res = await applyPlacement({ api, bucket: '현대시', items })
  expect(api.createPart).toHaveBeenCalledWith('v2', 1, '시')
  expect(api.updatePlacementBatch).toHaveBeenCalledWith('b1', { created_part_ids: ['part-v2-1'] })
  expect(api.insertPlacedWork).toHaveBeenNthCalledWith(1, expect.objectContaining({ volumeId: 'v1', workId: 'W1', partId: 'p1', batchId: 'b1', sortOrder: 40 }))
  expect(api.insertPlacedWork).toHaveBeenNthCalledWith(2, expect.objectContaining({ volumeId: 'v2', workId: 'W2', partId: 'part-v2-1', sortOrder: 10 }))
  expect(api.updatePlacementBatch).toHaveBeenLastCalledWith('b1', { item_count: 2 })
  expect(res).toMatchObject({ batchId: 'b1', added: 2, skipped: [], failed: [], createdParts: 1 })
})

test('applyPlacement: 그사이 배치된 작품·제외된 권은 건너뛰고, 고전산문은 부 미배정', async () => {
  const api = fakeApi({
    listAllVolumeWorks: vi.fn().mockResolvedValue([
      { volume_id: 'v2', work_id: 'W1', selection_status: 'hold', sort_order: 10 },
      { volume_id: 'v1', work_id: 'W2', selection_status: 'excluded', sort_order: 10 },
    ]),
  })
  const items = [{ work: work('W1', '가'), volumeId: 'v1' }, { work: work('W2', '나'), volumeId: 'v1' }, { work: work('W3', '다'), volumeId: 'v1' }]
  const res = await applyPlacement({ api, bucket: '고전산문', items })
  expect(res.skipped.map(w => w.workId)).toEqual(['W1', 'W2'])
  expect(api.listAllParts).not.toHaveBeenCalled()
  expect(api.insertPlacedWork).toHaveBeenCalledTimes(1)
  expect(api.insertPlacedWork).toHaveBeenCalledWith(expect.objectContaining({ workId: 'W3', partId: null }))
})

test('applyPlacement: 한 편 실패해도 계속하고, 중복(null)은 건너뜀으로', async () => {
  const api = fakeApi({
    insertPlacedWork: vi.fn()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'ok' }),
  })
  const items = ['W1', 'W2', 'W3'].map(id => ({ work: work(id, id), volumeId: 'v1' }))
  const res = await applyPlacement({ api, bucket: '고전산문', items })
  expect(res.added).toBe(1)
  expect(res.failed).toEqual([{ work: items[0].work, message: 'denied' }])
  expect(res.skipped.map(w => w.workId)).toEqual(['W2'])
  expect(applySummary(res)).toBe('1편을 추가했습니다. 1편은 이미 배치되어 건너뛰었습니다: 〈W2〉 1편 실패: 〈W1〉(denied)')
})

test('applyPlacement: 추가할 게 없으면 묶음을 만들지 않는다', async () => {
  const api = fakeApi({ listAllVolumeWorks: vi.fn().mockResolvedValue([{ volume_id: 'v1', work_id: 'W1', selection_status: 'candidate' }]) })
  const res = await applyPlacement({ api, bucket: '현대시', items: [{ work: work('W1', '가'), volumeId: 'v1' }] })
  expect(api.createPlacementBatch).not.toHaveBeenCalled()
  expect(res.added).toBe(0)
})

test('undoBatch: 손댄 행은 남기고, 빈 부만 지우고, 되돌림 기록', async () => {
  const rows = [
    { id: 'a', selection_status: 'candidate', work_snapshot: { title: '풀' }, volumes: { number: 3 } },
    { id: 'b', selection_status: 'confirmed', work_snapshot: { title: '서시' }, volumes: { number: 2 } },
    { id: 'c', selection_status: 'candidate', work_snapshot: { title: '향수' }, volumes: { number: 3 } },
  ]
  const api = fakeApi({
    listBatchWorks: vi.fn().mockResolvedValue(rows),
    listAttachmentRefs: vi.fn().mockResolvedValue({ tasks: [], comments: ['c'], files: [] }),
    listNonEmptyPartIds: vi.fn().mockResolvedValue(['p2']),
  })
  const res = await undoBatch({ api, batch: { id: 'b1', created_part_ids: ['p1', 'p2'] } })
  expect(api.deleteVolumeWorks).toHaveBeenCalledWith(['a'])
  expect(api.deletePart).toHaveBeenCalledTimes(1)
  expect(api.deletePart).toHaveBeenCalledWith('p1')
  expect(api.updatePlacementBatch).toHaveBeenCalledWith('b1', { undone_at: expect.any(String) })
  expect(res.removed).toBe(1)
  expect(res.removedParts).toBe(1)
  expect(undoSummary(res)).toBe('1편을 뺐습니다. 2편은 남겼습니다: 〈서시〉(2권 확정), 〈향수〉(3권 의견 있음)')
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/tests/placementActions.test.js` → FAIL

- [ ] **Step 3: 구현** — `src/board/placementActions.js`

```js
// 자동 배치 적용·되돌리기 절차 (설계 2026-09-28 §3.5·§3.6). api를 주입받아 테스트한다.
import { PART_BY_BUCKET, PART_TITLE, splitUndoable } from './placementUtils.js'
import { SELECTION_LABELS } from './constants.js'

const SORT_STEP = 10
const KEEP_LABEL = { tasks: '업무 있음', comments: '의견 있음', files: '자료 있음' }

// 적용 확인 창용: 새로 만들어야 할 부
export function plannedNewParts({ bucket, items, parts }) {
  const number = PART_BY_BUCKET[bucket]
  if (!number) return []
  return [...new Set(items.map(i => i.volumeId))]
    .filter(vid => !parts.some(p => p.volume_id === vid && p.number === number))
    .map(vid => ({ volumeId: vid, number }))
}

export function applyConfirmText({ bucket, items, volumes, newParts }) {
  const numberOf = id => volumes.find(v => v.id === id)?.number
  const perVol = new Map()
  for (const it of items) perVol.set(it.volumeId, (perVol.get(it.volumeId) || 0) + 1)
  const summary = [...perVol.entries()]
    .sort((a, b) => numberOf(a[0]) - numberOf(b[0]))
    .map(([id, n]) => `${numberOf(id)}권 ${n}`)
    .join(' · ')
  const lines = [`${bucket} ${items.length}편 → ${summary}`, "각 권에 '후보' 상태로 추가합니다."]
  for (const p of newParts) lines.push(`${numberOf(p.volumeId)}권에 '${p.number}부'가 없어 새로 만듭니다.`)
  lines.push('적용 후에도 아래 적용 기록에서 되돌릴 수 있습니다.')
  return lines.join('\n')
}

// items: [{ work: { workId, title, snapshot }, volumeId }] — 화면 순서대로
export async function applyPlacement({ api, bucket, items }) {
  // 1) 최신 상태 재확인: 그사이 배치된 작품, 그 권에서 제외된 작품은 건너뛴다
  const fresh = await api.listAllVolumeWorks()
  const placed = new Set(fresh.filter(r => r.selection_status !== 'excluded').map(r => r.work_id))
  const excludedPairs = new Set(fresh.filter(r => r.selection_status === 'excluded').map(r => `${r.volume_id}|${r.work_id}`))
  const skipped = []
  const todo = []
  for (const it of items) {
    if (placed.has(it.work.workId) || excludedPairs.has(`${it.volumeId}|${it.work.workId}`)) skipped.push(it.work)
    else todo.push(it)
  }
  const result = { batchId: null, added: 0, skipped, failed: [], createdParts: 0 }
  if (!todo.length) return result

  // 2) 묶음을 먼저 만든다 — 도중에 끊겨도 들어간 만큼은 되돌릴 수 있다
  const batch = await api.createPlacementBatch(bucket)
  result.batchId = batch.id

  // 3) 부 확보
  const number = PART_BY_BUCKET[bucket]
  const partByVolume = new Map()
  if (number) {
    const parts = await api.listAllParts()
    const createdIds = []
    for (const vid of [...new Set(todo.map(i => i.volumeId))]) {
      const found = parts.find(p => p.volume_id === vid && p.number === number)
      if (found) { partByVolume.set(vid, found.id); continue }
      try {
        const part = await api.createPart(vid, number, PART_TITLE[number])
        partByVolume.set(vid, part.id)
        createdIds.push(part.id)
      } catch {
        partByVolume.set(vid, null) // 부 생성 실패 — 미배정으로 넣는다
      }
    }
    if (createdIds.length) {
      await api.updatePlacementBatch(batch.id, { created_part_ids: createdIds })
      result.createdParts = createdIds.length
    }
  }

  // 4) 한 편씩 추가 — 권별 기존 정렬 최댓값 뒤로
  const lastSort = new Map()
  for (const r of fresh) lastSort.set(r.volume_id, Math.max(lastSort.get(r.volume_id) ?? 0, r.sort_order ?? 0))
  for (const it of todo) {
    const sortOrder = (lastSort.get(it.volumeId) ?? 0) + SORT_STEP
    lastSort.set(it.volumeId, sortOrder)
    try {
      const row = await api.insertPlacedWork({
        volumeId: it.volumeId,
        workId: it.work.workId,
        workSnapshot: it.work.snapshot,
        partId: partByVolume.get(it.volumeId) ?? null,
        batchId: batch.id,
        sortOrder,
      })
      if (row) result.added++
      else skipped.push(it.work)
    } catch (err) {
      result.failed.push({ work: it.work, message: err.message })
    }
  }
  await api.updatePlacementBatch(batch.id, { item_count: result.added })
  return result
}

export function applySummary({ added, skipped, failed, createdParts }) {
  const parts = [`${added}편을 추가했습니다.`]
  if (skipped.length) parts.push(`${skipped.length}편은 이미 배치되어 건너뛰었습니다: ${skipped.map(w => `〈${w.title}〉`).join(', ')}`)
  if (createdParts) parts.push(`부 ${createdParts}개를 새로 만들었습니다.`)
  if (failed.length) parts.push(`${failed.length}편 실패: ${failed.map(f => `〈${f.work.title}〉(${f.message})`).join(', ')}`)
  return parts.join(' ')
}

export async function undoBatch({ api, batch }) {
  const rows = await api.listBatchWorks(batch.id)
  const refs = await api.listAttachmentRefs(rows.map(r => r.id))
  const { removable, kept } = splitUndoable(rows, refs)
  await api.deleteVolumeWorks(removable.map(r => r.id))
  let removedParts = 0
  const createdParts = batch.created_part_ids || []
  if (createdParts.length) {
    const nonEmpty = new Set(await api.listNonEmptyPartIds(createdParts))
    for (const pid of createdParts) {
      if (nonEmpty.has(pid)) continue
      await api.deletePart(pid)
      removedParts++
    }
  }
  await api.updatePlacementBatch(batch.id, { undone_at: new Date().toISOString() })
  return { removed: removable.length, kept, removedParts }
}

export function undoSummary({ removed, kept }) {
  const head = `${removed}편을 뺐습니다.`
  if (!kept.length) return head
  const items = kept.map(({ row, reason }) => {
    const why = reason === 'status' ? SELECTION_LABELS[row.selection_status] : KEEP_LABEL[reason]
    return `〈${row.work_snapshot?.title}〉(${row.volumes?.number}권 ${why})`
  })
  return `${head} ${kept.length}편은 남겼습니다: ${items.join(', ')}`
}
```

- [ ] **Step 4: 통과 확인** — Run: `npx vitest run src/tests/placementActions.test.js` → PASS 7건

- [ ] **Step 5: 커밋**

```bash
git add src/board/placementActions.js src/tests/placementActions.test.js
git commit -m "feat: 자동 배치 적용·일괄 되돌리기 절차

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 자동 배치 페이지 `/auto-place`

**Files:**
- Create: `src/board/AutoPlacePage.jsx`
- Modify: `src/App.jsx` (import + Route)
- Test: `src/tests/AutoPlacePage.test.jsx`

**Interfaces:**
- Consumes: Task 1 `autoPlace, isEligible`; Task 2 `buildPlacementInput, evaluateAssignment, REASON_LABELS, UNPLACEABLE_LABELS`; Task 4 API; Task 7 `downloadPlacementExcel`; Task 8 전부; `useWorksData`; `GENRE_BUCKETS`; `useToast`.

- [ ] **Step 1: 실패하는 테스트** — `src/tests/AutoPlacePage.test.jsx`

```jsx
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HashRouter } from 'react-router-dom'
import { vi } from 'vitest'

// works 배열은 팩토리 안에서 한 번만 만든다 — 렌더마다 새 배열이면 페이지의 계산 effect가 무한 반복된다
vi.mock('../works/useWorksData.js', () => {
  const row = (title, author, cur) => ({ '작품명': title, '지은이': author, _authorBase: author, '장르': '시', '교육과정': cur })
  const works = [
    row('진달래꽃', '김소월', '1차'), row('진달래꽃', '김소월', '4차'),
    row('서시', '윤동주', '4차'),
    row('해에게서 소년에게', '최남선', '3차'),
  ]
  return { useWorksData: () => ({ works, loading: false, error: null, retry: () => {} }) }
})
vi.mock('../board/volumeApi.js', () => ({
  listVolumes: vi.fn(), listPicks: vi.fn(), listAllVolumeWorks: vi.fn(), listRegistry: vi.fn(),
  listMembers: vi.fn(), listPlacementBatches: vi.fn(), listAllParts: vi.fn(),
  createPlacementBatch: vi.fn(), updatePlacementBatch: vi.fn(), createPart: vi.fn(), insertPlacedWork: vi.fn(),
  listBatchWorks: vi.fn(), listAttachmentRefs: vi.fn(), deleteVolumeWorks: vi.fn(),
  listNonEmptyPartIds: vi.fn(), deletePart: vi.fn(),
  isMissingSchemaError: err => /placement_batches|does not exist/.test(err?.message || ''),
}))
vi.mock('../board/exportPlacement.js', () => ({ downloadPlacementExcel: vi.fn() }))
const api = await import('../board/volumeApi.js')
const { default: AutoPlacePage } = await import('../board/AutoPlacePage.jsx')
const { ToastProvider } = await import('../components/Toast.jsx')

const VOLUMES = [
  { id: 'v1', number: 1, title: '첫 장면', curricula: ['1차', '2차', '3차'] },
  { id: 'v2', number: 2, title: '정전', curricula: ['4차'] },
]
const pick = (id, workId, title, author) => ({ id, work_id: workId, concept_volume_ids: [], work_snapshot: { title, author, genre: '시', curriculum: [] } })

beforeEach(() => {
  vi.clearAllMocks()
  api.listVolumes.mockResolvedValue(VOLUMES)
  api.listPicks.mockResolvedValue([
    pick('p1', 'W1', '진달래꽃', '김소월'),
    pick('p2', 'W2', '서시', '윤동주'),
    pick('p3', 'W3', '해에게서 소년에게', '최남선'),
  ])
  api.listAllVolumeWorks.mockResolvedValue([])
  api.listRegistry.mockResolvedValue([
    { work_id: 'W1', title: '진달래꽃', author_base: '김소월', aliases: [] },
    { work_id: 'W2', title: '서시', author_base: '윤동주', aliases: [] },
    { work_id: 'W3', title: '해에게서 소년에게', author_base: '최남선', aliases: [] },
  ])
  api.listMembers.mockResolvedValue([{ id: 'm1', name: '윤보라' }])
  api.listPlacementBatches.mockResolvedValue([])
  api.listAllParts.mockResolvedValue([])
})

function renderPage() {
  return render(<ToastProvider><HashRouter><AutoPlacePage /></HashRouter></ToastProvider>)
}
const column = n => screen.getByRole('region', { name: `${n}권 배치안` })

test('현대시 배치안을 권별 열로 보여 준다', async () => {
  renderPage()
  await waitFor(() => expect(within(column(1)).getByText('진달래꽃')).toBeInTheDocument())
  expect(within(column(1)).getByText('해에게서 소년에게')).toBeInTheDocument()
  expect(within(column(2)).getByText('서시')).toBeInTheDocument()
  expect(within(column(1)).getByText('기존 0 + 신규 2')).toBeInTheDocument()
  expect(within(column(2)).getAllByText('첫 수록').length).toBeGreaterThan(0)
})

test('권 이동과 빼기가 즉시 반영된다', async () => {
  renderPage()
  await waitFor(() => within(column(1)).getByText('진달래꽃'))
  await userEvent.selectOptions(screen.getByRole('combobox', { name: '진달래꽃 권 이동' }), 'v2')
  expect(within(column(1)).getByText('기존 0 + 신규 1')).toBeInTheDocument()
  expect(within(column(2)).getByText('진달래꽃')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '서시 빼기' }))
  const tray = screen.getByRole('region', { name: '보류함' })
  expect(within(tray).getByText('서시')).toBeInTheDocument()
  expect(within(tray).getByText('직접 뺌')).toBeInTheDocument()
})

test('적용하면 부를 확보하고 한 편씩 추가한 뒤 요약을 보여 준다', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  api.createPlacementBatch.mockResolvedValue({ id: 'b1' })
  api.createPart.mockImplementation(vid => Promise.resolve({ id: `part-${vid}` }))
  api.insertPlacedWork.mockResolvedValue({ id: 'row' })
  api.updatePlacementBatch.mockResolvedValue({})
  renderPage()
  await waitFor(() => within(column(1)).getByText('진달래꽃'))
  await userEvent.click(screen.getByRole('button', { name: '적용' }))
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('현대시 3편 → 1권 2 · 2권 1'))
  await waitFor(() => expect(screen.getByText(/3편을 추가했습니다/)).toBeInTheDocument())
  expect(api.createPart).toHaveBeenCalledWith('v1', 1, '시')
  expect(api.insertPlacedWork).toHaveBeenCalledWith(expect.objectContaining({ workId: 'W2', volumeId: 'v2', partId: 'part-v2', batchId: 'b1' }))
})

test('적용 기록에서 되돌리면 요약을 보여 준다', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  api.listPlacementBatches.mockResolvedValue([
    { id: 'b1', genre: '현대시', item_count: 2, created_by: 'm1', created_at: '2026-09-28T01:00:00Z', undone_at: null, created_part_ids: [] },
  ])
  api.listBatchWorks.mockResolvedValue([
    { id: 'r1', selection_status: 'candidate', work_snapshot: { title: '풀' }, volumes: { number: 3 } },
    { id: 'r2', selection_status: 'confirmed', work_snapshot: { title: '서시' }, volumes: { number: 2 } },
  ])
  api.listAttachmentRefs.mockResolvedValue({ tasks: [], comments: [], files: [] })
  api.deleteVolumeWorks.mockResolvedValue()
  api.listNonEmptyPartIds.mockResolvedValue([])
  api.updatePlacementBatch.mockResolvedValue({})
  renderPage()
  const history = await screen.findByRole('region', { name: '적용 기록' })
  expect(within(history).getByText(/윤보라/)).toBeInTheDocument()
  await userEvent.click(within(history).getByRole('button', { name: '되돌리기' }))
  await waitFor(() => expect(screen.getByText('1편을 뺐습니다. 1편은 남겼습니다: 〈서시〉(2권 확정)')).toBeInTheDocument())
  expect(api.deleteVolumeWorks).toHaveBeenCalledWith(['r1'])
})

test('phase5.sql 미실행이면 안내한다', async () => {
  api.listPlacementBatches.mockRejectedValue(new Error('relation "public.placement_batches" does not exist'))
  renderPage()
  await waitFor(() => expect(screen.getByText(/phase5\.sql/)).toBeInTheDocument())
})
```

- [ ] **Step 2: 실패 확인** — Run: `npx vitest run src/tests/AutoPlacePage.test.jsx` → FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `src/board/AutoPlacePage.jsx`

```jsx
// 갈래 후보 자동 배치: 미리보기 → 조정 → 적용, 적용 기록과 일괄 되돌리기 (5단계, 설계 2026-09-28 §3)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from './volumeApi.js'
import { useWorksData } from '../works/useWorksData.js'
import { GENRE_BUCKETS } from './genreUtils.js'
import { autoPlace, isEligible } from './autoPlace.js'
import { buildPlacementInput, evaluateAssignment, REASON_LABELS, UNPLACEABLE_LABELS } from './placementUtils.js'
import {
  applyConfirmText, applyPlacement, applySummary, plannedNewParts, undoBatch, undoSummary,
} from './placementActions.js'
import { downloadPlacementExcel } from './exportPlacement.js'
import { useToast } from '../components/Toast.jsx'

const REASON_BADGE = {
  debut: 'bg-green-100 text-green-800',
  concept: 'bg-purple-100 text-purple-800',
  balance: 'bg-gray-100 text-gray-600',
}

function VolumeSelect({ label, work, value, volumes, onChange }) {
  return (
    <select
      aria-label={label}
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
      className="rounded border border-gray-200 px-1 py-0.5 text-xs"
    >
      {!value && <option value="">권 선택</option>}
      {volumes.map(v => (
        <option key={v.id} value={v.id}>
          {v.number}권{isEligible(work, v) ? '' : ' ⚠ 수록 이력 없음'}
        </option>
      ))}
    </select>
  )
}

function formatTime(iso) {
  return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AutoPlacePage() {
  const { works: sheetWorks, loading: sheetLoading, error: sheetError } = useWorksData()
  const { show } = useToast()
  const [data, setData] = useState(null) // { volumes, picks, allVw, registry, members }
  const [batches, setBatches] = useState([])
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [bucket, setBucket] = useState(GENRE_BUCKETS[0])
  const [assignment, setAssignment] = useState(() => new Map())
  const [initial, setInitial] = useState(() => new Map())
  const [holdReasons, setHoldReasons] = useState(() => new Map())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const load = useCallback(async () => {
    try {
      const [volumes, picks, allVw, registry, members, batchRows] = await Promise.all([
        api.listVolumes(), api.listPicks(), api.listAllVolumeWorks(), api.listRegistry(),
        api.listMembers(), api.listPlacementBatches(),
      ])
      if (volumes.length && !('curricula' in volumes[0])) { setSchemaMissing(true); return }
      setData({ volumes, picks, allVw, registry, members })
      setBatches(batchRows)
    } catch (err) {
      if (api.isMissingSchemaError(err)) setSchemaMissing(true)
      else show(err.message)
    }
  }, [show])

  useEffect(() => { load() }, [load])

  const input = useMemo(() => {
    if (!data || sheetLoading) return null
    return buildPlacementInput({ ...data, sheetWorks: sheetError ? [] : sheetWorks, bucket })
  }, [data, sheetLoading, sheetError, sheetWorks, bucket])

  const compute = useCallback(() => {
    if (!input) return
    const { placements, unplaceable } = autoPlace({
      works: input.works, volumes: input.volumes, existing: input.existing, bucket,
    })
    const next = new Map(input.works.map(w => [w.workId, null]))
    for (const p of placements) next.set(p.workId, p.volumeId)
    setAssignment(next)
    setInitial(next)
    setHoldReasons(new Map(unplaceable.map(u => [u.workId, u.reason])))
  }, [input, bucket])

  useEffect(() => { compute() }, [compute])

  const view = useMemo(
    () => (input ? evaluateAssignment({ ...input, bucket, assignment }) : null),
    [input, bucket, assignment],
  )

  const memberName = useMemo(
    () => Object.fromEntries((data?.members || []).map(m => [m.id, m.name])), [data],
  )

  const dirty = [...assignment].some(([k, v]) => initial.get(k) !== v)

  function move(workId, volumeId) {
    setAssignment(a => new Map(a).set(workId, volumeId))
    if (!volumeId) setHoldReasons(r => new Map(r).set(workId, 'manual'))
  }

  function handleReset() {
    if (dirty && !window.confirm('직접 조정한 내용이 사라집니다. 처음 제안안으로 되돌릴까요?')) return
    compute()
  }

  async function handleApply() {
    const items = view.columns.flatMap(c => c.proposed.map(p => ({ work: p.work, volumeId: c.volume.id })))
    if (!items.length) { show('적용할 작품이 없습니다'); return }
    try {
      const parts = await api.listAllParts()
      const newParts = plannedNewParts({ bucket, items, parts })
      if (!window.confirm(applyConfirmText({ bucket, items, volumes: input.volumes, newParts }))) return
      setBusy(true)
      setMessage(applySummary(await applyPlacement({ api, bucket, items })))
      await load()
    } catch (err) {
      show(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleUndo(batch) {
    if (!window.confirm(`${batch.genre} ${batch.item_count}편 적용을 되돌릴까요?\n적용 뒤 손댄 작품(상태 변경·업무·의견·자료)은 남깁니다.`)) return
    setBusy(true)
    try {
      setMessage(undoSummary(await undoBatch({ api, batch })))
      await load()
    } catch (err) {
      show(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (schemaMissing) {
    return (
      <div className="max-w-2xl rounded border border-amber-300 bg-amber-50 p-4 text-sm">
        <p className="font-semibold">DB 업데이트(phase5.sql) 실행이 필요합니다.</p>
        <p className="mt-1 text-gray-600">편집부에 요청해 주세요 — 안내: docs/setup-phase5.md</p>
      </div>
    )
  }
  if (!view) return <p className="text-gray-500">불러오는 중…</p>

  const proposedCount = view.columns.reduce((n, c) => n + c.proposed.length, 0)

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">자동 배치</h2>
        <span className="text-sm text-gray-400">
          미배치 후보 {input.works.length}편 · 대상 권 {input.volumes.length}개
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={handleReset} disabled={busy}
            className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">
            다시 계산
          </button>
          <button type="button" disabled={busy}
            onClick={() => downloadPlacementExcel({ bucket, columns: view.columns, held: view.held, holdReasons })}
            className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">
            엑셀로 저장
          </button>
          <button type="button" onClick={handleApply} disabled={busy || !proposedCount}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-40">
            적용
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
        <span className="text-sm font-medium text-gray-500">갈래 선택</span>
        {GENRE_BUCKETS.map(b => (
          <button
            key={b}
            type="button"
            onClick={() => setBucket(b)}
            className={`rounded-full border px-4 py-1.5 text-[15px] ${
              bucket === b
                ? 'border-blue-600 bg-blue-600 font-semibold text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {input.skippedVolumes.length > 0 && (
        <p className="mb-2 text-sm text-amber-700">
          교육과정기가 비어 있어 제외한 권: {input.skippedVolumes.map(v => `${v.number}권`).join(', ')} — 권 목록의 수정에서 설정하세요.
        </p>
      )}
      {(sheetError || input.sheetFallbackCount > 0) && (
        <p className="mb-2 text-sm text-amber-700">
          {sheetError
            ? '작품 DB 시트 연결 실패로 저장된 정보로 계산했습니다.'
            : `시트에서 찾지 못한 ${input.sheetFallbackCount}편은 후보 등록 때 저장된 교육과정으로 계산했습니다.`}
        </p>
      )}
      {message && (
        <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
          {message} <Link to="/compare" className="ml-1 text-blue-700 underline">권별 비교 보기</Link>
        </div>
      )}

      <div className="grid gap-4 pb-4 md:grid-cols-2 xl:grid-cols-4">
        {view.columns.map(col => (
          <section key={col.volume.id} aria-label={`${col.volume.number}권 배치안`} className="rounded border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
              <div className="font-semibold">{col.volume.number}권 {col.volume.title}</div>
              <div className="text-xs text-gray-500">
                {(col.volume.curricula || []).join('·')} · <span>기존 {col.existing.length} + 신규 {col.proposed.length}</span>
              </div>
            </div>
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
              {col.existing.map(e => (
                <li key={e.id} className="rounded px-2 py-1 text-sm text-gray-400">
                  {e.title} <span className="text-xs">{e.author}</span>
                </li>
              ))}
              {col.proposed.map(p => (
                <li key={p.work.workId} className="rounded border border-blue-200 bg-white px-2 py-1.5 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate font-medium">{p.work.title}</span>
                    <span className="shrink-0 text-xs text-gray-500">{p.work.author}</span>
                    <button type="button" aria-label={`${p.work.title} 빼기`} onClick={() => move(p.work.workId, null)}
                      className="shrink-0 text-xs text-gray-400 hover:text-red-500">빼기</button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {p.reasons.map(r => (
                      <span key={r} className={`rounded px-1 text-xs ${REASON_BADGE[r]}`}>{REASON_LABELS[r]}</span>
                    ))}
                    {p.warnings.includes('authorDup') && <span className="rounded bg-orange-100 px-1 text-xs text-orange-800">작가 중복</span>}
                    {p.warnings.includes('authorOver') && <span className="rounded bg-red-100 px-1 text-xs text-red-700">작가 3편 이상</span>}
                    {p.warnings.includes('ineligible') && <span className="rounded bg-red-100 px-1 text-xs text-red-700">⚠ 수록 이력 없음</span>}
                    <span className="ml-auto">
                      <VolumeSelect label={`${p.work.title} 권 이동`} work={p.work} value={col.volume.id}
                        volumes={input.volumes} onChange={vid => move(p.work.workId, vid)} />
                    </span>
                  </div>
                </li>
              ))}
              {!col.existing.length && !col.proposed.length && <li className="py-1 text-xs text-gray-300">없음</li>}
            </ul>
          </section>
        ))}
      </div>

      <section aria-label="보류함" className="mb-6 rounded border border-dashed border-gray-300 p-3">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">보류함 ({view.held.length})</h3>
        <ul className="space-y-1">
          {view.held.map(w => (
            <li key={w.workId} className="flex items-center gap-2 text-sm">
              <span className="font-medium">{w.title}</span>
              <span className="text-xs text-gray-500">{w.author}</span>
              <span className="text-xs text-amber-700">{UNPLACEABLE_LABELS[holdReasons.get(w.workId) || 'manual']}</span>
              <span className="ml-auto">
                <VolumeSelect label={`${w.title} 권 선택`} work={w} value={null}
                  volumes={input.volumes} onChange={vid => move(w.workId, vid)} />
              </span>
            </li>
          ))}
          {!view.held.length && <li className="text-xs text-gray-400">비어 있습니다</li>}
        </ul>
      </section>

      <section aria-label="적용 기록" className="rounded border border-gray-200 p-3">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">적용 기록</h3>
        <ul className="space-y-1">
          {batches.map(b => (
            <li key={b.id} className="flex items-center gap-3 text-sm">
              <span className="font-medium">{b.genre}</span>
              <span>{b.item_count}편</span>
              <span className="text-xs text-gray-500">{memberName[b.created_by] || '알 수 없음'} · {formatTime(b.created_at)}</span>
              {b.undone_at ? (
                <span className="ml-auto text-xs text-gray-400">되돌림 · {memberName[b.undone_by] || ''} {formatTime(b.undone_at)}</span>
              ) : (
                <button type="button" disabled={busy} onClick={() => handleUndo(b)}
                  className="ml-auto rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50">
                  되돌리기
                </button>
              )}
            </li>
          ))}
          {!batches.length && <li className="text-xs text-gray-400">아직 적용한 적이 없습니다</li>}
        </ul>
      </section>
    </div>
  )
}
```

- [ ] **Step 4: 라우트** — `src/App.jsx`

import 추가: `import AutoPlacePage from './board/AutoPlacePage.jsx'`
`<Route path="/compare" …/>` 아래에 추가: `<Route path="/auto-place" element={<AutoPlacePage />} />`

- [ ] **Step 5: 통과 확인** — Run: `npx vitest run src/tests/AutoPlacePage.test.jsx` → PASS 5건

- [ ] **Step 6: 전체 테스트** — Run: `npx vitest run` → 기존 135건 + 신규 전부 PASS

- [ ] **Step 7: 커밋**

```bash
git add src/board/AutoPlacePage.jsx src/App.jsx src/tests/AutoPlacePage.test.jsx
git commit -m "feat: 자동 배치 페이지 (미리보기·조정·적용·적용 기록·되돌리기)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 통합 검증과 배포 (컨트롤러가 직접 수행)

- [ ] **Step 1:** `npx vitest run` 전체 PASS, `npx vite build` 성공 확인.
- [ ] **Step 2:** 로컬 미리보기(dev 서버)에서 phase5.sql 미적용 상태로 `/auto-place` 안내 문구, 권 목록·갈래별 후보 화면이 깨지지 않는지 확인.
- [ ] **Step 3:** 사용자에게 `docs/setup-phase5.md`대로 **phase5.sql 실행 요청**, 결과표(시드 132 / 매칭 132 / 미매칭 없음) 확인.
- [ ] **Step 4:** `phase5` → master 병합(`git checkout master && git merge --no-ff phase5`), push → Actions 배포 성공 확인.
- [ ] **Step 5:** 운영 사이트에서 현대시 배치안 생성 확인(적용은 사용자 결정). 확인 후 `git tag phase5-done && git push origin phase5-done`.
- [ ] **Step 6:** 메모리(series-dashboard-project.md)에 5단계 완료 기록.
