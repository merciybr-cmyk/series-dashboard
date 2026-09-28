import fixture from './fixtures/modernPoetry132.json'
import { autoPlace, firstCurriculum, isEligible, reasonsFor, AUTHOR_LIMIT } from '../board/autoPlace.js'

const PLAN = { 1: ['1차', '2차', '3차'], 2: ['4차'], 3: ['5차'], 4: ['6차'], 5: ['7차'], 6: ['2007개정', '2009개정'], 7: ['2015개정'], 8: ['2022개정'] }
const VOLUMES = Object.entries(PLAN).map(([n, c]) => ({ id: `v${n}`, number: Number(n), curricula: c }))
const V = n => VOLUMES[n - 1]
const W = (workId, title, author, curricula, conceptVolumeIds = []) => ({ workId, title, author, curricula, conceptVolumeIds })

test('firstCurriculum: 차수 → 개정 순으로 가장 이른 값', () => {
  expect(firstCurriculum(['2015개정', '7차', '4차'])).toBe('4차')
  expect(firstCurriculum([])).toBeNull()
})

test('isEligible / reasonsFor', () => {
  const w = W('W1', '서시', '윤동주', ['4차', '2015개정'], ['v7'])
  expect(isEligible(w, V(2))).toBe(true)
  expect(isEligible(w, V(3))).toBe(false)
  expect(reasonsFor(w, V(2))).toEqual(['debut'])
  expect(reasonsFor(w, V(7))).toEqual(['concept'])
  expect(reasonsFor(W('W2', 'x', 'y', ['2015개정', '2022개정']), V(8))).toEqual(['balance'])
})

test('수록 이력 있는 권에만 배치하고, 없으면 noEligibleVolume', () => {
  const works = [W('W1', '서시', '윤동주', ['4차']), W('W2', '낯선 시', '작가', ['1995개정'])]
  const { placements, unplaceable } = autoPlace({ works, volumes: VOLUMES, existing: [], bucket: '현대시' })
  expect(placements).toEqual([{ workId: 'W1', volumeId: 'v2', reasons: ['debut'], warnings: [] }])
  expect(unplaceable).toEqual([{ workId: 'W2', reason: 'noEligibleVolume' }])
})

test('첫 수록 시기 권을 우선하고, 콘셉트 태그가 있으면 그 권을 우선한다', () => {
  const a = W('W1', '진달래꽃', '김소월', ['1차', '4차', '2022개정'])
  const b = W('W2', '산유화', '김소월2', ['1차', '4차', '2022개정'], ['v8'])
  const { placements } = autoPlace({ works: [a, b], volumes: VOLUMES, existing: [], bucket: '현대시' })
  const at = id => placements.find(p => p.workId === id).volumeId
  expect(at('W1')).toBe('v1') // debut +3
  expect(at('W2')).toBe('v8') // concept +4 > debut +3
})

test('같은 권 같은 작가는 피하고, 불가피하면 2편까지만 (authorDup 경고)', () => {
  const works = [
    W('W1', '가', '백석', ['6차']),
    W('W2', '나', '백석', ['6차']),
    W('W3', '다', '백석', ['6차']),
  ]
  const { placements, unplaceable } = autoPlace({ works, volumes: VOLUMES, existing: [], bucket: '현대시' })
  expect(placements).toHaveLength(2)
  expect(placements.every(p => p.volumeId === 'v4' && p.warnings.includes('authorDup'))).toBe(true)
  expect(unplaceable).toEqual([expect.objectContaining({ reason: 'authorLimit' })])
  expect(AUTHOR_LIMIT).toBe(2)
})

test('기존 배치의 작가(다른 갈래 포함)를 중복 계산에 넣는다', () => {
  const existing = [{ volumeId: 'v2', workId: 'X1', author: '윤동주', bucket: '현대수필·극', selection_status: 'candidate' }]
  const w = W('W1', '서시', '윤동주', ['4차', '5차'])
  const { placements } = autoPlace({ works: [w], volumes: VOLUMES, existing, bucket: '현대시' })
  expect(placements[0].volumeId).toBe('v3') // 2권에는 윤동주가 이미 있다
})

test("'제외'된 권에는 다시 제안하지 않고, 제외 행은 작가·편수 계산에서 뺀다", () => {
  const existing = [{ volumeId: 'v2', workId: 'W1', author: '윤동주', bucket: '현대시', selection_status: 'excluded' }]
  const w = W('W1', '서시', '윤동주', ['4차', '5차'])
  const { placements } = autoPlace({ works: [w], volumes: VOLUMES, existing, bucket: '현대시' })
  expect(placements[0].volumeId).toBe('v3')
})

test('편수가 평균±3을 벗어나지 않게 퍼뜨린다', () => {
  // 10편 모두 1권·2권 겸용, 1권이 첫 수록 — 균형 감점 없으면 전부 1권
  const works = Array.from({ length: 10 }, (_, i) => W(`W${i}`, `작품${i}`, `작가${i}`, ['1차', '4차']))
  const two = [V(1), V(2)]
  const { placements } = autoPlace({ works, volumes: two, existing: [], bucket: '현대시' })
  const n1 = placements.filter(p => p.volumeId === 'v1').length
  expect(n1).toBeLessThanOrEqual(5 + 3)
  expect(n1).toBeGreaterThanOrEqual(5)
})

test('같은 입력이면 같은 결과', () => {
  const works = fixture.map((f, i) => W(`W${i}`, f.title, f.author, f.curricula, f.conceptVolumes.map(n => `v${n}`)))
  const a = autoPlace({ works, volumes: VOLUMES, existing: [], bucket: '현대시' })
  const b = autoPlace({ works, volumes: VOLUMES, existing: [], bucket: '현대시' })
  expect(b).toEqual(a)
})

test('품질 기준: 현대시 132편 (스펙 §2.5)', () => {
  const works = fixture.map((f, i) => W(`W${i}`, f.title, f.author, f.curricula, f.conceptVolumes.map(n => `v${n}`)))
  const { placements, unplaceable } = autoPlace({ works, volumes: VOLUMES, existing: [], bucket: '현대시' })
  const byId = new Map(works.map(w => [w.workId, w]))
  expect(unplaceable).toEqual([])
  expect(placements).toHaveLength(132)
  expect(placements.filter(p => !isEligible(byId.get(p.workId), VOLUMES.find(v => v.id === p.volumeId)))).toEqual([])
  const dupPairs = new Set(placements.filter(p => p.warnings.includes('authorDup')).map(p => `${p.volumeId}|${byId.get(p.workId).author}`))
  expect(dupPairs.size).toBeLessThanOrEqual(2)
  expect(placements.filter(p => p.reasons.includes('debut')).length).toBeGreaterThanOrEqual(85)
  expect(placements.filter(p => p.reasons.includes('concept')).length).toBeGreaterThanOrEqual(110)
})
