// 권 보드 화면의 상태·액션·실시간 동기화를 소유하는 훅.
// 원칙: 액션은 서버 성공 응답으로 로컬 패치, 실패는 토스트 + 전체 재조회(롤백).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from './volumeApi.js'
import { nextSortOrder, swapPlan } from './boardUtils.js'
import { useToast } from '../components/Toast.jsx'

export function useVolumeBoard(volumeId) {
  const [volume, setVolume] = useState(null)
  const [works, setWorks] = useState([])
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const { show } = useToast()
  const debounceRef = useRef(null)
  const hasLoadedRef = useRef(false)

  const reload = useCallback(async () => {
    try {
      const board = await api.getBoard(volumeId)
      setVolume(board.volume)
      setWorks(board.works)
      setTasks(board.tasks)
      setError(null)
      hasLoadedRef.current = true
    } catch (err) {
      if (hasLoadedRef.current) {
        show(err.message)
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }, [volumeId, show])

  useEffect(() => {
    setLoading(true)
    reload()
    api.listMembers().then(setMembers).catch(() => {})
    const unsubscribe = api.subscribeBoard(() => {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(reload, 300)
    })
    return () => {
      clearTimeout(debounceRef.current)
      unsubscribe()
    }
  }, [reload])

  // 실패 공통 처리: 토스트 + 재조회 롤백
  const guard = useCallback(async fn => {
    try {
      return await fn()
    } catch (err) {
      show(err.message)
      reload()
      return null
    }
  }, [show, reload])

  const tasksByVw = useMemo(() => {
    const map = {}
    for (const t of tasks) (map[t.volume_work_id] ||= []).push(t)
    return map
  }, [tasks])

  const actions = useMemo(() => ({
    reload,

    addWork: (work, curricula, registryMap) => guard(async () => {
      const row = await api.addWorkToVolume({
        volumeId, work, curricula, registryMap, sortOrder: nextSortOrder(works),
      })
      setWorks(ws => [...ws, row])
      return row
    }),

    setVolumeWork: (id, patch) => guard(async () => {
      const row = await api.updateVolumeWork(id, patch)
      setWorks(ws => ws.map(w => (w.id === id ? row : w)))
      return row
    }),

    removeWork: id => guard(async () => {
      await api.deleteVolumeWork(id)
      setWorks(ws => ws.filter(w => w.id !== id))
      setTasks(ts => ts.filter(t => t.volume_work_id !== id))
    }),

    move: (id, dir) => guard(async () => {
      const pairs = swapPlan(works, id, dir)
      if (!pairs) return
      await api.applySortSwap(pairs)
      setWorks(ws => {
        const orderOf = Object.fromEntries(pairs.map(p => [p.id, p.sort_order]))
        return ws.map(w => (orderOf[w.id] != null ? { ...w, sort_order: orderOf[w.id] } : w))
          .sort((a, b) => a.sort_order - b.sort_order)
      })
    }),

    addTasks: (vwId, items) => guard(async () => {
      const rows = await api.addTasks(vwId, items)
      setTasks(ts => [...ts, ...rows])
      return rows
    }),

    setTask: (id, patch) => guard(async () => {
      const row = await api.updateTask(id, patch)
      setTasks(ts => ts.map(t => (t.id === id ? row : t)))
      return row
    }),

    removeTask: id => guard(async () => {
      await api.deleteTask(id)
      setTasks(ts => ts.filter(t => t.id !== id))
    }),
  }), [guard, reload, volumeId, works])

  return { volume, works, tasksByVw, members, loading, error, actions }
}
