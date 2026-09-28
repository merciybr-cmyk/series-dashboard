// 갈래 후보 자동 배치: 미리보기 → 조정 → 적용, 적용 기록과 일괄 되돌리기 (5단계, 설계 2026-09-28 §3)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import * as api from './volumeApi.js'
import { useWorksData } from '../works/useWorksData.js'
import { GENRE_BUCKETS } from './genreUtils.js'
import { autoPlace, isEligible } from './autoPlace.js'
import { buildPlacementInput, evaluateAssignment, REASON_LABELS, UNPLACEABLE_LABELS } from './placementUtils.js'
import {
  applyConfirmText, applyPlacement, applySummary, plannedNewParts, undoBatch, undoSummary,
} from './placementActions.js'
import { downloadPlacementExcel } from './exportPlacement.js'
import { useToast } from '../components/Toast.jsx'

const REASON_BADGE = {
  debut: 'bg-green-100 text-green-800',
  concept: 'bg-purple-100 text-purple-800',
  balance: 'bg-gray-100 text-gray-600',
}

function VolumeSelect({ label, work, value, volumes, onChange }) {
  return (
    <select
      aria-label={label}
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
      className="rounded border border-gray-200 px-1 py-0.5 text-xs"
    >
      {!value && <option value="">권 선택</option>}
      {volumes.map(v => (
        <option key={v.id} value={v.id}>
          {v.number}권{isEligible(work, v) ? '' : ' ⚠ 수록 이력 없음'}
        </option>
      ))}
    </select>
  )
}

function formatTime(iso) {
  return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AutoPlacePage() {
  const { works: sheetWorks, loading: sheetLoading, error: sheetError } = useWorksData()
  const { show } = useToast()
  const [data, setData] = useState(null) // { volumes, picks, allVw, registry, members }
  const [batches, setBatches] = useState([])
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [bucket, setBucket] = useState(GENRE_BUCKETS[0])
  const [assignment, setAssignment] = useState(() => new Map())
  const [initial, setInitial] = useState(() => new Map())
  const [holdReasons, setHoldReasons] = useState(() => new Map())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const load = useCallback(async () => {
    try {
      const [volumes, picks, allVw, registry, members, batchRows] = await Promise.all([
        api.listVolumes(), api.listPicks(), api.listAllVolumeWorks(), api.listRegistry(),
        api.listMembers(), api.listPlacementBatches(),
      ])
      if (volumes.length && !('curricula' in volumes[0])) { setSchemaMissing(true); return }
      setData({ volumes, picks, allVw, registry, members })
      setBatches(batchRows)
    } catch (err) {
      if (api.isMissingSchemaError(err)) setSchemaMissing(true)
      else show(err.message)
    }
  }, [show])

  useEffect(() => { load() }, [load])

  const input = useMemo(() => {
    if (!data || sheetLoading) return null
    return buildPlacementInput({ ...data, sheetWorks: sheetError ? [] : sheetWorks, bucket })
  }, [data, sheetLoading, sheetError, sheetWorks, bucket])

  const compute = useCallback(() => {
    if (!input) return
    const { placements, unplaceable } = autoPlace({
      works: input.works, volumes: input.volumes, existing: input.existing, bucket,
    })
    const next = new Map(input.works.map(w => [w.workId, null]))
    for (const p of placements) next.set(p.workId, p.volumeId)
    setAssignment(next)
    setInitial(next)
    setHoldReasons(new Map(unplaceable.map(u => [u.workId, u.reason])))
  }, [input, bucket])

  useEffect(() => { compute() }, [compute])

  const view = useMemo(
    () => (input ? evaluateAssignment({ ...input, bucket, assignment }) : null),
    [input, bucket, assignment],
  )

  const memberName = useMemo(
    () => Object.fromEntries((data?.members || []).map(m => [m.id, m.name])), [data],
  )

  const dirty = [...assignment].some(([k, v]) => initial.get(k) !== v)

  function move(workId, volumeId) {
    setAssignment(a => new Map(a).set(workId, volumeId))
    if (!volumeId) setHoldReasons(r => new Map(r).set(workId, 'manual'))
  }

  function handleReset() {
    if (dirty && !window.confirm('직접 조정한 내용이 사라집니다. 처음 제안안으로 되돌릴까요?')) return
    compute()
  }

  async function handleApply() {
    const items = view.columns.flatMap(c => c.proposed.map(p => ({ work: p.work, volumeId: c.volume.id })))
    if (!items.length) { show('적용할 작품이 없습니다'); return }
    try {
      const parts = await api.listAllParts()
      const newParts = plannedNewParts({ bucket, items, parts })
      if (!window.confirm(applyConfirmText({ bucket, items, volumes: input.volumes, newParts }))) return
      setBusy(true)
      setMessage(applySummary(await applyPlacement({ api, bucket, items })))
      await load()
    } catch (err) {
      show(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleUndo(batch) {
    if (!window.confirm(`${batch.genre} ${batch.item_count}편 적용을 되돌릴까요?\n적용 뒤 손댄 작품(상태 변경·업무·의견·자료)은 남깁니다.`)) return
    setBusy(true)
    try {
      setMessage(undoSummary(await undoBatch({ api, batch })))
      await load()
    } catch (err) {
      show(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (schemaMissing) {
    return (
      <div className="max-w-2xl rounded border border-amber-300 bg-amber-50 p-4 text-sm">
        <p className="font-semibold">DB 업데이트(phase5.sql) 실행이 필요합니다.</p>
        <p className="mt-1 text-gray-600">편집부에 요청해 주세요 — 안내: docs/setup-phase5.md</p>
      </div>
    )
  }
  if (!view) return <p className="text-gray-500">불러오는 중…</p>

  const proposedCount = view.columns.reduce((n, c) => n + c.proposed.length, 0)
  const untaggedCount = input.works.filter(w => !w.conceptVolumeIds.length).length

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">자동 배치</h2>
        <span className="text-sm text-gray-400">
          미배치 후보 {input.works.length}편 · 대상 권 {input.volumes.length}개
        </span>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={handleReset} disabled={busy}
            className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">
            다시 계산
          </button>
          <button type="button" disabled={busy}
            onClick={() => downloadPlacementExcel({ bucket, columns: view.columns, held: view.held, holdReasons })}
            className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">
            엑셀로 저장
          </button>
          <button type="button" onClick={handleApply} disabled={busy || !proposedCount}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-40">
            적용
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-3">
        <span className="text-sm font-medium text-gray-500">갈래 선택</span>
        {GENRE_BUCKETS.map(b => (
          <button
            key={b}
            type="button"
            onClick={() => setBucket(b)}
            className={`rounded-full border px-4 py-1.5 text-[15px] ${
              bucket === b
                ? 'border-blue-600 bg-blue-600 font-semibold text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {input.skippedVolumes.length > 0 && (
        <p className="mb-2 text-sm text-amber-700">
          교육과정기가 비어 있어 제외한 권: {input.skippedVolumes.map(v => `${v.number}권`).join(', ')} — 권 목록의 수정에서 설정하세요.
        </p>
      )}
      {untaggedCount > 0 && (
        <p className="mb-2 text-sm text-purple-700">
          콘셉트 태그가 없는 후보 {untaggedCount}편은 첫 수록 시기와 분량으로만 배치됩니다.{' '}
          <Link to="/picks" className="underline">갈래별 후보에서 달기</Link>
        </p>
      )}
      {(sheetError || input.sheetFallbackCount > 0) && (
        <p className="mb-2 text-sm text-amber-700">
          {sheetError
            ? '작품 DB 시트 연결 실패로 저장된 정보로 계산했습니다.'
            : `시트에서 찾지 못한 ${input.sheetFallbackCount}편은 후보 등록 때 저장된 교육과정으로 계산했습니다.`}
        </p>
      )}
      {message && (
        <div className="mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
          {message} <Link to="/compare" className="ml-1 text-blue-700 underline">권별 비교 보기</Link>
        </div>
      )}

      <div className="grid gap-4 pb-4 md:grid-cols-2 xl:grid-cols-4">
        {view.columns.map(col => (
          <section key={col.volume.id} aria-label={`${col.volume.number}권 배치안`} className="rounded border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
              <div className="font-semibold">{col.volume.number}권 {col.volume.title}</div>
              <div className="text-xs text-gray-500">
                {(col.volume.curricula || []).join('·')} · <span>기존 {col.existing.length} + 신규 {col.proposed.length}</span>
              </div>
            </div>
            <ul className="max-h-[70vh] space-y-1 overflow-y-auto p-2">
              {col.existing.map(e => (
                <li key={e.id} className="rounded px-2 py-1 text-sm text-gray-400">
                  {e.title} <span className="text-xs">{e.author}</span>
                </li>
              ))}
              {col.proposed.map(p => (
                <li key={p.work.workId} className="rounded border border-blue-200 bg-white px-2 py-1.5 text-sm">
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate font-medium">{p.work.title}</span>
                    <span className="shrink-0 text-xs text-gray-500">{p.work.author}</span>
                    <button type="button" aria-label={`${p.work.title} 빼기`} onClick={() => move(p.work.workId, null)}
                      className="shrink-0 text-xs text-gray-400 hover:text-red-500">빼기</button>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    {p.reasons.map(r => (
                      <span key={r} className={`rounded px-1 text-xs ${REASON_BADGE[r]}`}>{REASON_LABELS[r]}</span>
                    ))}
                    {p.warnings.includes('authorDup') && <span className="rounded bg-orange-100 px-1 text-xs text-orange-800">작가 중복</span>}
                    {p.warnings.includes('authorOver') && <span className="rounded bg-red-100 px-1 text-xs text-red-700">작가 3편 이상</span>}
                    {p.warnings.includes('ineligible') && <span className="rounded bg-red-100 px-1 text-xs text-red-700">⚠ 수록 이력 없음</span>}
                    <span className="ml-auto">
                      <VolumeSelect label={`${p.work.title} 권 이동`} work={p.work} value={col.volume.id}
                        volumes={input.volumes} onChange={vid => move(p.work.workId, vid)} />
                    </span>
                  </div>
                </li>
              ))}
              {!col.existing.length && !col.proposed.length && <li className="py-1 text-xs text-gray-300">없음</li>}
            </ul>
          </section>
        ))}
      </div>

      <section aria-label="보류함" className="mb-6 rounded border border-dashed border-gray-300 p-3">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">보류함 ({view.held.length})</h3>
        <ul className="space-y-1">
          {view.held.map(w => (
            <li key={w.workId} className="flex items-center gap-2 text-sm">
              <span className="font-medium">{w.title}</span>
              <span className="text-xs text-gray-500">{w.author}</span>
              <span className="text-xs text-amber-700">{UNPLACEABLE_LABELS[holdReasons.get(w.workId) || 'manual']}</span>
              <span className="ml-auto">
                <VolumeSelect label={`${w.title} 권 선택`} work={w} value={null}
                  volumes={input.volumes} onChange={vid => move(w.workId, vid)} />
              </span>
            </li>
          ))}
          {!view.held.length && <li className="text-xs text-gray-400">비어 있습니다</li>}
        </ul>
      </section>

      <section aria-label="적용 기록" className="rounded border border-gray-200 p-3">
        <h3 className="mb-2 text-sm font-semibold text-gray-600">적용 기록</h3>
        <ul className="space-y-1">
          {batches.map(b => (
            <li key={b.id} className="flex items-center gap-3 text-sm">
              <span className="font-medium">{b.genre}</span>
              <span>{b.item_count}편</span>
              <span className="text-xs text-gray-500">{memberName[b.created_by] || '알 수 없음'} · {formatTime(b.created_at)}</span>
              {b.undone_at ? (
                <span className="ml-auto text-xs text-gray-400">되돌림 · {memberName[b.undone_by] || ''} {formatTime(b.undone_at)}</span>
              ) : (
                <button type="button" disabled={busy} onClick={() => handleUndo(b)}
                  className="ml-auto rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50">
                  되돌리기
                </button>
              )}
            </li>
          ))}
          {!batches.length && <li className="text-xs text-gray-400">아직 적용한 적이 없습니다</li>}
        </ul>
      </section>
    </div>
  )
}
