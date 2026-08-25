// 우측 수록 목록: 배지·진행률·마감 요약 + 필터 바 + 순서 이동
import { useMemo, useState } from 'react'
import { SELECTION_LABELS } from './constants.js'
import { tasksProgress, nearestDue, daysUntil, dDayLabel, filterVolumeWorks, groupByPart, partLabel } from './boardUtils.js'
import MultiSelectDropdown from './MultiSelectDropdown.jsx'

const SELECTION_BADGE = {
  candidate: 'bg-gray-100 text-gray-700',
  hold: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  excluded: 'bg-gray-200 text-gray-400 line-through',
}

export default function VolumeWorkList({ works, tasksByVw, members, parts = [], crossDups = new Map(), hasFiles = new Set(), selectedId, onSelect, onMove }) {
  const [selection, setSelection] = useState([])
  const [assignee, setAssignee] = useState([])
  const [dueSoon, setDueSoon] = useState(false)

  const memberNameById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m.name])), [members])

  const selectionKeys = Object.keys(SELECTION_LABELS)

  const filtered = useMemo(
    () => filterVolumeWorks(works, tasksByVw, {
      selection, assignee, dueSoon,
    }),
    [works, tasksByVw, selection, assignee, dueSoon],
  )

  const renderRow = vw => {
    const tasks = tasksByVw[vw.id] || []
    const { done, total } = tasksProgress(tasks)
    const due = nearestDue(tasks)
    return (
      <li
        key={vw.id}
        className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${selectedId === vw.id ? 'border-blue-400 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}
        onClick={() => onSelect(vw.id)}
      >
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">
            {vw.work_snapshot.title}
            {hasFiles.has(vw.id) && <span className="ml-1" title="자료 있음">📄</span>}
          </div>
          <div className="truncate text-xs text-gray-500">{vw.work_snapshot.author}</div>
        </div>
        {(crossDups.get(vw.work_id) || []).map(d => (
          <span key={d.volumeNumber}
            className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${d.selection_status === 'confirmed' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
            {d.volumeNumber}권 {SELECTION_LABELS[d.selection_status]}
          </span>
        ))}
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${SELECTION_BADGE[vw.selection_status]}`}>
          {SELECTION_LABELS[vw.selection_status]}
        </span>
        {total > 0 && <span className={`shrink-0 text-xs text-gray-600 ${vw.selection_status === 'excluded' ? 'opacity-40' : ''}`}>{done}/{total}</span>}
        {due && (
          <span className={`shrink-0 text-xs ${daysUntil(due) < 0 ? 'text-red-600' : 'text-gray-500'} ${vw.selection_status === 'excluded' ? 'opacity-40' : ''}`}>
            {dDayLabel(daysUntil(due))}
          </span>
        )}
        <span className="flex shrink-0 flex-col" onClick={e => e.stopPropagation()}>
          <button type="button" aria-label="위로" onClick={() => onMove(vw.id, 'up')} className="text-xs text-gray-400 hover:text-gray-700">▲</button>
          <button type="button" aria-label="아래로" onClick={() => onMove(vw.id, 'down')} className="text-xs text-gray-400 hover:text-gray-700">▼</button>
        </span>
      </li>
    )
  }

  const groups = groupByPart(filtered, parts)

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <MultiSelectDropdown label="선정 상태"
          options={selectionKeys.map(k => SELECTION_LABELS[k])}
          selected={selection.map(k => SELECTION_LABELS[k])}
          onChange={labels => setSelection(selectionKeys.filter(k => labels.includes(SELECTION_LABELS[k])))} />
        <MultiSelectDropdown label="담당자"
          options={members.map(m => m.name)}
          selected={assignee.map(id => memberNameById[id]).filter(Boolean)}
          onChange={names => setAssignee(members.filter(m => names.includes(m.name)).map(m => m.id))} />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={dueSoon} onChange={e => setDueSoon(e.target.checked)} /> 마감 임박
        </label>
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {groups.map((g, i) => (
          <li key={g.part ? g.part.id : `none-${i}`}>
            {parts.length > 0 && (
              <div className="mt-2 mb-1 border-b border-gray-100 pb-0.5 text-xs font-semibold text-gray-400">
                {g.part ? partLabel(g.part) : '미배정'}
              </div>
            )}
            <ul className="space-y-1">
              {g.works.map(renderRow)}
              {parts.length > 0 && !g.works.length && <li className="py-1 text-xs text-gray-300">이 부에 작품이 없습니다</li>}
            </ul>
          </li>
        ))}
        {!filtered.length && !parts.length && (
          <li className="py-8 text-center text-sm text-gray-400">표시할 작품이 없습니다</li>
        )}
      </ul>
    </div>
  )
}
