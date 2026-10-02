import { renderHook, waitFor, act } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({ listRegistry: vi.fn(), listPicks: vi.fn() }))
const api = await import('../board/volumeApi.js')
const { useWorkLookup, buildPickKeys, buildDuplicatesByKey } = await import('../board/useWorkLookup.js')
const { keyOf } = await import('../works/workKey.js')

const REG = [
  { work_id: 'W1', title: '소나기', author_base: '황순원', aliases: [{ title: '소나기(발췌)', author_base: '황순원' }] },
  { work_id: 'W2', title: '산유화', author_base: '김소월', aliases: [] },
]

test('buildPickKeys: 후보 작품의 시트 키(별칭 포함)', () => {
  expect([...buildPickKeys([{ work_id: 'W1' }], REG)]).toEqual([keyOf('소나기', '황순원'), keyOf('소나기(발췌)', '황순원')])
})

test('buildDuplicatesByKey: 화면 행 기준 — 뺀 행은 빼고, registry 없는 넣기 행은 자기 키로', () => {
  const rows = [
    { id: 'a', volume_id: 'v1', work_id: 'W1', selection_status: 'confirmed' },
    { id: 'b', volume_id: 'v2', work_id: 'W2', selection_status: 'candidate', _removed: true },
    { id: 'n1', volume_id: 'v2', work_id: null, _key: 'k9', selection_status: 'candidate', _added: true },
  ]
  const map = buildDuplicatesByKey(REG, rows, id => ({ v1: 1, v2: 2 })[id])
  expect(map.get(keyOf('소나기', '황순원'))).toEqual([{ volumeNumber: 1, volumeId: 'v1', selection_status: 'confirmed' }])
  expect(map.get(keyOf('소나기(발췌)', '황순원'))).toHaveLength(1)
  expect(map.has(keyOf('산유화', '김소월'))).toBe(false)
  expect(map.get('k9')).toEqual([{ volumeNumber: 2, volumeId: 'v2', selection_status: 'candidate' }])
})

test('useWorkLookup: 켜질 때 한 번만 불러오고 refresh로 다시 불러온다', async () => {
  api.listRegistry.mockResolvedValue(REG)
  api.listPicks.mockResolvedValue([{ work_id: 'W2' }])
  const { result, rerender } = renderHook(({ on }) => useWorkLookup(on), { initialProps: { on: false } })
  expect(api.listRegistry).not.toHaveBeenCalled()
  rerender({ on: true })
  await waitFor(() => expect(result.current.loaded).toBe(true))
  expect(result.current.registryMap.get(keyOf('산유화', '김소월'))).toBe('W2')
  expect(result.current.pickKeys.has(keyOf('산유화', '김소월'))).toBe(true)
  rerender({ on: true })
  expect(api.listRegistry).toHaveBeenCalledTimes(1)
  act(() => result.current.refresh())
  await waitFor(() => expect(api.listRegistry).toHaveBeenCalledTimes(2))
})

test('useWorkLookup: 실패하면 error를 알려 준다', async () => {
  api.listRegistry.mockRejectedValue(new Error('연결 실패'))
  api.listPicks.mockResolvedValue([])
  const { result } = renderHook(() => useWorkLookup(true))
  await waitFor(() => expect(result.current.error).toBe('연결 실패'))
  expect(result.current.loaded).toBe(false)
})
