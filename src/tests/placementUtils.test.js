import {
  PART_BY_BUCKET, curriculaIndex, curriculaForPick, buildPlacementInput, evaluateAssignment, splitUndoable,
} from '../board/placementUtils.js'
import { keyOf } from '../works/workKey.js'

const SHEET = [
  { '작품명': '서시', '지은이': '윤동주', _authorBase: '윤동주', '장르': '시', '교육과정': '4차' },
  { '작품명': '서시', '지은이': '윤동주', _authorBase: '윤동주', '장르': '시', '교육과정': '2015개정' },
]
const REGISTRY = [
  { work_id: 'W1', title: '서시', author_base: '윤동주', aliases: [] },
  { work_id: 'W2', title: '풀', author_base: '김수영', aliases: [] },
]
const VOLS = [
  { id: 'v2', number: 2, title: '정전', curricula: ['4차'] },
  { id: 'v7', number: 7, title: '온도', curricula: ['2015개정'] },
  { id: 'v9', number: 9, title: '미정', curricula: [] },
]
const pick = (id, workId, title, author, genre, curriculum, concept = []) =>
  ({ id, work_id: workId, work_snapshot: { title, author, genre, curriculum }, concept_volume_ids: concept })

test('PART_BY_BUCKET: 고전산문은 부 미배정', () => {
  expect(PART_BY_BUCKET['현대시']).toBe(1)
  expect(PART_BY_BUCKET['고전운문']).toBe(1)
  expect(PART_BY_BUCKET['현대소설']).toBe(2)
  expect(PART_BY_BUCKET['현대수필·극']).toBe(3)
  expect(PART_BY_BUCKET['고전산문']).toBeNull()
})

test('curriculaForPick: 시트 우선, 없으면 snapshot', () => {
  const index = curriculaIndex(SHEET)
  expect(index.get(keyOf('서시', '윤동주'))).toEqual(new Set(['4차', '2015개정']))
  expect(curriculaForPick(pick('p1', 'W1', '서시', '윤동주', '시', ['7차']), REGISTRY[0], index))
    .toEqual({ curricula: ['4차', '2015개정'], fromSheet: true })
  expect(curriculaForPick(pick('p2', 'W2', '풀', '김수영', '시', ['2015개정', '5차']), REGISTRY[1], index))
    .toEqual({ curricula: ['5차', '2015개정'], fromSheet: false })
})

test('buildPlacementInput: 갈래·미배치만 대상, 교육과정 빈 권 분리', () => {
  const picks = [
    pick('p1', 'W1', '서시', '윤동주', '시', ['4차'], ['v7']),
    pick('p2', 'W2', '풀', '김수영', '시', ['2015개정']),
    pick('p3', 'W3', '춘향전', '미상', '고전산문', ['4차']),
  ]
  const allVw = [{ id: 'r1', volume_id: 'v7', work_id: 'W2', selection_status: 'candidate', work_snapshot: { title: '풀', author: '김수영', genre: '시' } }]
  const input = buildPlacementInput({ picks, volumes: VOLS, allVw, registry: REGISTRY, sheetWorks: SHEET, bucket: '현대시' })
  expect(input.works.map(w => w.workId)).toEqual(['W1']) // W2는 배치됨, W3은 다른 갈래
  expect(input.works[0]).toMatchObject({ title: '서시', author: '윤동주', curricula: ['4차', '2015개정'], conceptVolumeIds: ['v7'] })
  expect(input.volumes.map(v => v.id)).toEqual(['v2', 'v7'])
  expect(input.skippedVolumes.map(v => v.id)).toEqual(['v9'])
  expect(input.existing[0]).toMatchObject({ volumeId: 'v7', workId: 'W2', author: '김수영', bucket: '현대시' })
  expect(input.sheetFallbackCount).toBe(0)
})

test("buildPlacementInput: '제외'로만 들어간 작품은 미배치로 본다", () => {
  const picks = [pick('p2', 'W2', '풀', '김수영', '시', ['2015개정'])]
  const allVw = [{ id: 'r1', volume_id: 'v7', work_id: 'W2', selection_status: 'excluded', work_snapshot: { title: '풀', author: '김수영', genre: '시' } }]
  const input = buildPlacementInput({ picks, volumes: VOLS, allVw, registry: REGISTRY, sheetWorks: [], bucket: '현대시' })
  expect(input.works.map(w => w.workId)).toEqual(['W2'])
  expect(input.sheetFallbackCount).toBe(1)
})

test('evaluateAssignment: 권별 열, 경고, 보류함', () => {
  const works = [
    { workId: 'W1', title: '서시', author: '윤동주', curricula: ['4차'], conceptVolumeIds: [] },
    { workId: 'W4', title: '자화상', author: '윤동주', curricula: ['4차'], conceptVolumeIds: [] },
    { workId: 'W5', title: '참회록', author: '윤동주', curricula: ['5차'], conceptVolumeIds: [] },
  ]
  const existing = [{ id: 'r1', volumeId: 'v2', workId: 'X', title: '별', author: '윤동주', bucket: '현대수필·극', selection_status: 'candidate' }]
  const assignment = new Map([['W1', 'v2'], ['W4', 'v2'], ['W5', null]])
  const { columns, held } = evaluateAssignment({ works, volumes: VOLS.slice(0, 2), existing, bucket: '현대시', assignment })
  expect(columns.map(c => c.volume.number)).toEqual([2, 7])
  expect(columns[0].existing).toEqual([]) // 다른 갈래 기존 행은 열에 안 보이지만 작가 수에는 들어간다
  expect(columns[0].proposed.map(p => p.work.title)).toEqual(['서시', '자화상'])
  expect(columns[0].proposed[0].warnings).toEqual(['authorOver']) // 기존 1 + 제안 2 = 3편
  expect(columns[0].total).toBe(2)
  expect(held.map(w => w.title)).toEqual(['참회록'])
  // 수록 이력 없는 권으로 옮기면 ineligible
  const moved = evaluateAssignment({ works, volumes: VOLS.slice(0, 2), existing: [], bucket: '현대시', assignment: new Map([['W5', 'v7']]) })
  expect(moved.columns[1].proposed[0]).toMatchObject({ reasons: [], warnings: ['ineligible'] })
})

test('splitUndoable: 상태 변경·업무·의견·자료가 있으면 남긴다', () => {
  const rows = [
    { id: 'a', selection_status: 'candidate' },
    { id: 'b', selection_status: 'confirmed' },
    { id: 'c', selection_status: 'candidate' },
    { id: 'd', selection_status: 'candidate' },
    { id: 'e', selection_status: 'candidate' },
  ]
  const { removable, kept } = splitUndoable(rows, { tasks: ['c'], comments: ['d'], files: ['e'] })
  expect(removable.map(r => r.id)).toEqual(['a'])
  expect(kept.map(k => [k.row.id, k.reason])).toEqual([['b', 'status'], ['c', 'tasks'], ['d', 'comments'], ['e', 'files']])
})

test('evaluateAssignment: 작자 미상은 작가 중복 경고를 달지 않는다', () => {
  const works = [
    { workId: 'A', title: '가시리', author: '', curricula: ['5차'], conceptVolumeIds: [] },
    { workId: 'B', title: '동동', author: '', curricula: ['5차'], conceptVolumeIds: [] },
    { workId: 'C', title: '서경별곡', author: '', curricula: ['5차'], conceptVolumeIds: [] },
  ]
  const vol = { id: 'v3', number: 3, title: '5차', curricula: ['5차'] }
  const assignment = new Map([['A', 'v3'], ['B', 'v3'], ['C', 'v3']])
  const { columns } = evaluateAssignment({ works, volumes: [vol], existing: [], bucket: '고전운문', assignment })
  expect(columns[0].proposed.map(p => p.warnings)).toEqual([[], [], []])
})
