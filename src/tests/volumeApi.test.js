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

test('createPart: 번호 기반 sort_order로 insert한다', async () => {
  fromResults.push({ data: { id: 'p1', number: 2, sort_order: 20 }, error: null })
  const part = await api.createPart('v1', 2)
  expect(part.number).toBe(2)
  expect(mockSupabase.from).toHaveBeenCalledWith('volume_parts')
})

test('addWorkToVolume: partId를 part_id로 넘긴다 (미지정이면 null)', async () => {
  fromResults.push({ data: { work_id: 'W000001' }, error: null }) // registry insert
  fromResults.push({ data: { id: 'vw1', part_id: 'p1' }, error: null }) // volume_works insert
  const row = await api.addWorkToVolume({
    volumeId: 'v1', work: WORK, curricula: [], registryMap: new Map(), sortOrder: 10, partId: 'p1',
  })
  expect(row.part_id).toBe('p1')
})

test('deleteVolume/deletePart/updatePart가 존재한다', () => {
  expect(typeof api.deleteVolume).toBe('function')
  expect(typeof api.deletePart).toBe('function')
  expect(typeof api.updatePart).toBe('function')
})

test('addComment: volume_work_id와 body로 insert한다', async () => {
  fromResults.push({ data: { id: 'c1', body: '좋은 선정입니다' }, error: null })
  const c = await api.addComment('vw1', '좋은 선정입니다')
  expect(c.body).toBe('좋은 선정입니다')
  expect(mockSupabase.from).toHaveBeenCalledWith('work_comments')
})

test('의견·비교 API가 존재한다', () => {
  expect(typeof api.listComments).toBe('function')
  expect(typeof api.deleteComment).toBe('function')
  expect(typeof api.listAllParts).toBe('function')
})

test('전역 조회·자료 API가 존재한다', () => {
  for (const fn of ['listAllTasks', 'listAllFiles', 'listActivity', 'listFiles', 'uploadFile', 'addFileLink', 'deleteFile', 'getFileUrl']) {
    expect(typeof api[fn]).toBe('function')
  }
})

test('uploadFile: storage 업로드 성공 시 files에 insert한다', async () => {
  mockSupabase.storage = {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ error: null }),
    })),
  }
  fromResults.push({ data: { id: 'f1', kind: 'upload', name: '해제.hwp' }, error: null })
  const row = await api.uploadFile('vw1', { name: '해제.hwp', size: 1000 })
  expect(row.kind).toBe('upload')
  expect(mockSupabase.storage.from).toHaveBeenCalledWith('attachments')
})

test('uploadFile: 한글 파일명은 스토리지 키에서 ASCII로 치환된다', async () => {
  const upload = vi.fn().mockResolvedValue({ error: null })
  mockSupabase.storage = {
    from: vi.fn(() => ({ upload })),
  }
  fromResults.push({ data: { id: 'f2', kind: 'upload', name: '해제_소나기.hwp' }, error: null })
  await api.uploadFile('vw1', { name: '해제_소나기.hwp', size: 100 })
  const [path] = upload.mock.calls[0]
  expect(path).toMatch(/^vw1\/\d+_[\w.-]+$/)
})

test('addFileLink: http(s)가 아닌 URL은 거부한다', async () => {
  await expect(api.addFileLink('vw1', 'x', 'javascript:alert(1)')).rejects.toThrow('http')
})
