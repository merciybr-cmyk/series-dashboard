// 갈래 후보 자동 배치 계산 (설계 2026-09-28 §2) — 화면과 분리된 순수 모듈.
// 규칙: 수록 교육과정이 겹치는 권에만 배치, 첫 수록 시기·콘셉트 태그 가점,
// 같은 권 같은 작가 감점(최대 2편), 권별 편수가 평균±3을 벗어나면 감점.
import { sortCurricula } from '../works/workKey.js'

// 2026-09-28 132편 시제품 검증으로 확정 (스펙 §2.3 가중치 조정 기록)
export const WEIGHTS = {
  base: 10,
  debut: 3,
  concept: 4,
  authorDup: -15,      // 같은 권에 같은 작가 2편째
  balanceBand: 3,      // 평균 ± 이 값까지는 감점 없음
  balancePenalty: -10, // 범위를 벗어난 1편당
}
export const AUTHOR_LIMIT = 2
const MAX_PASSES = 50
const EPS = 1e-9

export function firstCurriculum(curricula) {
  return sortCurricula(curricula || [])[0] ?? null
}

// 작품이 그 권의 교육과정기에 수록된 이력이 있는가
export function isEligible(work, volume) {
  const set = new Set(volume.curricula || [])
  return (work.curricula || []).some(c => set.has(c))
}

// 배치 근거: 'debut'(첫 수록 시기) / 'concept'(콘셉트 태그) / 둘 다 아니면 'balance'
export function reasonsFor(work, volume) {
  const r = []
  const first = firstCurriculum(work.curricula)
  if (first && (volume.curricula || []).includes(first)) r.push('debut')
  if ((work.conceptVolumeIds || []).includes(volume.id)) r.push('concept')
  return r.length ? r : ['balance']
}

function staticScore(work, volume) {
  const r = reasonsFor(work, volume)
  return WEIGHTS.base
    + (r.includes('debut') ? WEIGHTS.debut : 0)
    + (r.includes('concept') ? WEIGHTS.concept : 0)
}

const authorKey = (volumeId, author) => `${volumeId}|${author}`

// works: [{ workId, title, author, curricula, conceptVolumeIds }]  — 배치 대상(미배치 후보)
// volumes: [{ id, number, curricula }]                              — curricula 빈 권은 호출 전에 제외
// existing: [{ volumeId, workId, author, bucket, selection_status }] — 이미 배치된 행(모든 갈래)
// → { placements: [{ workId, volumeId, reasons, warnings }], unplaceable: [{ workId, reason }] }
export function autoPlace({ works, volumes, existing = [], bucket }) {
  const volumeById = new Map(volumes.map(v => [v.id, v]))
  const excludedPairs = new Set(
    existing.filter(e => e.selection_status === 'excluded').map(e => `${e.volumeId}|${e.workId}`),
  )
  const active = existing.filter(e => e.selection_status !== 'excluded' && volumeById.has(e.volumeId))

  // 상태: 권별 같은 갈래 편수, (권·작가)별 편수(모든 갈래)
  const size = new Map(volumes.map(v => [v.id, 0]))
  const authors = new Map()
  const countAuthor = (vid, a) => authors.get(authorKey(vid, a)) || 0
  const addAuthor = (vid, a, d) => authors.set(authorKey(vid, a), countAuthor(vid, a) + d)
  for (const e of active) {
    if (e.bucket === bucket) size.set(e.volumeId, size.get(e.volumeId) + 1)
    addAuthor(e.volumeId, e.author, 1)
  }
  const existingInBucket = [...size.values()].reduce((a, b) => a + b, 0)
  const avg = volumes.length ? (existingInBucket + works.length) / volumes.length : 0
  const lo = avg - WEIGHTS.balanceBand
  const hi = avg + WEIGHTS.balanceBand
  const outside = n => Math.max(0, lo - n) + Math.max(0, n - hi)
  const dupTerm = n => Math.max(0, n - 1)

  const options = new Map() // workId → 후보 권 id (권 번호순)
  for (const w of works) {
    options.set(w.workId, volumes
      .filter(v => isEligible(w, v) && !excludedPairs.has(`${v.id}|${w.workId}`))
      .sort((a, b) => a.number - b.number)
      .map(v => v.id))
  }

  const assign = new Map() // workId → volumeId
  const workById = new Map(works.map(w => [w.workId, w]))

  // w를 from(null이면 새로 배치)에서 to로 옮길 때의 점수 변화
  function moveDelta(w, from, to) {
    let d = staticScore(w, volumeById.get(to)) - (from ? staticScore(w, volumeById.get(from)) : 0)
    const nt = countAuthor(to, w.author)
    d += WEIGHTS.authorDup * (dupTerm(nt + 1) - dupTerm(nt))
    d += WEIGHTS.balancePenalty * (outside(size.get(to) + 1) - outside(size.get(to)))
    if (from) {
      const nf = countAuthor(from, w.author)
      d += WEIGHTS.authorDup * (dupTerm(nf - 1) - dupTerm(nf))
      d += WEIGHTS.balancePenalty * (outside(size.get(from) - 1) - outside(size.get(from)))
    }
    return d
  }
  function apply(w, from, to) {
    if (from) { size.set(from, size.get(from) - 1); addAuthor(from, w.author, -1) }
    size.set(to, size.get(to) + 1)
    addAuthor(to, w.author, 1)
    assign.set(w.workId, to)
  }
  const hasRoom = (vid, author) => countAuthor(vid, author) < AUTHOR_LIMIT

  // 1) 그리디: 후보 권이 적은 작품부터
  const unplaceable = []
  const order = [...works].sort((a, b) =>
    options.get(a.workId).length - options.get(b.workId).length || a.title.localeCompare(b.title, 'ko'))
  for (const w of order) {
    const opts = options.get(w.workId)
    if (!opts.length) { unplaceable.push({ workId: w.workId, reason: 'noEligibleVolume' }); continue }
    let best = null
    let bestD = -Infinity
    for (const vid of opts) {
      if (!hasRoom(vid, w.author)) continue
      const d = moveDelta(w, null, vid)
      if (d > bestD + EPS) { best = vid; bestD = d }
    }
    if (!best) { unplaceable.push({ workId: w.workId, reason: 'authorLimit' }); continue }
    apply(w, null, best)
  }

  // 2) 개선: 이동 → 맞교환을 점수가 오르는 동안 반복
  const placed = order.filter(w => assign.has(w.workId))
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false
    for (const w of placed) {
      for (const to of options.get(w.workId)) {
        const cur = assign.get(w.workId)
        if (to === cur || !hasRoom(to, w.author)) continue
        if (moveDelta(w, cur, to) > EPS) { apply(w, cur, to); improved = true }
      }
    }
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]
        const b = placed[j]
        const va = assign.get(a.workId)
        const vb = assign.get(b.workId)
        if (va === vb) continue
        if (!options.get(a.workId).includes(vb) || !options.get(b.workId).includes(va)) continue
        const d1 = moveDelta(a, va, vb)
        apply(a, va, vb)
        const d2 = moveDelta(b, vb, va)
        apply(b, vb, va)
        const ok = countAuthor(vb, a.author) <= AUTHOR_LIMIT && countAuthor(va, b.author) <= AUTHOR_LIMIT
        if (ok && d1 + d2 > EPS) { improved = true; continue }
        apply(b, va, vb) // 되돌림
        apply(a, vb, va)
      }
    }
    if (!improved) break
  }

  const placements = [...assign.entries()].map(([workId, volumeId]) => {
    const w = workById.get(workId)
    return {
      workId,
      volumeId,
      reasons: reasonsFor(w, volumeById.get(volumeId)),
      warnings: countAuthor(volumeId, w.author) >= 2 ? ['authorDup'] : [],
    }
  })
  return { placements, unplaceable }
}
