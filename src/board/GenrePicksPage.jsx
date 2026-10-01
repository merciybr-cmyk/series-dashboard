// 갈래별 후보: 권 배치 전에 갈래별로 수록할 만한 작품을 먼저 뽑아 두는 화면 (2026-08-26)
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useWorksData } from '../works/useWorksData.js'
import { buildRegistryMap, keyOf } from '../works/workKey.js'
import * as api from './volumeApi.js'
import { GENRE_BUCKETS, groupPicksByBucket, bucketOf, groupPicksByAuthor } from './genreUtils.js'
import { sortCurricula } from '../works/workKey.js'
import { downloadBucketExcel, downloadAllExcel } from './exportPicks.js'
import { SELECTION_LABELS } from './constants.js'
import SearchPane from './SearchPane.jsx'
import ConceptTags from './ConceptTags.jsx'
import { useToast } from '../components/Toast.jsx'

export default function GenrePicksPage() {
  const { works: sheetWorks, loading: sheetLoading, error: sheetError, retry } = useWorksData()
  const { show } = useToast()

  const [picks, setPicks] = useState([])
  const [registry, setRegistry] = useState([])
  const [allVw, setAllVw] = useState([])
  const [volumes, setVolumes] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeBucket, setActiveBucket] = useState(GENRE_BUCKETS[0])
  const [onlyUntagged, setOnlyUntagged] = useState(false)
  const [byAuthor, setByAuthor] = useState(true) // 2026-10-01: 기본은 같은 작가끼리 묶어 보기(작가 가나다순)

  const load = useCallback(() => {
    api.listPicks().then(setPicks).catch(err => show(err.message)).finally(() => setLoading(false))
    api.listRegistry().then(setRegistry).catch(() => {})
    api.listAllVolumeWorks().then(setAllVw).catch(() => {})
    api.listVolumes().then(setVolumes).catch(() => {})
  }, [show])

  useEffect(load, [load])

  const registryMap = useMemo(() => buildRegistryMap(registry), [registry])

  // work_id → 권 수록 현황 (검색 뱃지·후보 행 뱃지 공용)
  const duplicatesByWorkId = useMemo(() => {
    const map = new Map()
    for (const vw of allVw) {
      if (!map.has(vw.work_id)) map.set(vw.work_id, [])
      map.get(vw.work_id).push({ volumeNumber: vw.volumes?.number, selection_status: vw.selection_status })
    }
    return map
  }, [allVw])

  const duplicatesByKey = useMemo(() => {
    const map = new Map()
    for (const row of registry) {
      const dups = duplicatesByWorkId.get(row.work_id)
      if (!dups) continue
      map.set(keyOf(row.title, row.author_base), dups)
      for (const a of row.aliases || []) map.set(keyOf(a.title, a.author_base), dups)
    }
    return map
  }, [registry, duplicatesByWorkId])

  const groups = useMemo(() => groupPicksByBucket(picks), [picks])
  const bucketTabs = [...GENRE_BUCKETS, ...(groups['기타'].length ? ['기타'] : [])]

  async function handleAdd(work, curricula) {
    try {
      const pick = await api.addPick({ work, curricula, registryMap })
      setPicks(ps => [...ps, pick])
      // 추가된 작품의 갈래 탭으로 전환 — 다른 탭을 보고 있으면 방금 추가한 게 안 보여 실패로 오해된다
      const bucket = bucketOf(pick.work_snapshot?.genre) || '기타'
      setActiveBucket(bucket)
      show(`「${pick.work_snapshot?.title}」을(를) ${bucket} 후보에 추가했습니다`)
      api.listRegistry().then(setRegistry).catch(() => {}) // 신규 work_id만 반영 (picks 재조회는 로컬 추가를 덮어쓰는 경합이 됨)
    } catch (err) {
      show(err.message)
    }
  }

  async function handleConcept(pick, ids) {
    const prev = pick.concept_volume_ids
    setPicks(ps => ps.map(p => (p.id === pick.id ? { ...p, concept_volume_ids: ids } : p)))
    try {
      await api.updatePickConcept(pick.id, ids)
    } catch (err) {
      setPicks(ps => ps.map(p => (p.id === pick.id ? { ...p, concept_volume_ids: prev } : p)))
      show(err.message)
    }
  }

  async function handleRemove(pick) {
    if (!window.confirm(`「${pick.work_snapshot?.title}」을(를) 후보에서 제거할까요?`)) return
    try {
      await api.deletePick(pick.id)
      setPicks(ps => ps.filter(p => p.id !== pick.id))
    } catch (err) {
      show(err.message)
    }
  }

  if (loading) return <p className="text-gray-500">불러오는 중…</p>

  const bucketPicks = groups[activeBucket] || []
  // 콘셉트 태그 칸은 phase5.sql 이후에만 있다 — 칸이 있는 후보 중 빈 것만 센다
  const untagged = bucketPicks.filter(p => 'concept_volume_ids' in p && !(p.concept_volume_ids || []).length)
  const hasTags = bucketPicks.some(p => 'concept_volume_ids' in p)
  const activePicks = onlyUntagged ? untagged : bucketPicks
  const displayGroups = byAuthor ? groupPicksByAuthor(activePicks) : [{ author: null, picks: activePicks }]
  const orderedPicks = displayGroups.flatMap(g => g.picks) // 엑셀도 화면 순서 그대로

  function renderPick(p) {
    const dups = duplicatesByWorkId.get(p.work_id) || []
    return (
      <li key={p.id} className="flex items-center gap-2 rounded border border-gray-100 px-3 py-2 text-sm">
        <div className="min-w-0 flex-1">
          <div className="truncate">
            <span className="font-medium">{p.work_snapshot?.title}</span>
            <span className="ml-2 text-xs text-gray-500">
              {p.work_snapshot?.author} · {p.work_snapshot?.genre}
            </span>
          </div>
          {(p.work_snapshot?.curriculum || []).length > 0 && (
            <div className="truncate text-xs text-gray-400" title={sortCurricula(p.work_snapshot.curriculum).join(', ')}>
              {sortCurricula(p.work_snapshot.curriculum).join(' · ')}
            </div>
          )}
        </div>
        {'concept_volume_ids' in p && (
          <ConceptTags
            title={p.work_snapshot?.title}
            volumeIds={p.concept_volume_ids || []}
            volumes={volumes}
            onSave={ids => handleConcept(p, ids)}
          />
        )}
        {dups.map((d, i) => (
          <span
            key={`${d.volumeNumber}-${i}`}
            className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${d.selection_status === 'confirmed' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}
          >
            {d.volumeNumber}권 {SELECTION_LABELS[d.selection_status]}
          </span>
        ))}
        <button
          type="button"
          aria-label={`${p.work_snapshot?.title} 제거`}
          onClick={() => handleRemove(p)}
          className="shrink-0 text-gray-300 hover:text-red-500"
        >✕</button>
      </li>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-lg font-bold">갈래별 후보</h2>
        <span className="text-sm text-gray-400">
          권 배치 전에 갈래별로 수록할 만한 작품을 먼저 모아 두는 곳입니다 · 전체 {picks.length}편
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => (orderedPicks.length ? downloadBucketExcel(orderedPicks, activeBucket) : show('현재 갈래에 후보가 없습니다'))}
            className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
          >
            현재 갈래 엑셀
          </button>
          <button
            type="button"
            onClick={() => (picks.length ? downloadAllExcel(picks, { byAuthor }) : show('내보낼 후보가 없습니다'))}
            className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50"
          >
            전체 엑셀 (갈래별 시트)
          </button>
        </div>
      </div>

      <div className="flex items-start gap-4">
        <div className="sticky top-6 h-[80vh] w-96 shrink-0 rounded border border-gray-200 p-3">
          {sheetLoading ? (
            <p className="text-sm text-gray-400">작품 데이터 불러오는 중…</p>
          ) : sheetError ? (
            <div className="text-sm">
              <p className="mb-2 text-red-600">{sheetError}</p>
              <button type="button" onClick={retry} className="rounded border px-3 py-1">다시 시도</button>
            </div>
          ) : (
            <SearchPane works={sheetWorks} duplicatesByKey={duplicatesByKey} onAdd={handleAdd} />
          )}
        </div>

        <div className="min-w-0 flex-1 rounded border border-gray-200 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
            <span className="text-sm font-medium text-gray-500">갈래 선택</span>
            {bucketTabs.map(b => (
              <button
                key={b}
                type="button"
                onClick={() => setActiveBucket(b)}
                className={`rounded-full border px-4 py-1.5 text-[15px] ${
                  activeBucket === b
                    ? 'border-blue-600 bg-blue-600 font-semibold text-white'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                {b} {groups[b]?.length ? `(${groups[b].length})` : ''}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <div className="flex overflow-hidden rounded border border-gray-300 text-xs" role="group" aria-label="정렬">
                {[[true, '작가별'], [false, '선정순']].map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={byAuthor === value}
                    onClick={() => setByAuthor(value)}
                    className={`px-2 py-1 ${byAuthor === value ? 'bg-gray-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {hasTags && (untagged.length > 0 || onlyUntagged) && (
                <button
                  type="button"
                  aria-pressed={onlyUntagged}
                  onClick={() => setOnlyUntagged(v => !v)}
                  className={`rounded border px-2 py-1 text-xs ${
                    onlyUntagged ? 'border-purple-600 bg-purple-600 text-white' : 'border-purple-300 text-purple-700 hover:bg-purple-50'
                  }`}
                >
                  태그 없음 {untagged.length}
                </button>
              )}
            </div>
          </div>

          <ul className="space-y-1">
            {displayGroups.map((g, gi) => (g.author && g.picks.length > 1 ? (
              // 2편 이상인 작가: 머리줄 + 왼쪽 세로줄로 묶음의 끝까지 보이게
              <li key={g.author} data-author-group className="pt-1">
                <div data-author-header className="flex items-baseline gap-1.5 px-1 pb-1 text-sm font-semibold text-gray-700">
                  <span>{g.author}</span>
                  <span className="text-xs font-normal text-gray-400">{g.picks.length}편</span>
                </div>
                <ul className="ml-1 space-y-1 border-l-2 border-gray-300 pl-2">{g.picks.map(renderPick)}</ul>
              </li>
            ) : (
              // 1편뿐인 작가·작가 미상·선정순은 머리줄 없이
              <Fragment key={g.author ?? `none-${gi}`}>{g.picks.map(renderPick)}</Fragment>
            )))}
            {!activePicks.length && (
              <li className="py-8 text-center text-sm text-gray-400">
                아직 이 갈래의 후보가 없습니다 — 왼쪽에서 검색해 추가하세요
              </li>
            )}
          </ul>
        </div>
      </div>
    </div>
  )
}
