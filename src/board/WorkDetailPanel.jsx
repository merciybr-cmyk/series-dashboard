// 작품 상세 패널 (설계 §5.1): 정보 / 선정 / 제작(업무 체크리스트) / 이력
import { useEffect, useMemo, useState } from 'react'
import { SELECTION_LABELS, PRODUCTION_LABELS, TASK_PRESETS } from './constants.js'
import { tasksProgress, daysUntil, dDayLabel } from './boardUtils.js'
import { listActivityFor } from './volumeApi.js'

function Section({ title, children }) {
  return (
    <section className="border-t border-gray-100 px-4 py-3">
      <h4 className="mb-2 text-xs font-semibold text-gray-400">{title}</h4>
      {children}
    </section>
  )
}

export default function WorkDetailPanel({ volumeWork: vw, tasks, members, duplicates, actions, onClose }) {
  const [adding, setAdding] = useState(false)
  const [picked, setPicked] = useState([])       // 프리셋 type 배열
  const [customTitle, setCustomTitle] = useState('')
  const [note, setNote] = useState(vw.note || '')
  const [activity, setActivity] = useState([])

  useEffect(() => { setNote(vw.note || '') }, [vw.id, vw.note])

  useEffect(() => {
    listActivityFor([vw.id, ...tasks.map(t => t.id)]).then(setActivity).catch(() => setActivity([]))
  }, [vw.id, vw.updated_at, tasks])

  const { done, total } = tasksProgress(tasks)
  const allDone = total > 0 && done === total
  const snap = vw.work_snapshot

  const nextOrder = useMemo(() => (tasks.length ? Math.max(...tasks.map(t => t.sort_order ?? 0)) + 10 : 10), [tasks])

  function submitTasks() {
    const items = []
    let order = nextOrder
    for (const p of TASK_PRESETS) {
      if (picked.includes(p.type)) {
        items.push({ task_type: p.type, title: p.label, sort_order: order })
        order += 10
      }
    }
    if (customTitle.trim()) {
      items.push({ task_type: 'custom', title: customTitle.trim(), sort_order: order })
    }
    if (items.length) actions.addTasks(vw.id, items)
    setPicked([])
    setCustomTitle('')
    setAdding(false)
  }

  return (
    <aside className="flex h-full w-96 shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white">
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="flex-1">
          <h3 className="text-lg font-bold">{snap.title}</h3>
          <p className="text-sm text-gray-500">{snap.author} · {snap.genre}</p>
          <p className="text-xs text-gray-400">교육과정: {(snap.curriculum || []).join(', ') || '-'}</p>
          {duplicates.length > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              다른 권 수록: {duplicates.map(d => `${d.volumeNumber}권(${SELECTION_LABELS[d.selection_status]})`).join(', ')}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label="닫기" className="text-gray-400 hover:text-gray-700">✕</button>
      </div>

      <Section title="선정">
        <div className="mb-2 flex items-center gap-2">
          <label className="text-sm" htmlFor="sel-status">선정 상태</label>
          <select id="sel-status" value={vw.selection_status}
            onChange={e => actions.setVolumeWork(vw.id, { selection_status: e.target.value })}
            className="rounded border border-gray-300 px-2 py-1 text-sm">
            {Object.entries(SELECTION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          onBlur={() => note !== (vw.note || '') && actions.setVolumeWork(vw.id, { note })}
          placeholder="선정 메모 (선정 이유, 논의 내용)"
          rows={2}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </Section>

      <Section title={`제작 진행 ${total ? `(${done}/${total})` : ''}`}>
        <div className="mb-2 flex items-center gap-2">
          <label className="text-sm" htmlFor="prod-status">제작 상태</label>
          <select id="prod-status" value={vw.production_status}
            onChange={e => actions.setVolumeWork(vw.id, { production_status: e.target.value })}
            className="rounded border border-gray-300 px-2 py-1 text-sm">
            {Object.entries(PRODUCTION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          {total > 0 && <span className="text-sm text-gray-500">{done}/{total}</span>}
        </div>

        {allDone && vw.production_status !== 'completed' && (
          <div className="mb-2 flex items-center gap-2 rounded bg-blue-50 px-2 py-1.5 text-xs text-blue-800">
            모든 업무가 완료되었습니다.
            <button type="button" onClick={() => actions.setVolumeWork(vw.id, { production_status: 'completed' })}
              className="rounded bg-blue-600 px-2 py-0.5 font-medium text-white">완료로 변경</button>
          </div>
        )}

        <ul className="space-y-1">
          {tasks.map(t => (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                aria-label={t.title}
                checked={t.status === 'done'}
                onChange={() => actions.setTask(t.id, { status: t.status === 'done' ? 'todo' : 'done' })}
              />
              <span className={`flex-1 truncate ${t.status === 'done' ? 'text-gray-400 line-through' : ''}`}>{t.title}</span>
              <select
                value={t.assignee_id || ''}
                aria-label={`${t.title} 담당자`}
                onChange={e => actions.setTask(t.id, { assignee_id: e.target.value || null })}
                className="w-20 rounded border border-gray-200 px-1 py-0.5 text-xs"
              >
                <option value="">담당자</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
              <input
                type="date"
                value={t.due_date || ''}
                aria-label={`${t.title} 마감일`}
                onChange={e => actions.setTask(t.id, { due_date: e.target.value || null })}
                className="rounded border border-gray-200 px-1 py-0.5 text-xs"
              />
              {t.due_date && t.status !== 'done' && (
                <span className={`text-xs ${daysUntil(t.due_date) < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                  {dDayLabel(daysUntil(t.due_date))}
                </span>
              )}
              <button type="button" aria-label={`${t.title} 삭제`}
                onClick={() => actions.removeTask(t.id)}
                className="text-xs text-gray-300 hover:text-red-500">✕</button>
            </li>
          ))}
        </ul>

        {adding ? (
          <div className="mt-2 rounded border border-gray-200 p-2">
            <div className="grid grid-cols-2 gap-1">
              {TASK_PRESETS.map(p => (
                <label key={p.type} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={picked.includes(p.type)}
                    onChange={() => setPicked(ps => ps.includes(p.type) ? ps.filter(x => x !== p.type) : [...ps, p.type])} />
                  {p.label}
                </label>
              ))}
            </div>
            <input
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              placeholder="직접 입력 (선택)"
              className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={submitTasks}
                className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white">선택한 업무 추가</button>
              <button type="button" onClick={() => setAdding(false)} className="text-sm text-gray-500">취소</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            className="mt-2 rounded border border-dashed border-gray-300 px-3 py-1 text-sm text-gray-500 hover:border-gray-400">
            업무 추가
          </button>
        )}
      </Section>

      <Section title="최근 변경">
        <ul className="space-y-1 text-xs text-gray-500">
          {activity.map(a => (
            <li key={a.id}>
              {new Date(a.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {' · '}{a.table_name === 'work_tasks' ? '업무' : '작품'} {a.action === 'insert' ? '추가' : a.action === 'delete' ? '삭제' : '변경'}
            </li>
          ))}
          {!activity.length && <li className="text-gray-300">기록 없음</li>}
        </ul>
      </Section>

      <div className="mt-auto px-4 py-3">
        <button
          type="button"
          onClick={() => { if (window.confirm('이 작품을 권에서 제거할까요? (이력에 남습니다)')) { actions.removeWork(vw.id); onClose() } }}
          className="text-xs text-red-400 underline hover:text-red-600"
        >
          권에서 제거
        </button>
      </div>
    </aside>
  )
}
