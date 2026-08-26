// 좌측 작품 검색 패널: 시트 작품을 작품 단위로 묶어 보여주고 권에 추가한다.
import { useMemo, useState } from 'react'
import { filterWorks, getUniqueValues } from '../works/filterWorks.js'
import { workKeyOf, curriculaOf } from '../works/workKey.js'
import { SELECTION_LABELS } from './constants.js'
import MultiSelectDropdown from './MultiSelectDropdown.jsx'

const MAX_SHOWN = 50

export default function SearchPane({ works, duplicatesByKey, onAdd }) {
  const [query, setQuery] = useState('')
  const [curriculum, setCurriculum] = useState([])
  const [genre, setGenre] = useState([])
  const [sortByCount, setSortByCount] = useState(false)

  const curriculumOptions = useMemo(() => getUniqueValues(works, '교육과정'), [works])
  const genreOptions = useMemo(() => getUniqueValues(works, '장르'), [works])

  // 수록 횟수는 필터와 무관한 전체 시트 기준 (채택 빈도 지표)
  const countsByKey = useMemo(() => {
    const m = new Map()
    for (const w of works) {
      const k = workKeyOf(w)
      m.set(k, (m.get(k) || 0) + 1)
    }
    return m
  }, [works])

  // 필터 → 작품 단위 그룹핑 (첫 행을 대표로)
  const grouped = useMemo(() => {
    const filtered = filterWorks(works, { curriculum, genre, query })
    const map = new Map()
    for (const w of filtered) {
      const key = workKeyOf(w)
      if (!map.has(key)) map.set(key, { rep: w })
    }
    const entries = [...map.entries()] // [key, {rep}]
    if (sortByCount) {
      entries.sort((a, b) => (countsByKey.get(b[0]) || 0) - (countsByKey.get(a[0]) || 0))
    }
    return entries
  }, [works, curriculum, genre, query, sortByCount, countsByKey])

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="작품명·작가 검색 (초성 가능)"
          className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <MultiSelectDropdown label="교육과정" options={curriculumOptions} selected={curriculum} onChange={setCurriculum} />
        <MultiSelectDropdown label="갈래" options={genreOptions} selected={genre} onChange={setGenre} />
      </div>

      <div className="mb-1 flex items-center gap-3">
        <p className="text-xs text-gray-400">작품 {grouped.length}건{grouped.length > MAX_SHOWN ? ` (상위 ${MAX_SHOWN}건 표시)` : ''}</p>
        <label className="ml-auto flex items-center gap-1 text-xs text-gray-500">
          <input type="checkbox" checked={sortByCount} onChange={e => setSortByCount(e.target.checked)} />
          수록 많은 순
        </label>
      </div>

      <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {grouped.slice(0, MAX_SHOWN).map(([key, { rep: w }]) => {
          const dups = duplicatesByKey.get(key) || []
          return (
            <li key={key} className="flex items-center gap-2 rounded border border-gray-100 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{w['작품명']}</div>
                <div className="truncate text-xs text-gray-500">
                  {w._authorBase} · {w['장르']}
                </div>
              </div>
              <span className="shrink-0 text-xs text-gray-400">수록 {countsByKey.get(key)}회</span>
              {dups.map(d => (
                <span
                  key={d.volumeNumber}
                  className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${d.selection_status === 'confirmed' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}
                >
                  {d.volumeNumber}권 {SELECTION_LABELS[d.selection_status]}
                </span>
              ))}
              <button
                type="button"
                onClick={() => onAdd(w, curriculaOf(works, key))}
                className="shrink-0 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white"
              >
                추가
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
