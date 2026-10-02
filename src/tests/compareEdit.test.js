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
