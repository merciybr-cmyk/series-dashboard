import { buildSheetIndex, freshSnapshot, freshenRows } from '../works/freshSnapshot.js'

const row = (교육과정, 작품명, 지은이, 장르 = '고전운문') => ({ 교육과정, 작품명, 지은이, _authorBase: 지은이, 장르 })

// 시트에서 '청산은 어찌하여'를 '도산십이곡'으로 고쳐 1차~5차 행이 합쳐진 상황
const SHEET = [
  row('1차', '도산십이곡', '이황'),
  row('5차', '도산십이곡', '이황'),
  row('6차', '도산십이곡', '이황'),
  row('7차', '도산십이곡 발', '이황'),
]
const REG = { work_id: 'W000150', title: '도산십이곡', author_base: '이황', aliases: [] }
const OLD = { title: '도산십이곡', author: '이황', genre: '고전운문', curriculum: ['6차'] }

test('시트에 합쳐진 행의 교육과정까지 반영한다', () => {
  const snap = freshSnapshot(OLD, REG, buildSheetIndex(SHEET))
  expect(snap.curriculum).toEqual(['1차', '5차', '6차'])
  expect(snap.title).toBe('도산십이곡')
})

test('별칭 행도 교육과정에 더한다', () => {
  const reg = { ...REG, aliases: [{ title: '도산십이곡 발', author_base: '이황' }] }
  expect(freshSnapshot(OLD, reg, buildSheetIndex(SHEET)).curriculum).toEqual(['1차', '5차', '6차', '7차'])
})

test('지은이 표기가 바뀌면 시트 값을 쓴다', () => {
  const sheet = [row('3차', '찬기파랑가', '충담사')]
  const reg = { work_id: 'W000129', title: '찬기파랑가', author_base: '충담사', aliases: [] }
  const old = { title: '찬기파랑가', author: '충담사(양주동 옮김)', genre: '고전운문', curriculum: ['3차'] }
  expect(freshSnapshot(old, reg, buildSheetIndex(sheet)).author).toBe('충담사')
})

test('저장된 갈래가 시트에 없으면(예: 세분화 전 고전산문) 시트 갈래로', () => {
  const sheet = [row('7차', '구운몽', '김만중', '고전소설')]
  const reg = { work_id: 'W001134', title: '구운몽', author_base: '김만중', aliases: [] }
  const old = { title: '구운몽', author: '김만중', genre: '고전산문', curriculum: ['7차'] }
  expect(freshSnapshot(old, reg, buildSheetIndex(sheet)).genre).toBe('고전소설')
})

test('시트에서 못 찾거나 registry가 없으면 저장된 snapshot 그대로', () => {
  const index = buildSheetIndex(SHEET)
  expect(freshSnapshot(OLD, { ...REG, title: '없는 작품' }, index)).toBe(OLD)
  expect(freshSnapshot(OLD, undefined, index)).toBe(OLD)
})

test('freshenRows: 권 수록 행과 업무 행의 중첩 volume_works를 바꾼다', () => {
  const index = buildSheetIndex(SHEET)
  const byId = new Map([[REG.work_id, REG]])
  const vw = { id: 'vw1', work_id: 'W000150', work_snapshot: OLD }
  const task = { id: 't1', volume_works: vw }
  const [a, b] = freshenRows([vw, task], byId, index)
  expect(a.work_snapshot.curriculum).toEqual(['1차', '5차', '6차'])
  expect(b.volume_works.work_snapshot.curriculum).toEqual(['1차', '5차', '6차'])
  expect(vw.work_snapshot).toBe(OLD) // 원본은 건드리지 않는다
})
