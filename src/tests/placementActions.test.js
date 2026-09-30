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

test('고전산문은 작품 갈래로 부를 정한다: 고전소설 2부, 고전수필·고전극 3부, 레거시 고전산문은 미배정', async () => {
  const prose = (workId, genre) => ({ workId, title: workId, snapshot: { title: workId, author: '', genre } })
  const items = [
    { work: prose('W1', '고전소설'), volumeId: 'v1' },
    { work: prose('W2', '고전수필'), volumeId: 'v1' },
    { work: prose('W3', '고전극'), volumeId: 'v1' },
    { work: prose('W4', '고전산문'), volumeId: 'v1' },
  ]
  const parts = [{ id: 'p2', volume_id: 'v1', number: 2 }]
  expect(plannedNewParts({ bucket: '고전산문', items, parts })).toEqual([{ volumeId: 'v1', number: 3 }])
  const api = fakeApi({ listAllParts: vi.fn().mockResolvedValue(parts) })
  const res = await applyPlacement({ api, bucket: '고전산문', items })
  expect(api.createPart).toHaveBeenCalledTimes(1)
  expect(api.createPart).toHaveBeenCalledWith('v1', 3, '수필·극')
  const partOf = id => api.insertPlacedWork.mock.calls.find(([a]) => a.workId === id)[0].partId
  expect([partOf('W1'), partOf('W2'), partOf('W3'), partOf('W4')]).toEqual(['p2', 'part-v1-3', 'part-v1-3', null])
  expect(res.createdParts).toBe(1)
})
