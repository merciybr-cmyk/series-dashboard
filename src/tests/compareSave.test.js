import { vi } from 'vitest'
import { planSave, runSave, countAttachments, attachmentText, resultSummary } from '../board/compareSave.js'
import { EMPTY_DRAFT, moveRow, removeRow, addWork, moveInGroup, placeInGroup } from '../board/compareEdit.js'

const row = (id, volume_id, work_id, part_id, sort_order = 10) => ({
  id, volume_id, work_id, part_id, sort_order, selection_status: 'candidate', work_snapshot: { title: `작품${id}` },
})
const PARTS = [{ id: 'p1', volume_id: 'v1' }, { id: 'p2', volume_id: 'v1' }, { id: 'q1', volume_id: 'v2' }, { id: 'q2', volume_id: 'v2' }]
const BASE = [row('a', 'v1', 'W1', 'p1', 10), row('b', 'v1', 'W2', 'p2', 20), row('c', 'v2', 'W3', 'q2', 30)]
const SHEET = { '작품명': '돌다리', '지은이': '이태준', '장르': '소설', _authorBase: '이태준' }

describe('planSave', () => {
  test('그사이 바뀐 것이 없으면 옮기고, 옮겨 간 권의 맨 뒤 순서를 준다', () => {
    const draft = moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2')
    const plan = planSave({ draft, baseline: BASE, latestRows: BASE, latestParts: PARTS })
    expect(plan.moves).toEqual([{ id: 'a', title: '작품a', volumeId: 'v2', partId: 'q2', sortOrder: 40 }])
    expect(plan.skipped).toEqual([])
  })

  test('그사이 다른 분이 옮기거나 지운 행은 건너뛴다', () => {
    const draft = moveRow(moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2'), BASE, 'b', 'v2', 'q1')
    const latest = [row('a', 'v1', 'W1', 'p2'), row('c', 'v2', 'W3', 'q2', 30)] // a는 부가 바뀌었고 b는 지워짐
    const plan = planSave({ draft, baseline: BASE, latestRows: latest, latestParts: PARTS })
    expect(plan.moves).toEqual([])
    expect(plan.skipped).toEqual([
      { title: '작품a', reason: '그사이 다른 분이 옮기거나 뺐습니다' },
      { title: '작품b', reason: '그사이 다른 분이 옮기거나 뺐습니다' },
    ])
  })

  test('옮겨 갈 권에 그사이 같은 작품이 들어왔으면 건너뛴다', () => {
    const draft = moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2')
    const plan = planSave({ draft, baseline: BASE, latestRows: [...BASE, row('z', 'v2', 'W1', 'q1')], latestParts: PARTS })
    expect(plan.moves).toEqual([])
    expect(plan.skipped).toEqual([{ title: '작품a', reason: '그사이 같은 작품이 들어왔습니다' }])
  })

  test('같은 작품을 빼고 그 자리로 옮기는 조합은 허용한다', () => {
    const base = [...BASE, row('x', 'v2', 'W1', 'q1')]
    const draft = moveRow(removeRow(EMPTY_DRAFT, 'x'), base, 'a', 'v2', 'q1')
    const plan = planSave({ draft, baseline: base, latestRows: base, latestParts: PARTS })
    expect(plan.removes).toEqual([{ id: 'x', title: '작품x' }])
    expect(plan.moves.map(m => m.id)).toEqual(['a'])
  })

  test('빼기: 그사이 다른 분이 옮긴 행은 지우지 않고 건너뛴다', () => {
    const base = [...BASE, row('x', 'v2', 'W9', 'q1')]
    const draft = removeRow(EMPTY_DRAFT, 'x')
    const latest = [...BASE, row('x', 'v1', 'W9', 'p1')] // x를 다른 분이 1권 1부로 옮김
    const plan = planSave({ draft, baseline: base, latestRows: latest, latestParts: PARTS })
    expect(plan.removes).toEqual([])
    expect(plan.skipped).toEqual([{ title: '작품x', reason: '그사이 다른 분이 옮기거나 뺐습니다' }])
    expect(plan.alreadyRemoved).toBe(0)
  })

  test('빼기: 건너뛴 행은 그 자리를 계속 차지한다 (같은 작품 넣기는 막힌다)', () => {
    const base = [...BASE, row('x', 'v2', 'W9', 'q1')]
    let draft = removeRow(EMPTY_DRAFT, 'x')
    draft = addWork(draft, { tempId: 'n1', workId: 'W9', key: 'k9', work: SHEET, curricula: [], volumeId: 'v2', partId: 'q2' })
    const latest = [...BASE, row('x', 'v2', 'W9', 'q2')] // x가 같은 권 안에서 부만 바뀜
    const plan = planSave({ draft, baseline: base, latestRows: latest, latestParts: PARTS })
    expect(plan.removes).toEqual([])
    expect(plan.adds).toEqual([])
    expect(plan.skipped).toEqual([
      { title: '작품x', reason: '그사이 다른 분이 옮기거나 뺐습니다' },
      { title: '돌다리', reason: '그사이 같은 작품이 들어왔습니다' },
    ])
  })

  test('옮길 부가 삭제되었으면 건너뛰고, 이미 지워진 빼기는 성공으로 센다', () => {
    const draft = removeRow(moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2'), 'c')
    const latest = [row('a', 'v1', 'W1', 'p1'), row('b', 'v1', 'W2', 'p2')] // c는 이미 지워짐
    const plan = planSave({ draft, baseline: BASE, latestRows: latest, latestParts: PARTS.filter(p => p.id !== 'q2') })
    expect(plan.skipped).toEqual([{ title: '작품a', reason: '옮길 부가 삭제되었습니다' }])
    expect(plan.removes).toEqual([])
    expect(plan.alreadyRemoved).toBe(1)
  })

  test('넣기: 같은 작품이 있는 권은 건너뛰고, 나머지는 옮기기 다음 순서로', () => {
    let draft = moveRow(EMPTY_DRAFT, BASE, 'a', 'v2', 'q2')
    draft = addWork(draft, { tempId: 'n1', workId: 'W9', key: 'k9', work: SHEET, curricula: [], volumeId: 'v2', partId: 'q2' })
    draft = addWork(draft, { tempId: 'n2', workId: 'W3', key: 'k3', work: SHEET, curricula: [], volumeId: 'v2', partId: 'q1' })
    const plan = planSave({ draft, baseline: BASE, latestRows: BASE, latestParts: PARTS })
    expect(plan.moves[0].sortOrder).toBe(40)
    expect(plan.adds.map(a => [a.tempId, a.sortOrder])).toEqual([['n1', 50]])
    expect(plan.skipped).toEqual([{ title: '돌다리', reason: '그사이 같은 작품이 들어왔습니다' }])
  })
})

describe('runSave', () => {
  const makeApi = () => ({
    deleteVolumeWork: vi.fn().mockResolvedValue(),
    updateVolumeWork: vi.fn().mockResolvedValue({}),
    ensureWorkId: vi.fn().mockResolvedValue('W100'),
    insertPlacedWork: vi.fn().mockResolvedValue({ id: 'new' }),
  })

  test('빼기 → 옮기기 → 넣기 순서로 반영하고 결과를 센다', async () => {
    const calls = []
    const api = makeApi()
    api.deleteVolumeWork.mockImplementation(async id => { calls.push(`del ${id}`) })
    api.updateVolumeWork.mockImplementation(async id => { calls.push(`upd ${id}`); return {} })
    api.insertPlacedWork.mockImplementation(async ({ workId }) => { calls.push(`ins ${workId}`); return { id: 'n' } })
    const plan = {
      removes: [{ id: 'x', title: 'X' }],
      moves: [{ id: 'a', title: 'A', volumeId: 'v2', partId: 'q2', sortOrder: 40 }],
      adds: [{ tempId: 'n1', title: '돌다리', workId: null, work: SHEET, curricula: ['7차'], snapshot: { title: '돌다리' }, volumeId: 'v2', partId: 'q2', sortOrder: 50 }],
      skipped: [], alreadyRemoved: 1,
    }
    const result = await runSave(plan, api, { registryMap: new Map() })
    expect(calls).toEqual(['del x', 'upd a', 'ins W100'])
    expect(api.updateVolumeWork).toHaveBeenCalledWith('a', { volume_id: 'v2', part_id: 'q2', sort_order: 40, placement_batch_id: null })
    expect(api.ensureWorkId).toHaveBeenCalledWith(SHEET, ['7차'], expect.any(Map))
    expect(api.insertPlacedWork).toHaveBeenCalledWith({
      volumeId: 'v2', workId: 'W100', workSnapshot: { title: '돌다리' }, partId: 'q2', batchId: null, sortOrder: 50,
    })
    expect(result).toEqual({ removed: 2, moved: 1, added: 1, reordered: 0, skipped: [], failed: [] })
  })

  test('같은 작품 충돌로 실패한 옮기기는 한 번 더 시도하고, 다른 실패는 목록에 남기고 계속한다', async () => {
    const api = makeApi()
    let first = true
    api.updateVolumeWork.mockImplementation(async id => {
      if (id === 'a' && first) {
        first = false
        throw new Error('duplicate key value violates unique constraint "volume_works_volume_id_work_id_key"')
      }
      if (id === 'b') throw new Error('network down')
      return {}
    })
    api.insertPlacedWork.mockResolvedValue(null) // 그사이 같은 작품 → 건너뜀
    const plan = {
      removes: [],
      moves: [
        { id: 'a', title: 'A', volumeId: 'v2', partId: null, sortOrder: 10 },
        { id: 'b', title: 'B', volumeId: 'v2', partId: null, sortOrder: 20 },
      ],
      adds: [{ tempId: 'n1', title: '돌다리', workId: 'W9', work: SHEET, curricula: [], snapshot: {}, volumeId: 'v1', partId: null, sortOrder: 10 }],
      skipped: [{ title: 'C', reason: '그사이 다른 분이 옮기거나 뺐습니다' }], alreadyRemoved: 0,
    }
    const result = await runSave(plan, api, { registryMap: new Map() })
    expect(api.updateVolumeWork).toHaveBeenCalledTimes(3) // a 실패 → b 실패 → a 재시도 성공
    expect(result.moved).toBe(1)
    expect(result.failed).toEqual([{ title: 'B', reason: 'network down' }])
    expect(result.skipped).toEqual([
      { title: 'C', reason: '그사이 다른 분이 옮기거나 뺐습니다' },
      { title: '돌다리', reason: '그사이 같은 작품이 들어왔습니다' },
    ])
    expect(api.ensureWorkId).not.toHaveBeenCalled()
  })
})

test('countAttachments·attachmentText: 빼는 작품에 딸린 것 안내', () => {
  const counts = countAttachments({ tasks: ['a', 'a', 'b'], comments: ['a'], files: ['b'] })
  expect(counts.get('a')).toEqual({ tasks: 2, comments: 1, files: 0 })
  expect(attachmentText(counts.get('a'))).toBe('업무 2건·의견 1건이 함께 지워집니다')
  expect(attachmentText(counts.get('b'))).toBe('업무 1건이 함께 지워집니다 / 자료 1건은 작품 연결이 끊겨 자료실로 갑니다')
  expect(attachmentText(undefined)).toBe('')
})

test('resultSummary', () => {
  expect(resultSummary({ moved: 7, added: 3, removed: 2 })).toBe('반영했습니다: 옮기기 7 · 넣기 3 · 빼기 2 · 순서 0')
  expect(resultSummary({ moved: 0, added: 0, removed: 0, reordered: 2 })).toBe('반영했습니다: 옮기기 0 · 넣기 0 · 빼기 0 · 순서 2')
})

describe('순서 바꾸기 저장', () => {
  const R = (id, part_id, sort_order, genre) => ({
    id, volume_id: 'v1', work_id: `W${id}`, part_id, sort_order, selection_status: 'candidate',
    work_snapshot: { title: `작품${id}`, genre },
  })
  // 1권 2부: 현대 a(10) · 고전 g(20) · 현대 b(30) / 1권 1부: 현대 z(40)
  const B = [R('a', 'p2', 10, '소설'), R('g', 'p2', 20, '고전소설'), R('b', 'p2', 30, '소설'), R('z', 'p1', 40, '시')]
  const P = [{ id: 'p1', volume_id: 'v1' }, { id: 'p2', volume_id: 'v1' }]

  test('같은 묶음 순서만 바꾸면 번호가 달라지는 행만 고친다', () => {
    const draft = moveInGroup(EMPTY_DRAFT, B, 'b', -1)
    const plan = planSave({ draft, baseline: B, latestRows: B, latestParts: P })
    expect(plan.moves).toEqual([])
    expect(plan.reorders).toEqual([{
      groupKey: 'v1|p2|현대',
      ops: [{ id: 'b', title: '작품b', sortOrder: 10 }, { id: 'a', title: '작품a', sortOrder: 30 }],
    }])
  })

  test('다른 부에서 옮겨 와 끼워 넣으면 옮기는 행이 그 자리 번호를, 뒤 행이 권 맨 뒤 번호를 받는다', () => {
    const draft = placeInGroup(moveRow(EMPTY_DRAFT, B, 'z', 'v1', 'p2'), B, 'z', { anchorId: 'a', position: 'after' })
    const plan = planSave({ draft, baseline: B, latestRows: B, latestParts: P })
    expect(plan.moves).toEqual([{ id: 'z', title: '작품z', volumeId: 'v1', partId: 'p2', sortOrder: 30 }])
    expect(plan.reorders).toEqual([{ groupKey: 'v1|p2|현대', ops: [{ id: 'b', title: '작품b', sortOrder: 50 }] }])
  })

  test('그사이 다른 분이 그 묶음에 넣은 작품은 뒤에 붙는다', () => {
    const draft = moveInGroup(EMPTY_DRAFT, B, 'b', -1)
    const latest = [...B, R('n', 'p2', 60, '소설')]
    const plan = planSave({ draft, baseline: B, latestRows: latest, latestParts: P })
    expect(plan.reorders[0].ops).toEqual([{ id: 'b', title: '작품b', sortOrder: 10 }, { id: 'a', title: '작품a', sortOrder: 30 }])
  })

  test('runSave: 옮기기 뒤에 순서를 고치고, op가 모두 성공한 묶음(op 없는 묶음 포함)을 센다', async () => {
    const calls = []
    const api = {
      deleteVolumeWork: vi.fn(), ensureWorkId: vi.fn(), insertPlacedWork: vi.fn(),
      updateVolumeWork: vi.fn(async (id, patch) => { calls.push([id, patch]); return {} }),
    }
    const plan = {
      removes: [], adds: [], skipped: [], alreadyRemoved: 0,
      moves: [{ id: 'z', title: 'Z', volumeId: 'v1', partId: 'p2', sortOrder: 30 }],
      reorders: [{ groupKey: 'v1|p2|현대', ops: [{ id: 'b', title: 'B', sortOrder: 50 }] }, { groupKey: 'v1|p1|현대', ops: [] }],
    }
    const result = await runSave(plan, api, { registryMap: new Map() })
    expect(calls.map(c => c[0])).toEqual(['z', 'b'])
    expect(calls[1][1]).toEqual({ sort_order: 50 })
    expect(result.reordered).toBe(2)
  })

  test('runSave: 순서 op가 하나라도 실패하면 그 묶음은 세지 않고 실패 목록에 남긴다', async () => {
    const api = {
      deleteVolumeWork: vi.fn(), ensureWorkId: vi.fn(), insertPlacedWork: vi.fn(),
      updateVolumeWork: vi.fn(async id => { if (id === 'b') throw new Error('network down'); return {} }),
    }
    const plan = {
      removes: [], moves: [], adds: [], skipped: [], alreadyRemoved: 0,
      reorders: [{ groupKey: 'v1|p2|현대', ops: [{ id: 'a', title: 'A', sortOrder: 30 }, { id: 'b', title: 'B', sortOrder: 10 }] }],
    }
    const result = await runSave(plan, api, { registryMap: new Map() })
    expect(result.reordered).toBe(0)
    expect(result.failed).toEqual([{ title: 'B', reason: 'network down' }])
  })
})
