// 권별 비교: 모든 권의 수록 목록을 한 화면에서 나란히 본다 (읽기 전용, 설계 §10 2c)
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listVolumes, listAllVolumeWorks, listAllParts } from './volumeApi.js'
import { groupByPart, partLabel } from './boardUtils.js'
import { SELECTION_LABELS } from './constants.js'
import { useToast } from '../components/Toast.jsx'

const SELECTION_BADGE = {
  candidate: 'bg-gray-100 text-gray-700',
  hold: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-blue-100 text-blue-800',
  excluded: 'bg-gray-200 text-gray-400 line-through',
}

export default function ComparePage() {
  const [volumes, setVolumes] = useState([])
  const [allVw, setAllVw] = useState([])
  const [allParts, setAllParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmedOnly, setConfirmedOnly] = useState(false)
  const { show } = useToast()

  useEffect(() => {
    Promise.all([listVolumes(), listAllVolumeWorks(), listAllParts()])
      .then(([vs, vw, ps]) => { setVolumes(vs); setAllVw(vw); setAllParts(ps) })
      .catch(err => show(err.message))
      .finally(() => setLoading(false))
  }, [show])

  // work_id → 수록 권 번호 목록 (제외 상태는 겹침 판정에서 뺀다)
  const volumesByWork = useMemo(() => {
    const map = new Map()
    for (const w of allVw) {
      if (w.selection_status === 'excluded') continue
      if (!map.has(w.work_id)) map.set(w.work_id, [])
      map.get(w.work_id).push(w.volume_id)
    }
    return map
  }, [allVw])

  const numberByVolumeId = useMemo(
    () => Object.fromEntries(volumes.map(v => [v.id, v.number])), [volumes],
  )

  if (loading) return <p className="text-gray-500">불러오는 중…</p>

  return (
    <div>
      <div className="mb-3 flex items-center gap-4">
        <h2 className="text-lg font-bold">권별 비교</h2>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={confirmedOnly} onChange={e => setConfirmedOnly(e.target.checked)} />
          확정만 보기
        </label>
        <span className="text-xs text-gray-400">노란 배경 = 다른 권과 겹치는 작품 (제외 상태는 겹침에서 뺌)</span>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {volumes.map(v => {
          const works = allVw
            .filter(w => w.volume_id === v.id)
            .filter(w => !confirmedOnly || w.selection_status === 'confirmed')
            .sort((a, b) => a.sort_order - b.sort_order)
          const parts = allParts.filter(p => p.volume_id === v.id)
          const groups = groupByPart(works, parts)
          return (
            <div key={v.id} className="w-72 shrink-0 rounded border border-gray-200">
              <Link to={`/volumes/${v.id}`} className="block border-b border-gray-200 bg-gray-50 px-3 py-2 font-semibold hover:bg-gray-100">
                {v.number}권 {v.title}
                <span className="ml-2 text-xs font-normal text-gray-500">{works.length}편 · {v.status}</span>
              </Link>
              <div className="max-h-[70vh] overflow-y-auto p-2">
                {groups.map((g, i) => (
                  <div key={g.part ? g.part.id : `none-${i}`}>
                    {parts.length > 0 && (
                      <div className="mt-2 mb-1 text-xs font-semibold text-gray-400">
                        {g.part ? partLabel(g.part) : '미배정'}
                      </div>
                    )}
                    <ul className="space-y-0.5">
                      {g.works.map(w => {
                        const others = (volumesByWork.get(w.work_id) || []).filter(id => id !== v.id)
                        const isDup = others.length > 0
                        return (
                          <li key={w.id}
                            className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-sm ${isDup ? 'bg-amber-50' : ''}`}>
                            <span className="min-w-0 flex-1 truncate">
                              {w.work_snapshot.title}
                              <span className="ml-1 text-xs text-gray-400">{w.work_snapshot.author}</span>
                            </span>
                            {isDup && (
                              <span className="shrink-0 text-xs text-amber-700">
                                ⚠ {others.map(id => numberByVolumeId[id]).sort((a, b) => a - b).join('·')}권
                              </span>
                            )}
                            <span className={`shrink-0 rounded px-1 py-0.5 text-xs ${SELECTION_BADGE[w.selection_status]}`}>
                              {SELECTION_LABELS[w.selection_status]}
                            </span>
                          </li>
                        )
                      })}
                      {!g.works.length && <li className="py-0.5 text-xs text-gray-300">없음</li>}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {!volumes.length && <p className="text-sm text-gray-400">아직 권이 없습니다.</p>}
      </div>
    </div>
  )
}
