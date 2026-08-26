// 갈래별 후보 분류 (2026-08-26 사용자 결정: 5개 버킷)
// 시트 갈래 → 버킷 매핑. 새 갈래가 시트에 생기면 여기에만 추가하면 된다.

export const GENRE_BUCKETS = ['현대시', '현대소설', '현대수필·극', '고전운문', '고전산문']

const GENRE_TO_BUCKET = {
  '시': '현대시',
  '소설': '현대소설',
  '수필': '현대수필·극',
  '극본': '현대수필·극',
  '고전운문': '고전운문',
  '시조': '고전운문',
  '고전산문': '고전산문',
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
