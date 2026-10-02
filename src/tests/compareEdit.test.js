import {
  EMPTY_DRAFT, changeCount, effectiveRows, moveRow, removeRow, revertRow, addWork,
  canPlace, placeErrorText, defaultPartFor, resolveDrop, toDropActive, describeDraft,
  groupOrder, placeInGroup, moveInGroup, revertGroupOrder, resolveAnchor,
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

  test('moveInGroup: 순서 번호가 겹친 묶음(a=10, b=10)도 위로 옮기면 순서가 바뀐다', () => {
    const T = [R('a', 'p2', 10, '소설'), R('b', 'p2', 10, '소설')]
    const d = moveInGroup(EMPTY_DRAFT, T, 'b', -1)
    expect(changeCount(d)).toBe(1)
    expect(groupOrder(effectiveRows(T, d), K)).toEqual(['b', 'a'])
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

  test('resolveAnchor: 자기 줄이 있는 부의 띠·빈 곳(줄 위가 아님)에 놓으면 null — 같은 부는 변화 없음', () => {
    const rows = effectiveRows(B, EMPTY_DRAFT)
    expect(resolveAnchor({ rows, era: '현대', selfId: 'a', over: { volumeId: 'v1', partId: 'p2' } })).toBeNull()
    // 다른 부의 띠면 그 묶음 마지막 줄 뒤, 끄는 줄이 없으면(검색 결과) 같은 부여도 마지막 줄 뒤
    expect(resolveAnchor({ rows, era: '현대', selfId: 'a', over: { volumeId: 'v1', partId: 'p1' } }))
      .toEqual({ anchorId: 'z', position: 'after' })
    expect(resolveAnchor({ rows, era: '현대', selfId: null, over: { volumeId: 'v1', partId: 'p2' } }))
      .toEqual({ anchorId: 'c', position: 'after' })
  })

  test('resolveDrop: 자기 부의 띠·빈 곳에 놓으면 변화 없음', () => {
    const r = drop({ type: 'row', rowId: 'a' }, { volumeId: 'v1', partId: 'p2' })
    expect(r.draft).toBe(EMPTY_DRAFT)
    expect(r.error).toBeNull()
  })

  test('resolveDrop: 같은 부의 다른 시대 줄 위에 놓으면 그래도 자기 묶음 맨 끝으로', () => {
    const { draft } = drop({ type: 'row', rowId: 'a' }, { volumeId: 'v1', partId: 'p2', anchorId: 'g', position: 'before' })
    expect(draft.moves).toEqual({})
    expect(order(draft)).toEqual(['b', 'c', 'a'])
  })

  test('resolveDrop: 다른 부의 띠에 놓으면 옮기고 그 묶음 맨 끝으로', () => {
    const { draft } = drop({ type: 'row', rowId: 'z' }, { volumeId: 'v1', partId: 'p2' })
    expect(draft.moves).toEqual({ z: { volumeId: 'v1', partId: 'p2' } })
    expect(order(draft)).toEqual(['a', 'b', 'c', 'z'])
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
