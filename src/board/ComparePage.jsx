// 권별 비교: 모든 권의 수록 목록을 한 화면에서 나란히 본다 (읽기 전용, 설계 §10 2c)
// 2026-10-01: 부 띠·고전/현대 표시(부 안은 고전 → 현대 순)·구성 요약표(부 × 권)
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listVolumes, listAllVolumeWorks, listAllParts } from './volumeApi.js'
import { SELECTION_LABELS } from './constants.js'
import { eraOf, eraSummary } from './genreUtils.js'
import { buildCompareColumns, compareSummary, totalOf, volumesByWork as buildVolumesByWork } from './compareUtils.js'
import { useToast } from '../components/Toast.jsx'
import { downloadCompareExcel } from './exportCompare.js'

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

function EraChip({ era }) {
  return <span className={`shrink-0 rounded px-1 py-0.5 text-xs ${ERA_CHIP[era]}`}>{era}</span>
}

function EraBar({ counts }) {
  const total = totalOf(counts)
  if (!total) return null
  const pct = n => `${(n / total) * 100}%`
  return (
    <div className="flex h-1.5 min-w-8 flex-1 overflow-hidden rounded-full bg-gray-200" aria-hidden="true">
      <div className="bg-teal-500" style={{ width: pct(counts['고전']) }} />
      <div className="bg-violet-400" style={{ width: pct(counts['현대']) }} />
      <div className="bg-gray-300" style={{ width: pct(counts['기타']) }} />
    </div>
  )
}

function SummaryTable({ columns }) {
  const rows = compareSummary(columns)
  if (!rows.length) return null
  return (
    <div className="mb-4 overflow-x-auto rounded border border-gray-200">
      <table aria-label="구성 요약" className="w-full table-fixed text-xs">
        <thead>
          <tr className="bg-gray-50">
            <th className="w-24 px-2 py-1.5 text-left font-semibold text-gray-500">구성 요약</th>
            {columns.map(c => (
              <th key={c.volume.id} scope="col" className="w-28 px-2 py-1.5 text-left font-semibold text-gray-700">{c.volume.number}권</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const warn = r.label === '미배정'
            return (
              <tr key={r.label} className="border-t border-gray-100">
                <th scope="row" className={`px-2 py-1.5 text-left font-semibold ${warn ? 'text-red-600' : 'text-gray-700'}`}>{r.label}</th>
                {r.cells.map((counts, i) => (
                  <td key={columns[i].volume.id} className="px-2 py-1.5 align-top">
                    {counts === null ? <span className="text-gray-300">—</span>
                      : !totalOf(counts) ? <span className="text-gray-300">0편</span>
                      : (
                        <>
                          <div className={warn ? 'font-semibold text-red-600' : 'font-semibold text-gray-700'}>{totalOf(counts)}편</div>
                          <div className="my-0.5 flex"><EraBar counts={counts} /></div>
                          <div className="text-gray-500">{eraSummary(counts)}</div>
                        </>
                      )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PartBand({ group, first }) {
  const warn = group.label === '미배정'
  const total = totalOf(group.counts)
  return (
    <div data-part-band
      className={`sticky top-0 z-10 flex items-center gap-2 border-t-2 px-2 py-1 text-sm ${first ? '' : 'mt-3'} ${
        warn ? 'border-red-400 bg-red-50 text-red-700' : 'border-gray-400 bg-gray-100 text-gray-800'}`}>
      <span className="font-semibold">{group.label}</span>
      <span className="text-xs text-gray-500">{total}편</span>
      {warn ? <span className="text-xs">부를 정해 주세요</span> : <EraBar counts={group.counts} />}
      {total > 0 && <span className="shrink-0 text-xs text-gray-500">{eraSummary(group.counts)}</span>}
    </div>
  )
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

  const volumesByWork = useMemo(() => buildVolumesByWork(allVw), [allVw])

  const numberByVolumeId = useMemo(
    () => Object.fromEntries(volumes.map(v => [v.id, v.number])), [volumes],
  )

  const columns = useMemo(
    () => buildCompareColumns({ volumes, allVw, allParts, confirmedOnly }),
    [volumes, allVw, allParts, confirmedOnly],
  )

  if (loading) return <p className="text-gray-500">불러오는 중…</p>

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 className="text-lg font-bold">권별 비교</h2>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={confirmedOnly} onChange={e => setConfirmedOnly(e.target.checked)} />
          확정만 보기
        </label>
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <EraChip era="고전" /> 고전운문·고전소설·고전수필·고전극
          <EraChip era="현대" /> 시·소설·수필·극본
        </span>
        <span className="text-xs text-gray-400">노란 배경 = 다른 권과 겹치는 작품 · 편수·비율과 겹침은 제외 상태를 뺀 기준</span>
        <button
          type="button"
          onClick={() => downloadCompareExcel({ volumes, allVw, allParts, confirmedOnly })}
          disabled={!volumes.length}
          className="ml-auto rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          엑셀로 저장
        </button>
      </div>

      <SummaryTable columns={columns} />

      <div className="grid gap-4 pb-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map(({ volume: v, groups, counts }) => {
          const name = `${v.number}권 ${v.title}`
          const meta = [`${totalOf(counts)}편`, eraSummary(counts), v.status].filter(Boolean).join(' · ')
          const hasParts = groups.some(g => g.label)
          return (
            <section key={v.id} aria-label={name} className="rounded border border-gray-200">
              <Link to={`/volumes/${v.id}`} className="block border-b border-gray-200 bg-gray-50 px-3 py-2 font-semibold hover:bg-gray-100">
                {name}
                <span className="ml-2 text-xs font-normal text-gray-500">{meta}</span>
              </Link>
              <div className={`max-h-[70vh] overflow-y-auto px-2 pb-2 ${hasParts ? '' : 'pt-2'}`}>
                {groups.map((g, i) => (
                  <div key={g.part ? g.part.id : `none-${i}`}>
                    {g.label && <PartBand group={g} first={i === 0} />}
                    <ul className="mt-1 space-y-0.5">
                      {g.works.map(w => {
                        const others = (volumesByWork.get(w.work_id) || []).filter(id => id !== v.id)
                        const isDup = others.length > 0
                        return (
                          <li key={w.id}
                            className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-sm ${isDup ? 'bg-amber-50' : ''}`}>
                            <EraChip era={eraOf(w.work_snapshot.genre) || '기타'} />
                            <span className="min-w-0 flex-1 truncate">
                              <span>{w.work_snapshot.title}</span>
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
            </section>
          )
        })}
        {!volumes.length && <p className="text-sm text-gray-400">아직 권이 없습니다.</p>}
      </div>
    </div>
  )
}
