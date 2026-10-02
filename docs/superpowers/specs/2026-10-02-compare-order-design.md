# 권별 비교 편집 — 부 안 수록 순서 바꾸기 설계

- 작성일: 2026-10-02
- 상태: 사용자 승인(대화)
- 선행: `2026-10-02-compare-edit-design.md`(편집 모드·넣기·빼기·옮기기, 배포됨 ea62493)
- 브랜치 `compare-order`

## 0. 결정 요약 (사용자 확정)

| 항목 | 결정 |
|---|---|
| 순서 범위 | **A안: 고전/현대 묶음 유지, 같은 묶음 안에서만 순서 변경.** 비교 화면은 지금처럼 부 안을 고전 → 현대(→ 기타)로 묶어 보여 준다 |
| 조작 | 끌어서 줄 위·아래에 놓기(파란 '들어갈 자리' 선) + ⋯ 메뉴 '위로'·'아래로'·'이 묶음 순서 되돌리기' |
| 다른 권·부로 옮길 때 | 같은 묶음의 줄 위에 놓으면 그 위치에 끼워 넣기. 부 띠·빈 곳·다른 묶음 줄 위에 놓으면 자기 묶음 맨 끝 |
| 표시 | 순서만 바뀐 작품에는 따로 표시를 달지 않는다. '바뀐 작품 N건'에는 **순서를 바꾼 묶음 하나 = 1건**으로 센다 |
| 저장 | 지금처럼 모았다가 한 번에. 확인 창에 `· 순서 N`, 줄은 "7권 2부 고전 — 순서 변경" |
| 끌기 구현 | 새 라이브러리 없이 지금의 포인터 기준 판정(`visiblePointerWithin`)을 넓힌다(@dnd-kit/sortable 쓰지 않음) |

## 1. 용어와 데이터

- **묶음(group)**: (권, 부, 시대) — 시대 = `eraOf(work_snapshot.genre) || '기타'`(고전/현대/기타). 키 `groupKeyOf(volumeId, partId, era)` = `` `${volumeId}|${partId ?? 'none'}|${era}` ``.
- `volume_works.sort_order`는 정수, 제약 없음. 권 보드는 부별로 sort_order 순, ↑↓는 이웃과 값을 맞바꾼다.
- DB·SQL 변경 없음. `log_activity`는 sort_order만 바뀐 update를 기록하지 않으므로 순서 변경은 홈 '최근 활동'에 남지 않는다.

## 2. 순서 번호 배정 규칙 (화면 표시와 저장이 같은 함수를 쓴다)

순수 함수 `assignSortOrders` (새 파일 `src/board/compareOrder.js`):

- 입력: 살아 있는 행(뺀 행 제외) `{ id, volume_id, part_id, sort_order, era, home }`, `orders`(묶음 키 → 원하는 행 id 순서), `freshStart(volumeId)`.
  - `home` = 이 행의 지금 sort_order가 지금 권의 유효한 자리 번호인가(편집 전부터 이 묶음에 있던 행). 다른 권·부에서 옮겨 온 행과 새로 넣은 행은 `home=false`.
- 묶음마다:
  1. **원하는 순서** = `orders[묶음]`이 있으면 그 목록에서 지금 구성원인 것만 남기고, 목록에 없는 구성원은 뒤에 붙인다(home은 sort_order 순, 그다음 home 아닌 행은 들어온 순서). 없으면 home을 sort_order 순으로, 그 뒤에 home 아닌 행.
  2. **자리 번호** = home 행들이 가진 sort_order(오름차순) + home 아닌 행 수만큼 **새 번호**(그 권의 `freshStart`부터 10씩, 권마다 하나의 계수기로 이어 받음).
  3. 원하는 순서의 i번째 행에 자리 번호 i번째를 준다.
- 결과: 행 id → sort_order. 권 보드에서 고전·현대가 섞여 있던 자리 배치는 유지된다(같은 묶음이 쓰던 번호만 서로 바뀜). 옮겨 오거나 넣은 작품은 그 권 맨 뒤 번호를 받아 묶음에 합류한다 — 순서 없이 옮긴 경우는 지금 동작(권 맨 뒤)과 같다.
- 새 번호를 나눠 주는 순서(결정적): home 아닌 행이 처음 나타나는 순서(옮기기 → 넣기, draft 순)대로 묶음을 처리하고, 묶음 안에서는 원하는 순서대로.
- `freshStart(v)` = 그 권에 남는 행(빼는 행 제외)의 `nextSortOrder` — 지금 `planSave`의 `takeOrder`와 같은 기준.

## 3. 편집 상태 (`compareEdit.js` 확장)

- `EMPTY_DRAFT`에 `orders: {}` 추가. 이전 draft(orders 없음)는 `{}`로 본다.
- `effectiveRows(baseline, draft)`: 지금 동작 + `assignSortOrders`로 화면용 sort_order를 다시 매긴다(home = 옮기지도 넣지도 않은 행). 화면은 기존 `buildCompareColumns`(sort_order 순 → 시대 묶기)를 그대로 쓴다.
- `groupOrder(rows, groupKey)`: 그 묶음의 지금 표시 순서(행 id 목록, 뺀 행 제외).
- `placeInGroup(draft, baseline, rowId, { anchorId, position })`: 행이 속한 지금 묶음에서 자기를 빼고 `anchorId`의 앞(`before`)/뒤(`after`)에 끼운다. anchor가 없거나 다른 묶음이면 맨 끝. 결과 목록을 `orders[묶음]`에 넣는다.
- `moveInGroup(draft, baseline, rowId, dir)`: 위(-1)/아래(+1) 한 칸. 끝이면 그대로.
- `revertGroupOrder(draft, groupKey)`: `orders[묶음]` 삭제.
- **정리(normalize)**: 모든 변경 뒤 `orders` 항목 중 "원하는 순서 = orders 없을 때의 순서"인 것은 지운다 → 원래대로 돌리면 '바뀐 작품'이 줄어든다.
- `changeCount` = 옮기기 + 빼기 + 넣기 + `orders` 항목 수.
- `describeDraft`: 기존 항목 뒤에 `{ kind: 'order', rowId: groupKey, title: null, to: '7권 2부 고전' }`.
- `resolveDrop` 확장: `over`에 `anchorId`·`position`이 오면, 옮기기/넣기 뒤 `placeInGroup`. 같은 묶음 안에서 놓으면 옮기기 없이 순서만. 자기 자신 위에 놓으면 변화 없음.
- **놓을 자리 해석** `resolveAnchor({ rows, era, selfId, over })`: anchor 행이 같은 (권, 부)이고 시대가 같으면 그대로, 아니면 그 (권, 부, 시대) 묶음의 마지막 행(자기 제외) 뒤, 묶음이 비면 anchor 없음. 화면의 파란 선과 실제 놓기가 같은 함수를 쓴다.

## 4. 저장 (`compareSave.js` 확장)

- `planSave`: 기존 판정(그사이 바뀐 행 건너뜀, 같은 작품, 부 삭제)은 그대로. 옮기기·넣기의 `sortOrder`는 `takeOrder` 대신 최신 상태로 `assignSortOrders`를 돌린 결과를 쓴다.
  - home = 최신 행 중 그대로 남는 행(빼지 않고 옮기지 않는 행). 옮겨 오는 행·넣는 행 = home 아님.
  - 묶음 구성원은 최신 상태 기준: 그사이 다른 분이 넣은 작품은 목록에 없으므로 묶음 뒤에 붙고, 그사이 빠진 작품은 목록에서 무시된다.
- 새 실행 항목 **순서 바꾸기** `reorders: [{ groupKey, label, ops: [{ id, title, sortOrder }] }]` — `orders`가 있는 묶음의 home 행 중 배정 번호가 최신 값과 다른 행만 op로 만든다(op 없는 묶음도 성공으로 센다).
- `runSave` 순서: 빼기 → 옮기기 → 넣기 → **순서 바꾸기**(`updateVolumeWork(id, { sort_order })`). 한 묶음의 op가 모두 성공하면 `reordered++`, 실패한 행은 `failed`.
- `resultSummary`: `반영했습니다: 옮기기 n · 넣기 n · 빼기 n · 순서 n`.
- 확인 창: 요약 `옮기기 n · 넣기 n · 빼기 n · 순서 n`, 순서 줄은 "7권 2부 고전 — 순서 변경".

## 5. 화면

- **줄도 놓을 곳**: 편집 중 살아 있는 작품 줄마다 놓을 곳 id `` `row-drop:${rowId}` ``, data `{ volumeId, partId, anchorId: rowId }`. 끌기 손잡이 줄과 같은 노드에 `useDraggable`·`useDroppable`을 함께 건다. 뺀 줄은 놓을 곳이 아니다(그 위에 놓으면 부 영역 → 맨 끝).
- **충돌 판정** `visiblePointerWithin`: 지금 규칙(포인터가 보이는 영역 안) 그대로, 결과 정렬만 바꿈 — 줄이 부보다 먼저. 줄이면 포인터 y가 줄 가운데보다 위면 `position: 'before'`, 아니면 `'after'`를 collision data에 싣는다.
- **들어갈 자리 선**: `onDragMove`/`onDragOver`에서 첫 collision으로 `resolveAnchor`를 돌려 `dropHint = { anchorId, position }`. 해당 줄에 파란 2px 선(위 또는 아래). anchor 없이 맨 끝이면 그 묶음 마지막 줄 아래, 묶음이 비면 선 없음(부 영역 파란 테두리는 지금처럼).
- **⋯ 메뉴**: '위로'·'아래로'(묶음 끝이면 비활성), 그 묶음에 순서 변경이 있으면 '이 묶음 순서 되돌리기'.
- 순서만 바뀐 줄에는 표시 없음.

## 6. 테스트

- `compareOrder.test.js`: 묶음 키, home 자리 재사용(섞인 배치 유지), 새 번호(권 맨 뒤·권마다 계수기), orders 없는 묶음 무변경, 목록에 없는 구성원 뒤에 붙이기, 결정적 배정.
- `compareEdit.test.js` 추가: placeInGroup(앞/뒤/끝), moveInGroup, revertGroupOrder, normalize로 원위치 시 0건, effectiveRows 화면 순서, resolveDrop(같은 묶음 순서만 / 다른 권 끼워 넣기 / 다른 시대 anchor → 끝), resolveAnchor, describeDraft order 항목.
- `compareSave.test.js` 추가: 끼워 넣은 옮기기의 sortOrder, 순서 바꾸기 ops(바뀐 행만), 그사이 들어온 작품은 뒤에, runSave 순서·reordered 집계, resultSummary.
- `CompareDnd.test.js` 추가: 줄 우선 정렬과 before/after.
- `ComparePageEdit.test.jsx` 추가: 메뉴 위로/아래로 → 표시 순서·'바뀐 작품 1건' → 되돌리기 → 0건; 저장 확인 창 '순서 1'·줄 문구; 저장 시 sort_order update 호출.
- 실제 브라우저 확인(운영 데이터 사본 미리보기): 같은 묶음 안 끌기, 다른 권 끼워 넣기, 파란 선 위치, 저장 요청 본문.

## 7. 하지 않는 것

시대 묶음을 넘는 순서(B안), 순서만 바뀐 줄 표시, 여러 줄 한꺼번에 끌기, 키보드 끌기.
