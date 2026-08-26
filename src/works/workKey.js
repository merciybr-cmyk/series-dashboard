// 작품 정규화 키와 works_registry 매칭 (설계 §3.2)
// 관계의 기준은 work_id이고, 이 키는 "시트 행 ↔ 레지스트리" 경계에서만 쓴다.

export function normText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function keyOf(title, authorBase) {
  return `${normText(title)}__${normText(authorBase)}`
}

export function workKeyOf(work) {
  return keyOf(work['작품명'], work._authorBase)
}

// registryRows: [{work_id, title, author_base, aliases:[{title,author_base}]}]
export function buildRegistryMap(registryRows) {
  const map = new Map()
  for (const row of registryRows) {
    map.set(keyOf(row.title, row.author_base), row.work_id)
    for (const a of row.aliases || []) {
      map.set(keyOf(a.title, a.author_base), row.work_id)
    }
  }
  return map
}

// 교육과정 정렬: 1차~7차 → 2007개정 → 2009개정 → 2015개정 → 2022개정 (2026-08-26 사용자 결정)
export function curriculumRank(c) {
  const cha = /^(\d+)차$/.exec(c)
  if (cha) return Number(cha[1])
  const rev = /^(\d{4})(개정)?$/.exec(c)
  if (rev) return 100 + Number(rev[1]) - 2000
  return 1000 // 미지의 값은 맨 뒤
}

export function sortCurricula(list) {
  return [...list].sort((a, b) => curriculumRank(a) - curriculumRank(b) || a.localeCompare(b))
}

export function curriculaOf(works, key) {
  const set = new Set()
  for (const w of works) {
    if (workKeyOf(w) === key && w['교육과정']) set.add(w['교육과정'])
  }
  return sortCurricula([...set])
}

export function snapshotOf(work, curricula = []) {
  return {
    title: work['작품명'],
    author: work['지은이'],
    genre: work['장르'],
    curriculum: curricula,
  }
}
