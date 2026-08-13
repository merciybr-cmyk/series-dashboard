// 한글 초성 추출 및 초성 검색 판별 유틸 (literature-db에서 이식)

const CHOSUNG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
]
const CHOSUNG_SET = new Set(CHOSUNG)
const HANGUL_BASE = 0xac00 // '가'
const HANGUL_LAST = 0xd7a3 // '힣'

// 문자열의 한글 음절을 초성으로 변환한다. 한글이 아닌 문자는 그대로 둔다.
export function toChosung(str) {
  if (!str) return ''
  let out = ''
  for (const ch of str) {
    const code = ch.charCodeAt(0)
    if (code >= HANGUL_BASE && code <= HANGUL_LAST) {
      out += CHOSUNG[Math.floor((code - HANGUL_BASE) / 588)]
    } else {
      out += ch
    }
  }
  return out
}

// 공백을 제외한 모든 글자가 초성 자모이면 true (초성 검색 의도로 판단)
export function isChosungQuery(str) {
  const compact = (str || '').replace(/\s/g, '')
  if (!compact) return false
  return [...compact].every(ch => CHOSUNG_SET.has(ch))
}
