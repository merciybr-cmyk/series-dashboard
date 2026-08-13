// 시트 CSV 파서 (literature-db에서 이식)
import { toChosung } from './chosung.js'

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

export function extractAuthorBase(author) {
  if (!author) return ''
  return author.replace(/\(.*?\)/g, '').trim()
}

// 교과서명으로 과목을 도출한다. '문학' 포함이면 문학, 그 외는 국어.
export function subjectOf(work) {
  return (work['교과서명'] || '').includes('문학') ? '문학' : '국어'
}

// 검색용 파생 필드(작가 기준명·초성·과목)를 작품 객체에 부여한다.
export function withDerivedFields(work) {
  const authorBase = extractAuthorBase(work['지은이'])
  return {
    ...work,
    _authorBase: authorBase,
    _titleChosung: toChosung(work['작품명']),
    _authorChosung: toChosung(authorBase),
    _subject: subjectOf(work),
  }
}

export function parseCSV(csvText) {
  const lines = csvText.trim().split('\n')
  const headers = parseCSVLine(lines[0])

  return lines.slice(1).map(line => {
    const values = parseCSVLine(line)
    const work = {}
    headers.forEach((header, i) => {
      work[header] = values[i] || ''
    })
    return withDerivedFields(work)
  }).filter(w => w['작품명'])
}
