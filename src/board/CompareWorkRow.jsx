// 권별 비교의 작품 한 줄 (2026-10-02 ComparePage에서 분리):
// 고전/현대·제목·작가 / 바뀐 표시(편집 중) / 경고 / 다른 권과 겹침 / 선정 상태
import { SELECTION_LABELS } from './constants.js'
import { eraOf } from './genreUtils.js'
import { WARNING_LABELS, expectedPartOf } from './compareUtils.js'

const SELECTION_BADGE = {
  candidate: 'bg-gray-100 text-gray-700',
  hold: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  excluded: 'bg-gray-200 text-gray-400 line-through',
}

// 겹침(노랑)·상태(파랑·회색) 색과 겹치지 않게 고전은 청록, 현대는 보라
const ERA_CHIP = {
  '고전': 'bg-teal-100 text-teal-800',
  '현대': 'bg-violet-100 text-violet-800',
  '기타': 'bg-gray-100 text-gray-500',
}

export function EraChip({ era }) {
  return <span className={`shrink-0 rounded px-1 py-0.5 text-xs ${ERA_CHIP[era]}`}>{era}</span>
}

function warningTitle(key, genre) {
  if (key === 'partMismatch') return `${genre}은(는) 보통 ${expectedPartOf(genre)}부`
  if (key === 'noHistory') return '이 권의 교육과정기에 수록된 이력이 없습니다'
  return '한 권에 같은 작가는 2편까지가 기준입니다'
}

export default function CompareWorkRow({
  row, others = [], warnings = [], fromLabel = null, leading = null, trailing = null, dragging = false, ref,
}) {
  const s = row.work_snapshot || {}
  const removed = !!row._removed
  const isDup = !removed && others.length > 0
  const cls = [
    'flex items-center gap-1.5 rounded px-1.5 py-1 text-sm',
    isDup ? 'bg-amber-50' : '',
    row._moved ? 'border-l-4 border-blue-500' : '',
    dragging ? 'opacity-40' : '',
  ].filter(Boolean).join(' ')
  return (
    <li ref={ref} className={cls}>
      {leading}
      <EraChip era={eraOf(s.genre) || '기타'} />
      <span title={`${s.title} ${s.author || ''}`.trim()} className={`min-w-0 flex-1 truncate ${removed ? 'text-gray-400 line-through' : ''}`}>
        <span>{s.title}</span>
        <span className="ml-1 text-xs text-gray-400">{s.author}</span>
      </span>
      {row._added && <span className="shrink-0 rounded bg-green-100 px-1 py-0.5 text-xs text-green-800">새로</span>}
      {fromLabel && <span className="shrink-0 text-xs text-blue-700">{fromLabel}</span>}
      {!removed && warnings.map(k => (
        <span key={k} title={warningTitle(k, s.genre)} className="shrink-0 rounded bg-red-50 px-1 py-0.5 text-xs text-red-700">
          ⚠ {WARNING_LABELS[k]}
        </span>
      ))}
      {isDup && <span className="shrink-0 text-xs text-amber-700">⚠ {others.join('·')}권</span>}
      <span className={`shrink-0 rounded px-1 py-0.5 text-xs ${SELECTION_BADGE[row.selection_status]}`}>
        {SELECTION_LABELS[row.selection_status]}
      </span>
      {trailing}
    </li>
  )
}
