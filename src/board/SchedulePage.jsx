// 일정: 월간 캘린더 + 회의·마감 등록 (2026-08-26 사용자 결정)
// - 확인 대상자(attendee_ids)로 지정된 구성원의 홈 '내 할 일'에 뜬다
// - 수정은 삭제 후 재등록 (YAGNI)
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from './volumeApi.js'
import { ymd, monthGrid, eventsByDate, monthLabel } from './calendarUtils.js'
import MultiSelectDropdown from './MultiSelectDropdown.jsx'
import { useToast } from '../components/Toast.jsx'

const KIND_CHIP = { '회의': 'bg-blue-100 text-blue-800', '마감': 'bg-red-100 text-red-800' }
const MAX_CHIPS_PER_CELL = 3

export default function SchedulePage() {
  const today = useMemo(() => new Date(), [])
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() })
  const [selected, setSelected] = useState(ymd(today))
  const [schedules, setSchedules] = useState([])
  const [volumes, setVolumes] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const { show } = useToast()

  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('회의')
  const [volumeId, setVolumeId] = useState('')
  const [attendeeIds, setAttendeeIds] = useState([])

  const load = useCallback(() => {
    api.listSchedules().then(setSchedules).catch(err => show(err.message))
    api.listVolumes().then(setVolumes).catch(() => {})
    api.listMembers().then(setMembers).catch(() => {}).finally(() => setLoading(false))
  }, [show])

  useEffect(load, [load])

  const memberNameById = useMemo(() => Object.fromEntries(members.map(m => [m.id, m.name])), [members])
  const volumeById = useMemo(() => Object.fromEntries(volumes.map(v => [v.id, v])), [volumes])

  const weeks = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor])
  const eventsMap = useMemo(() => eventsByDate(schedules), [schedules])
  const todayYmd = ymd(today)

  function goMonth(delta) {
    setCursor(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  const selectedSchedules = (eventsMap.get(selected) || [])
  const [, selMo, selD] = selected.split('-').map(Number)

  async function handleToggleDone(s) {
    try {
      const updated = await api.updateSchedule(s.id, { done: !s.done })
      setSchedules(ss => ss.map(x => (x.id === updated.id ? updated : x)))
    } catch (err) {
      show(err.message)
    }
  }

  async function handleDelete(s) {
    if (!window.confirm('이 일정을 삭제할까요?')) return
    try {
      await api.deleteSchedule(s.id)
      setSchedules(ss => ss.filter(x => x.id !== s.id))
    } catch (err) {
      show(err.message)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return
    try {
      const created = await api.createSchedule({
        title: trimmedTitle,
        kind,
        due_date: selected,
        volume_id: volumeId || null,
        attendee_ids: attendeeIds,
      })
      setSchedules(ss => [...ss, created])
      setTitle('')
      setKind('회의')
      setVolumeId('')
      setAttendeeIds([])
    } catch (err) {
      show(err.message)
    }
  }

  if (loading) return <p className="text-gray-500">불러오는 중…</p>

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <button type="button" onClick={() => goMonth(-1)} aria-label="이전 달" className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100">◀</button>
        <h2 className="text-lg font-bold">{monthLabel(cursor.y, cursor.m)}</h2>
        <button type="button" onClick={() => goMonth(1)} aria-label="다음 달" className="rounded px-2 py-1 text-gray-500 hover:bg-gray-100">▶</button>
      </div>

      <table className="mb-6 w-full table-fixed border-collapse text-sm">
        <thead>
          <tr>
            {['일', '월', '화', '수', '목', '금', '토'].map(d => (
              <th key={d} className="pb-1 text-xs font-medium text-gray-400">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi}>
              {week.map(date => {
                const key = ymd(date)
                const inMonth = date.getMonth() === cursor.m
                const isToday = key === todayYmd
                const events = eventsMap.get(key) || []
                const shown = events.slice(0, MAX_CHIPS_PER_CELL)
                const extra = events.length - shown.length
                return (
                  <td key={key} className="border border-gray-100 p-0 align-top">
                    <button
                      type="button"
                      onClick={() => setSelected(key)}
                      className={`flex h-20 w-full flex-col items-start gap-0.5 overflow-hidden p-1 text-left ${selected === key ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      <span className={`text-xs ${isToday ? 'rounded-full ring-1 ring-blue-500 px-1' : inMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                        {date.getDate()}
                      </span>
                      {shown.map(ev => (
                        <span
                          key={ev.id}
                          className={`w-full truncate rounded px-1 text-[10px] ${ev.done ? 'line-through text-gray-400 bg-gray-100' : KIND_CHIP[ev.kind] || 'bg-gray-100 text-gray-700'}`}
                        >
                          {ev.title}
                        </span>
                      ))}
                      {extra > 0 && <span className="text-[10px] text-gray-400">+{extra}</span>}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="mb-2 font-semibold">{selMo}월 {selD}일 일정</h3>
      <ul className="mb-6 space-y-1">
        {selectedSchedules.map(s => {
          const vol = s.volume_id ? volumeById[s.volume_id] : null
          const attendeeNames = (s.attendee_ids || []).map(id => memberNameById[id]).filter(Boolean)
          return (
            <li key={s.id} className="flex items-center gap-2 rounded border border-gray-100 px-3 py-2 text-sm">
              <input
                type="checkbox"
                aria-label={`${s.title} 완료`}
                checked={!!s.done}
                onChange={() => handleToggleDone(s)}
              />
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${KIND_CHIP[s.kind] || 'bg-gray-100 text-gray-700'}`}>{s.kind}</span>
              <span className={`flex-1 ${s.done ? 'line-through text-gray-400' : ''}`}>{s.title}</span>
              {vol && <span className="shrink-0 text-xs text-gray-500">{vol.number}권</span>}
              {attendeeNames.length > 0 && (
                <span className="shrink-0 text-xs text-gray-500">{attendeeNames.join(', ')}</span>
              )}
              <button
                type="button"
                aria-label={`${s.title} 삭제`}
                onClick={() => handleDelete(s)}
                className="shrink-0 text-gray-300 hover:text-red-500"
              >✕</button>
            </li>
          )
        })}
        {!selectedSchedules.length && (
          <li className="text-sm text-gray-400">이 날짜에 등록된 일정이 없습니다</li>
        )}
      </ul>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4" title="수정은 삭제 후 재등록해 주세요">
        <div className="flex-1">
          <label className="block text-xs text-gray-500" htmlFor="schedule-title">일정 제목</label>
          <input id="schedule-title" aria-label="일정 제목" required value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full rounded border border-gray-300 px-2 py-1" />
        </div>
        <div>
          <label className="block text-xs text-gray-500" htmlFor="schedule-kind">종류</label>
          <select id="schedule-kind" aria-label="종류" value={kind} onChange={e => setKind(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1">
            <option value="회의">회의</option>
            <option value="마감">마감</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500" htmlFor="schedule-volume">관련 권</label>
          <select id="schedule-volume" aria-label="관련 권" value={volumeId} onChange={e => setVolumeId(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1">
            <option value="">없음</option>
            {volumes.map(v => (
              <option key={v.id} value={v.id}>{v.number}권 {v.title}</option>
            ))}
          </select>
        </div>
        <MultiSelectDropdown
          label="확인 대상자"
          options={members.map(m => m.name)}
          selected={attendeeIds.map(id => memberNameById[id]).filter(Boolean)}
          onChange={names => setAttendeeIds(members.filter(m => names.includes(m.name)).map(m => m.id))}
        />
        <button type="submit" className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white">
          일정 등록
        </button>
      </form>
    </div>
  )
}
