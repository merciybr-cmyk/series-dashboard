import { vi } from 'vitest'
import { planSave, runSave, countAttachments, attachmentText, resultSummary } from '../board/compareSave.js'
import { EMPTY_DRAFT, moveRow, removeRow, addWork } from '../board/compareEdit.js'

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
    expect(api.updateVolumeWork).toHaveBeenCalledWith('a', { volume_id: 'v2', part_id: 'q2', sort_order: 40 })
    expect(api.ensureWorkId).toHaveBeenCalledWith(SHEET, ['7차'], expect.any(Map))
    expect(api.insertPlacedWork).toHaveBeenCalledWith({
      volumeId: 'v2', workId: 'W100', workSnapshot: { title: '돌다리' }, partId: 'q2', batchId: null, sortOrder: 50,
    })
    expect(result).toEqual({ removed: 2, moved: 1, added: 1, skipped: [], failed: [] })
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
  expect(resultSummary({ moved: 7, added: 3, removed: 2 })).toBe('반영했습니다: 옮기기 7 · 넣기 3 · 빼기 2')
})
