// 상태 라벨과 업무 프리셋 (설계 §4). 프리셋은 상수 배열 — 종류 추가는 여기만 고치면 된다.

export const SELECTION_LABELS = {
  candidate: '후보',
  hold: '보류',
  confirmed: '확정',
  excluded: '제외',
}

export const TASK_STATUS_LABELS = {
  todo: '예정',
  in_progress: '진행 중',
  review: '검토 중',
  done: '완료',
}

export const TASK_PRESETS = [
  { type: 'source', label: '작품 본문 확보' },
  { type: 'copyright', label: '저작권 확인' },
  { type: 'manuscript', label: '원고 집필' },
  { type: 'commentary', label: '해제 작성' },
  { type: 'extra', label: '부가 원고 작성' },
  { type: 'image', label: '이미지 확보' },
]
