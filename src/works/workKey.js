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

export function curriculaOf(works, key) {
  const set = new Set()
  for (const w of works) {
    if (workKeyOf(w) === key && w['교육과정']) set.add(w['교육과정'])
  }
  return [...set].sort()
}

export function snapshotOf(work, curricula = []) {
  return {
    title: work['작품명'],
    author: work['지은이'],
    genre: work['장르'],
    curriculum: curricula,
  }
}
