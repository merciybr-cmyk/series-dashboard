// 작품 검색 필터 (literature-db filterWorks의 간소판: 교육과정·장르·검색어)
import { toChosung, isChosungQuery } from './chosung.js'

export function filterWorks(works, { curriculum = [], genre = [], query = '' } = {}) {
  const trimmedQuery = query.trim()
  const chosungMode = isChosungQuery(trimmedQuery)
  const q = trimmedQuery.toLowerCase()
  const cq = trimmedQuery.replace(/\s/g, '')

  return works.filter(work => {
    if (curriculum.length && !curriculum.includes(work['교육과정'])) return false
    if (genre.length && !genre.includes(work['장르'])) return false
    if (trimmedQuery) {
      if (chosungMode) {
        const titleCho = work._titleChosung ?? toChosung(work['작품명'])
        const authorCho = work._authorChosung ?? toChosung(work._authorBase ?? '')
        if (!titleCho.includes(cq) && !authorCho.includes(cq)) return false
      } else if (
        !work['작품명'].toLowerCase().includes(q) &&
        !(work._authorBase ?? '').toLowerCase().includes(q)
      ) {
        return false
      }
    }
    return true
  })
}

export function getUniqueValues(works, field) {
  return [...new Set(works.map(w => w[field]).filter(Boolean))].sort()
}
