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

test('ensureWorkId: 23505 경합이면 재조회로 기존 ID를 받는다', async () => {
  fromResults.push({ data: null, error: { code: '23505', message: 'duplicate' } }) // insert 실패
  fromResults.push({ data: { work_id: 'W000009' }, error: null })                 // 재조회 성공
  const id = await api.ensureWorkId(WORK, ['7차'], new Map())
  expect(id).toBe('W000009')
})
