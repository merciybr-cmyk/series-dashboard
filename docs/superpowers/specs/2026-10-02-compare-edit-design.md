# 권별 비교에서 넣기·빼기·옮기기 — 설계 문서

- 작성일: 2026-10-02
- 상태: 사용자 승인(대화), 문서 검토 대기
- 배경: 후보 348편에 태그가 모두 달렸고(2026-10-02) 위원들이 권 보드에 직접 넣은 작품이 많아, 권 사이 균형을 보며 조정할 일이 늘었다. 지금 권별 비교(`/compare`)는 읽기 전용이라 조정하려면 권 보드를 하나씩 오가야 한다. 사용자 요청: 비교 화면에서 작품을 넣고·빼고·옮기고, 저장하면 권별 작품 목록(권 보드)에도 반영.
- 브랜치 `compare-edit`.

## 0. 결정 요약 (사용자 확정)

| 항목 | 결정 |
|---|---|
| 저장 방식 | **편집 모드 → 화면에 모아 두었다가 저장 시 한 건씩 반영(A안)**. 저장 직전 최신 상태를 다시 읽어 그사이 바뀐 작품은 건너뜀. DB 변경(SQL) 없음 |
| 옮기기 | **끌어다 놓기 + 작품 메뉴(⋯)** 병행. 권 간·같은 권 부 간 모두 |
| 넣기 | **검색 패널 재사용**(권 보드의 `SearchPane`), '갈래 후보만'·'미배치만' 기본 ON. **평소 닫힘, '작품 넣기'를 누를 때만 오른쪽에 좁게(약 320px)** 열림 — 열린 동안 격자 열 수를 남은 폭에 맞춰 줄임 |
| 빼기 | **권에서 지우기**(행 삭제). 작품은 갈래별 후보에 남아 미배치로 돌아감. 업무·의견·자료가 딸린 작품은 확인 창에서 경고 |
| 드래그 구현 | `@dnd-kit/core` (포인터·터치패드, 스크롤 영역 자동 스크롤) |
| 경고 표시 범위 | 수록 이력 없음·부와 갈래 다름·같은 작가 3편 이상 경고는 **편집 모드가 아닐 때도** 표시 |

권 보드 반영: 권별 비교와 권 보드는 같은 `volume_works`를 읽으므로 저장 즉시 반영된다(권 보드는 기존 Realtime 구독으로 열려 있는 화면도 갱신). 별도 동기화 코드 없음.

## 1. 데이터 — 바뀌는 것 없음

- 옮기기 = `volume_works` 행의 `volume_id`·`part_id`·`sort_order` update. 행 id가 그대로라 `work_tasks`·`work_comments`·`files`(모두 `volume_work_id` 참조)와 `selection_status`가 따라간다.
- 빼기 = 행 delete. `work_tasks`·`work_comments`는 cascade 삭제, `files.volume_work_id`는 set null(기존 권 보드 삭제와 같은 동작).
- 넣기 = 기존 `addWorkToVolume`과 같은 insert(`ensureWorkId`로 registry 확보, snapshot은 `snapshotOf(work, curricula)`).
- 제약: `unique(volume_id, work_id)` — 같은 권 같은 작품 1행. RLS는 `is_member()` 전원 허용(기존).
- 운영 현황(2026-10-02): 8개 권 모두 부 3개(1부 시·2부 소설·3부 수필·극), 업무·의견·자료 0건, 제외 상태 행 0건.

## 2. 화면

### 2.1 보기 모드 (기존 + 경고)

기존 화면 그대로. 추가: 작품 줄에 경고 뱃지(§4.2) — 편집 모드가 아닐 때도 표시. 상단 바에 **편집** 버튼.

### 2.2 편집 모드

- **편집**을 누르면 데이터를 새로 읽고(기준 상태 = baseline 저장), 편집 모드로 들어간다.
- 상단 바(sticky): `편집 중 · 바뀐 작품 N건  [작품 넣기] [취소] [저장]`. '확정만 보기'와 '엑셀로 저장'은 편집 중 숨김.
- 편집 중에는 다른 사람의 변경을 화면에 반영하지 않는다(재조회 없음). 저장 시 다시 읽는다(§3).
- 작품 줄: 왼쪽 끌기 손잡이(⋮⋮), 오른쪽 `⋯` 메뉴 버튼. 권 머리의 권 보드 링크는 편집 중 비활성(실수로 나가지 않게).

### 2.3 옮기기

- **끌어다 놓기**: 작품 줄을 잡아 어떤 권의 부 그룹(부 띠 또는 그 아래 목록 영역)에 놓는다. 놓인 부로 옮겨진다. 같은 부에 놓으면 변화 없음. 부 안 순서는 다루지 않는다(비교 화면은 부 안을 고전 → 현대 순으로 보여 주므로).
- 미배정 그룹(빨간 띠)은 놓을 곳이 아니다 — 옮길 때는 반드시 부를 고른다. 부가 없는 권은 그 권 열 전체가 놓을 곳(part_id null).
- **메뉴(⋯)**: '옮길 곳' — 권 select → 부 select(부 기본값은 작품 갈래의 부, §4.2 규칙), [옮기기]. '권에서 빼기'. 바뀐 작품이면 '되돌리기'.
- 끌기 중 놓을 수 없는 권(§4.1)은 열 테두리가 빨갛게 표시되고, 놓으면 무시하고 토스트로 이유를 알린다.

### 2.4 넣기 — 검색 패널

- **작품 넣기**를 누르면 오른쪽에 약 320px 패널이 열린다(다시 누르거나 패널의 닫기로 닫음). `SearchPane` 재사용: `pickKeys`로 '갈래 후보만' 기본 ON, **'미배치만'도 기본 ON**(비교 화면에서 열 때). 미배치 판정은 편집 중 상태 기준(넣기·빼기·옮기기 반영).
- 결과 줄을 끌어 부에 놓거나, 줄의 **넣기** 버튼 → 작은 메뉴(권 select, 부 select — 부 기본값은 갈래의 부)로 넣는다.
- 패널이 열린 동안 격자는 컨테이너 폭 기준으로 열 수를 정한다(Tailwind v4 컨테이너 쿼리): 1열 → `@2xl` 2열 → `@4xl` 3열 → `@7xl` 4열. 패널이 닫혀 있으면 지금과 같은 폭(1366px 노트북 4열 유지).
- 시트 작품 데이터(`useWorksData`)·registry·picks는 패널을 처음 열 때 불러온다(보기 모드 첫 화면 속도 유지). 시트 로드 실패 시 패널 안에 오류와 '다시 시도'.

### 2.5 바뀐 곳 표시

- 옮겨 온 작품: 파란 왼쪽 줄 + `3권에서`(같은 권 부 이동이면 `2부에서`).
- 넣은 작품: 초록 `새로`.
- 뺀 작품: 원래 자리에 취소선 + `되돌리기` 버튼. 편수·비율·겹침 계산에서는 빠진다.
- 편수·고전/현대 비율·구성 요약표·겹침(노란 배경)·경고 뱃지는 편집 중 상태로 즉시 다시 계산.
- 되돌리기: 옮긴 작품은 원래 권·부로, 넣은 작품은 목록에서 사라짐, 뺀 작품은 복원.

### 2.6 이번에 하지 않는 것

부 안 순서 바꾸기, 선정 상태 바꾸기, 부 추가·이름 바꾸기, 여러 작품 한꺼번에 끌기, 같은 작품을 다른 권에 복사(한 작품 여러 권 수록은 권 보드에서).

## 3. 저장

### 3.1 확인 창

- **저장** → 확인 창: `옮기기 7 · 넣기 3 · 빼기 2` + 작품별 줄("〈돌다리〉 5권 2부 → 7권 2부", "〈괜찮아〉 → 8권 3부 (새로)", "〈수필〉 1권 3부에서 빼기").
- 빼는 작품에 업무·의견·자료가 있으면 빨간 글씨 "업무 2건·의견 1건이 함께 지워집니다 / 자료 1건은 작품 연결이 끊겨 자료실로 갑니다". 확인 창을 열 때 `listAttachmentRefs`로 조회.
- 경고(§4.2)가 걸린 작품은 줄에 ⚠ 표시.
- [저장] / [돌아가기(계속 편집)].

### 3.2 반영 절차

1. 최신 `volume_works`(`listAllVolumeWorks`)·`volume_parts`(`listAllParts`)를 다시 읽는다.
2. **계획 세우기**(순수 함수 `planSave`): 편집 내용 + baseline + 최신 상태 → 실행 목록과 건너뜀 목록.
   - 빼기: 행이 최신에 있으면 delete 대상. 없으면 "이미 빠짐"(성공으로 셈).
   - 옮기기: 최신 행의 `volume_id`·`part_id`가 baseline과 같을 때만 대상. 행이 없거나 위치가 달라졌으면 건너뜀("그사이 다른 분이 옮기거나 뺐습니다"). 대상 부가 최신에 없으면(삭제됨) 건너뜀.
   - 넣기: 대상 권에 같은 작품(work_id, 또는 registry에 없던 작품은 키)이 최신에 있으면 건너뜀("그사이 같은 작품이 들어왔습니다").
   - `sort_order`: 대상 권의 최신 최댓값 뒤로 차례로(기존 `nextSortOrder` 관례, 10 간격).
3. **실행** 순서: 빼기 → 옮기기 → 넣기. 빼기를 먼저 해 같은 작품 자리를 비운다. 옮기기가 `23505`(같은 권 같은 작품)로 실패하면 뒤로 미뤄 한 번 더 시도(다른 옮기기가 자리를 비우는 경우). 그래도 실패하면 실패 목록.
4. 한 건이 실패해도 나머지는 계속한다. 결과를 모은다.
5. 결과 표시: "옮기기 7 · 넣기 3 · 빼기 2를 반영했습니다." + 건너뜀·실패 목록(작품명과 이유). 화면을 새로 읽고 편집 모드를 끝낸다. 실패한 작품은 다시 편집해 저장.

### 3.3 홈 '최근 활동' 문구

- `log_activity`의 update 기록은 바뀐 칸만 담는다(`diff.volume_id = [이전, 새]`). 홈은 이미 `listVolumes`·`listAllVolumeWorks`를 불러오므로, `describeActivity`/`groupActivity`에 선택 인자 `ctx = { volumeNumberOf(id), titleOfVw(id) }`를 넘긴다.
- `volume_works` update에 `diff.volume_id`가 있으면: "「돌다리」을(를) 7권으로 옮겼습니다"(제목을 모르면 "작품을 7권으로 옮겼습니다", 권 번호를 모르면 "다른 권으로").
- 묶기: 같은 사람이 10분 안에 연달아 한 같은 종류(volume_works 추가 / 제거 / 권 옮기기)는 "「돌다리」 외 6편을 옮겼습니다"처럼 한 줄로(기존 같은 문구 묶기 규칙을 종류 단위로 확장). 자동 배치 묶음 규칙은 그대로.

## 4. 막는 것과 경고

### 4.1 막기 (옮기기·넣기 불가)

- 대상 권에 같은 작품이 있으면(편집 중 상태 기준, 제외 상태 행 포함 — DB unique 때문) 끌어 놓기·메뉴·검색 패널 넣기 모두 불가. 끌기 중 열 테두리 빨강, 메뉴의 권 select에 `(이미 있음)` 비활성. 토스트: "이미 3권에 있는 작품입니다"(제외 행이면 "3권에 제외 상태로 있습니다. 권 보드에서 지운 뒤 옮겨 주세요").
- 같은 작품 판정: 기존 행은 `work_id`. 검색 패널 작품은 registry 맵(별칭 포함)으로 `work_id`를 찾고, 없으면(registry 미등록) 편집 중 넣기 목록끼리만 키로 비교.

### 4.2 경고 (막지 않음, 작품 줄 ⚠ 뱃지 + 확인 창)

순수 함수 `compareWarnings(rows, volumes, parts)` → 행 id별 경고 목록. 편집 모드·보기 모드 공통.

| 경고 | 조건 | 표시 |
|---|---|---|
| 수록 이력 없음 | `work_snapshot.curriculum`과 권 `curricula`가 둘 다 비어 있지 않고 교집합 없음 | `⚠ 수록 이력 없음` |
| 부와 갈래 다름 | 기대 부 번호 = `partNumberFor(bucketOf(genre), genre)`가 null 아님, 행의 부가 있고 부 번호 ≠ 기대값 | `⚠ 부 확인` (툴팁: "소설은 보통 2부") |
| 같은 작가 3편 이상 | 같은 권(제외·뺀 행 제외)에 `isKnownAuthor` 작가가 3편 이상 | `⚠ 작가 3편` |

제외 상태 행과 편집 중 뺀 행은 경고 계산에서 뺀다.

### 4.3 나가기 방지

- 편집 중 바뀐 작품이 1건 이상이면: 다른 메뉴·뒤로 가기 → 확인 창 "저장하지 않은 변경 N건이 있습니다. 나가면 사라집니다."(`useBlocker`), 새로고침·탭 닫기 → 브라우저 기본 확인(`beforeunload`).
- `useBlocker`는 데이터 라우터가 필요하므로 `App.jsx`의 `HashRouter` + `<Routes>`를 `createHashRouter` + `RouterProvider`로 바꾼다(라우트 구성·경로·`AuthCallback` 캐치올 동작은 그대로).
- 편집 모드의 **취소**도 바뀐 것이 있으면 같은 확인 창.

## 5. 구조

| 단위 | 역할 |
|---|---|
| `src/board/compareEdit.js` (신규, 순수) | 편집 상태(draft: `moves` Map 행id→{volumeId, partId}, `removes` Set, `adds` 배열) 리듀서 동작 — `moveRow`·`removeRow`·`addWork`·`revert`·`changeCount`; `effectiveRows(baseline, draft)` → 화면용 행(표시 플래그 `_moved{fromVolumeId, fromPartId}`·`_added`·`_removed` 포함); `canPlace(rows, workRef, volumeId)` → `{ ok, reason }`; `defaultPartFor(genre, parts)` |
| `src/board/compareSave.js` (신규) | `planSave({ draft, baseline, latestRows, latestParts })` 순수 → `{ removes, moves, adds, skipped }`; `runSave(plan, api)` → `{ done: {moved, added, removed}, skipped, failed }` (23505 옮기기 1회 재시도) |
| `src/board/compareUtils.js` | `buildCompareColumns`가 `_removed` 행을 표시하되 편수·비율에서 제외; `volumesByWork`도 `_removed` 제외; `compareWarnings` 추가 |
| `src/board/ComparePage.jsx` | 보기/편집 모드, 상단 바, 경고 뱃지, 확인 창·결과 표시. 커지면 `CompareEditBar.jsx`·`CompareWorkRow.jsx`·`SaveDialog.jsx`로 분리 |
| `src/board/SearchPane.jsx` | 선택 props 추가: `defaultOnlyUnplaced`(기본 false), `renderAction(work, getCurricula)`(주면 '추가' 버튼 대신 그 노드 — 비교 화면은 '넣기' 메뉴), `itemComponent`(결과 줄 `<li>`를 대신 그리는 컴포넌트, props `itemKey·work·getCurricula·className·children` — 비교 화면은 끌기 가능한 줄). 교육과정 목록은 결과마다 미리 계산하지 않고 `getCurricula()`로 필요할 때 계산. 기존 호출부 동작 불변 |
| `src/board/homeUtils.js` | §3.3 문구·묶기, `ctx` 선택 인자 |
| `src/pages/HomePage.jsx` | `ctx` 만들어 넘김 |
| `src/App.jsx` | 데이터 라우터 전환 |
| 의존성 | `@dnd-kit/core` 추가 |

registry·picks·duplicatesByKey·pickKeys 배선은 `VolumeBoardPage`·`GenrePicksPage`와 같은 계산이 세 번째로 필요해진다 — 이번에 `src/board/useWorkLookup.js` 훅(registry·picks 로드, `registryMap`·`pickKeys`·키→수록처 맵)으로 뽑아 비교 화면에서 쓰고, 기존 두 화면은 이번 범위에서 바꾸지 않는다(회귀 위험 최소화, 추후 정리).

## 6. 오류 처리

| 상황 | 처리 |
|---|---|
| 편집 진입 시 재조회 실패 | 토스트, 편집 모드 진입 안 함 |
| 저장 직전 재조회 실패 | 토스트, 편집 모드 유지(편집 내용 보존) — 다시 저장 가능 |
| 저장 중 일부 실패 | 나머지 계속, 실패 목록 표시, 재조회 후 편집 종료 |
| 시트 로드 실패(검색 패널) | 패널 안 오류 + 다시 시도. 옮기기·빼기는 계속 가능 |
| 넣기 시 registry 등록 경합(23505) | 기존 `ensureWorkId`가 재조회로 처리 |
| 대상 부가 그사이 삭제됨 | 그 작품 건너뜀("부가 삭제되었습니다") |

## 7. 테스트 (vitest + RTL, 기존 217건에 추가)

- `compareEdit.test.js`: 옮기기·같은 부 놓기 무변화·빼기·넣기·되돌리기·원위치 옮기기는 변경 아님·`changeCount`; `canPlace`(같은 작품·제외 행·registry 미등록 키); `effectiveRows` 플래그; `defaultPartFor`.
- `compareSave.test.js`: `planSave` — 그사이 옮겨진/삭제된 행 건너뜀, 대상 권에 같은 작품 생김 건너뜀, 부 삭제 건너뜀, 이미 빠진 빼기는 성공, `sort_order` 이어 붙이기; `runSave` — 실행 순서(빼기→옮기기→넣기), 23505 옮기기 재시도, 실패 계속 진행.
- `compareUtils.test.js`: `compareWarnings` 3종(빈 curriculum·제외·뺀 행 무시, 미상 작가 무시), `_removed` 행 편수 제외.
- `ComparePage.test.jsx`(api 모킹): 편집 진입 → 메뉴로 옮기기 → 편수·표시 갱신 → 저장 확인 창 요약 → 저장 시 update 호출·결과 문구; 빼기 경고 문구(업무 있음); 이미 있는 권은 메뉴에서 비활성; 취소 시 확인; 보기 모드 경고 뱃지. 끌어다 놓기는 `onDragEnd` 처리 함수를 직접 호출해 검증(jsdom 포인터 드래그 대신).
- `homeUtils.test.js`: 권 옮기기 문구(제목·권 번호 있음/없음), 종류 단위 묶기.
- 라우터 전환 후 기존 테스트 전부 통과(스모크·인증 콜백 포함).

## 8. 진행 순서

브랜치 `compare-edit` → 구현 계획서(`docs/superpowers/plans/2026-10-02-compare-edit.md`) → 구현(TDD) → 전체 테스트·빌드 → 운영 데이터로 로컬 화면 확인 → 병합·배포 → 사용자 운영 확인.
