// 갈래별 후보 분류 (2026-08-26 사용자 결정: 5개 버킷)
// 시트 갈래 → 버킷 매핑. 새 갈래가 시트에 생기면 여기에만 추가하면 된다.

export const GENRE_BUCKETS = ['현대시', '현대소설', '현대수필·극', '고전운문', '고전산문']

const GENRE_TO_BUCKET = {
  '시': '현대시',
  '시조': '현대시', // 레거시: 2026-08-26 시트에서 '시'로 통합됨. 통합 이전에 저장된 work_snapshot 호환용으로 유지
  '소설': '현대소설',
  '수필': '현대수필·극',
  '극본': '현대수필·극',
  '고전운문': '고전운문',
  '고전산문': '고전산문', // 레거시: 2026-09-30 시트에서 아래 세 갈래로 세분화됨. 이전 work_snapshot 호환용으로 유지
  '고전소설': '고전산문',
  '고전수필': '고전산문',
  '고전극': '고전산문',
}

// 매핑에 없는 갈래는 null → 화면에서 '기타'로 묶는다
export function bucketOf(genre) {
  return GENRE_TO_BUCKET[(genre || '').trim()] || null
}

// picks(work_snapshot.genre 보유) → { 버킷라벨: pick[] }. 미분류는 '기타'에.
export function groupPicksByBucket(picks) {
  const groups = Object.fromEntries(GENRE_BUCKETS.map(b => [b, []]))
  groups['기타'] = []
  for (const p of picks) {
    const bucket = bucketOf(p.work_snapshot?.genre) || '기타'
    groups[bucket].push(p)
  }
  return groups
}

// 고전/현대 구분 (2026-10-01 권별 비교): 버킷 이름이 '고전'으로 시작하면 고전, 그 밖에 분류된 갈래는 현대.
// 매핑에 없는 갈래는 null → 화면에서 '기타'로 센다.
export const ERAS = ['고전', '현대']

export function eraOf(genre) {
  const bucket = bucketOf(genre)
  if (!bucket) return null
  return bucket.startsWith('고전') ? '고전' : '현대'
}

// 부 안에서 고전 → 현대 → 미분류로 묶어 보여 준다. 묶음 안에서는 넘겨받은 순서(보드 순서)를 지킨다.
export function orderByEra(works) {
  const rank = w => {
    const era = eraOf(w.work_snapshot?.genre)
    return era ? ERAS.indexOf(era) : ERAS.length
  }
  return works.map((w, i) => [w, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([w]) => w)
}

// 편수·비율은 실제 책에 들어갈 작품 기준이라 '제외' 상태는 세지 않는다.
export function countEras(works) {
  const counts = { '고전': 0, '현대': 0, '기타': 0 }
  for (const w of works) {
    if (w.selection_status === 'excluded') continue
    counts[eraOf(w.work_snapshot?.genre) || '기타']++
  }
  return counts
}

export function eraSummary(counts) {
  return [...ERAS, '기타'].filter(k => counts[k] > 0).map(k => `${k} ${counts[k]}`).join(' · ')
}
