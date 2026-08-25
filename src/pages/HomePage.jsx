// 홈: 오늘 무엇을 해야 하는지 바로 보이는 화면 (설계 §5.2·§5.3)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider.jsx'
import * as api from '../board/volumeApi.js'
import {
  taskUrgency, urgencyIcon, sortMyTasks, buildAttention, volumeProgress, describeActivity,
} from '../board/homeUtils.js'
import { daysUntil, dDayLabel } from '../board/boardUtils.js'
import { useToast } from '../components/Toast.jsx'

function Card({ title, children }) {
  return (
    <section className="rounded border border-gray-200 p-4">
      <h3 className="mb-2 text-sm font-bold text-gray-700">{title}</h3>
      {children}
    </section>
  )
}

function taskLink(t) {
  return `/volumes/${t.volume_works?.volume_id}?vw=${t.volume_works?.id}`
}

export default function HomePage() {
  const { member } = useAuth()
  const { show } = useToast()
  const [data, setData] = useState(null)
  const debounceRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const [volumes, vworks, tasks, files, activity, members] = await Promise.all([
        api.listVolumes(), api.listAllVolumeWorks(), api.listAllTasks(),
        api.listAllFiles(), api.listActivity(20), api.listMembers(),
      ])
      setData({ volumes, vworks, tasks, files, activity, members })
    } catch (err) {
      show(err.message)
    }
  }, [show])

  useEffect(() => {
    load()
    const unsubscribe = api.subscribeBoard(() => {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(load, 300)
    })
    return () => { clearTimeout(debounceRef.current); unsubscribe() }
  }, [load])

  const computed = useMemo(() => {
    if (!data) return null
    const nameOf = id => data.members.find(m => m.id === id)?.name
    const myTasks = sortMyTasks(
      data.tasks.filter(t => t.assignee_id === member?.id && t.status !== 'done'),
    )
    const tasksByVw = {}
    for (const t of data.tasks) {
      const vwId = t.volume_works?.id
      if (vwId) (tasksByVw[vwId] ||= []).push(t)
    }
    const fileVwIds = new Set(data.files.map(f => f.volume_work_id))
    const attention = buildAttention(data.vworks, tasksByVw, fileVwIds)
    const upcoming = data.tasks
      .filter(t => t.status !== 'done' && t.due_date && daysUntil(t.due_date) >= 0 && daysUntil(t.due_date) <= 7)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
    const progress = volumeProgress(data.volumes, data.vworks, data.tasks)
    const feed = data.activity.map(e => ({
      id: e.id,
      when: new Date(e.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      text: describeActivity(e, nameOf),
    }))
    return { myTasks, attention, upcoming, progress, feed }
  }, [data, member])

  if (!computed) return <p className="text-gray-500">불러오는 중…</p>
  const { myTasks, attention, upcoming, progress, feed } = computed

  return (
    <div className="max-w-5xl space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="내 할 일">
          <ul className="space-y-1.5">
            {myTasks.map(t => (
              <li key={t.id}>
                <Link to={taskLink(t)} className="flex items-center gap-2 text-sm hover:underline">
                  <span>{urgencyIcon(taskUrgency(t.due_date))}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {t.volume_works?.volumes?.number}권 · 「{t.volume_works?.work_snapshot?.title}」 {t.title}
                  </span>
                  {t.due_date && (
                    <span className={`shrink-0 text-xs ${daysUntil(t.due_date) < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {dDayLabel(daysUntil(t.due_date))}
                    </span>
                  )}
                </Link>
              </li>
            ))}
            {!myTasks.length && <li className="text-sm text-gray-400">오늘 처리할 업무가 없습니다 🎉</li>}
          </ul>
        </Card>

        <Card title="주의 필요">
          <ul className="space-y-1.5">
            {attention.slice(0, 8).map((it, i) => (
              <li key={i}>
                <Link to={`/volumes/${it.volumeId}?vw=${it.vwId}`}
                  className={`block truncate text-sm hover:underline ${it.level === 'high' ? 'text-red-700' : 'text-amber-700'}`}>
                  {it.level === 'high' ? '⚠️' : '·'} {it.text}
                </Link>
              </li>
            ))}
            {!attention.length && <li className="text-sm text-gray-400">특이 사항이 없습니다</li>}
          </ul>
        </Card>
      </div>

      <Card title="다가오는 마감 (7일)">
        <ul className="space-y-1 text-sm">
          {upcoming.slice(0, 10).map(t => (
            <li key={t.id} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-gray-400">{dDayLabel(daysUntil(t.due_date))}</span>
              <Link to={taskLink(t)} className="min-w-0 flex-1 truncate hover:underline">
                {t.volume_works?.volumes?.number}권 · 「{t.volume_works?.work_snapshot?.title}」 {t.title}
              </Link>
            </li>
          ))}
          {!upcoming.length && <li className="text-gray-400">7일 이내 마감이 없습니다</li>}
        </ul>
      </Card>

      <Card title="권별 진행 현황">
        <ul className="space-y-2">
          {progress.map(r => (
            <li key={r.volume.id} className="text-sm">
              <Link to={`/volumes/${r.volume.id}`} className="hover:underline">
                <span className="font-medium">{r.volume.number}권 {r.volume.title}</span>
                <span className="ml-2 text-xs text-gray-500">
                  수록 {r.total} · 확정 {r.confirmed} · 업무 {r.done}/{r.taskTotal}
                </span>
              </Link>
              {r.pct != null && (
                <div className="mt-1 h-1.5 w-full rounded bg-gray-100">
                  <div className="h-1.5 rounded bg-blue-500" style={{ width: `${r.pct}%` }} />
                </div>
              )}
            </li>
          ))}
          {!progress.length && <li className="text-sm text-gray-400">아직 권이 없습니다</li>}
        </ul>
      </Card>

      <Card title="최근 활동">
        <ul className="space-y-1 text-xs text-gray-600">
          {feed.map(f => <li key={f.id}><span className="text-gray-400">{f.when}</span> · {f.text}</li>)}
          {!feed.length && <li className="text-gray-300">기록 없음</li>}
        </ul>
      </Card>
    </div>
  )
}
