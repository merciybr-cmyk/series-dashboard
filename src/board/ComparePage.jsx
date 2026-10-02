// 권별 비교: 모든 권의 수록 목록을 한 화면에서 나란히 본다 (설계 §10 2c)
// 2026-10-01: 부 띠·고전/현대 표시(부 안은 고전 → 현대 순)·구성 요약표(부 × 권)
// 2026-10-02: 작품 줄 경고, 편집 모드(옮기기·빼기·넣기를 모았다가 저장) — docs/superpowers/specs/2026-10-02-compare-edit-design.md
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useBlocker } from 'react-router-dom'
import {
  listVolumes, listAllVolumeWorks, listAllParts, listAttachmentRefs,
  updateVolumeWork, deleteVolumeWork, ensureWorkId, insertPlacedWork,
} from './volumeApi.js'
import { eraSummary } from './genreUtils.js'
import {
  buildCompareColumns, compareSummary, compareWarnings, totalOf, volumesByWork as buildVolumesByWork,
} from './compareUtils.js'
import {
  EMPTY_DRAFT, changeCount, effectiveRows, moveRow, removeRow, revertRow,
  canPlace, placeErrorText, defaultPartFor, describeDraft,
} from './compareEdit.js'
import { planSave, runSave, countAttachments, resultSummary } from './compareSave.js'
import CompareSaveDialog from './CompareSaveDialog.jsx'
import CompareWorkRow, { EraChip } from './CompareWorkRow.jsx'
import CompareMoveMenu from './CompareMoveMenu.jsx'
import { useToast } from '../components/Toast.jsx'
import { downloadCompareExcel } from './exportCompare.js'

const leaveText = n => `저장하지 않은 변경 ${n}건이 있습니다. 나가면 사라집니다.`

const SAVE_API = { updateVolumeWork, deleteVolumeWork, ensureWorkId, insertPlacedWork }

function SaveResult({ result, onClose }) {
  return (
    <div role="status" className="mb-3 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm">
      <div className="flex items-center">
        <span className="font-semibold text-green-800">{resultSummary(result)}</span>
        <button type="button" onClick={onClose} className="ml-auto text-xs text-gray-500 underline">닫기</button>
      </div>
      {result.skipped.length > 0 && (
        <ul className="mt-1 text-xs text-gray-600">
          {result.skipped.map((s, i) => <li key={`s${i}`}>건너뜀: 〈{s.title}〉 — {s.reason}</li>)}
        </ul>
      )}
      {result.failed.length > 0 && (
        <ul className="mt-1 text-xs text-red-600">
          {result.failed.map((f, i) => <li key={`f${i}`}>실패: 〈{f.title}〉 — {f.reason}</li>)}
        </ul>
      )}
    </div>
  )
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
  const [editing, setEditing] = useState(false)
  const [baseline, setBaseline] = useState([])
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [saveOpen, setSaveOpen] = useState(false)
  const [attachments, setAttachments] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState(null)
  const { show } = useToast()

  const load = useCallback(async () => {
    const [vs, vw, ps] = await Promise.all([listVolumes(), listAllVolumeWorks(), listAllParts()])
    setVolumes(vs)
    setAllVw(vw)
    setAllParts(ps)
    return vw
  }, [])

  useEffect(() => {
    load().catch(err => show(err.message)).finally(() => setLoading(false))
  }, [load, show])

  // 편집 중에는 편집 시작 때 읽은 상태(baseline)에 draft를 반영해 보여 준다 — 다른 사람의 변경은 저장 때 맞춘다
  const rows = useMemo(() => (editing ? effectiveRows(baseline, draft) : allVw), [editing, baseline, draft, allVw])
  const dirtyCount = editing ? changeCount(draft) : 0
  const numberById = useMemo(() => Object.fromEntries(volumes.map(v => [v.id, v.number])), [volumes])
  const partById = useMemo(() => new Map(allParts.map(p => [p.id, p])), [allParts])
  const partsByVolume = useMemo(() => {
    const m = new Map()
    for (const p of allParts) {
      if (!m.has(p.volume_id)) m.set(p.volume_id, [])
      m.get(p.volume_id).push(p)
    }
    return m
  }, [allParts])
  const volumesByWork = useMemo(() => buildVolumesByWork(rows), [rows])
  const warnings = useMemo(() => compareWarnings(rows, volumes, allParts), [rows, volumes, allParts])
  const columns = useMemo(
    () => buildCompareColumns({ volumes, allVw: rows, allParts, confirmedOnly: editing ? false : confirmedOnly }),
    [volumes, rows, allParts, confirmedOnly, editing],
  )

  // 나가기 방지 (설계 §4.3): 앱 안 이동은 확인 창, 새로고침·탭 닫기는 브라우저 기본 확인
  const blocker = useBlocker(dirtyCount > 0)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(leaveText(dirtyCount))) blocker.proceed()
    else blocker.reset()
  }, [blocker, dirtyCount])
  useEffect(() => {
    if (!dirtyCount) return
    const onBeforeUnload = e => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirtyCount])

  const place = (volumeId, partId) => {
    const p = partById.get(partId)
    return `${numberById[volumeId]}권${p ? ` ${p.number}부` : ''}`
  }
  const blockedFor = (ref, volumeId) => {
    const c = canPlace(rows, ref, volumeId)
    return c.ok ? null : placeErrorText(c.reason, numberById[volumeId])
  }
  const partFor = (genre, volumeId) => defaultPartFor(genre, partsByVolume.get(volumeId) || [])
  const fromLabel = row => {
    if (!row._moved) return null
    if (row._moved.fromVolumeId !== row.volume_id) return `${numberById[row._moved.fromVolumeId]}권에서`
    const p = partById.get(row._moved.fromPartId)
    return p ? `${p.number}부에서` : '미배정에서'
  }

  async function enterEdit() {
    try {
      const vw = await load()
      setBaseline(vw)
      setDraft(EMPTY_DRAFT)
      setSaveResult(null)
      setEditing(true)
    } catch (err) {
      show(err.message)
    }
  }

  function finishEdit() {
    setEditing(false)
    setDraft(EMPTY_DRAFT)
  }

  function cancelEdit() {
    if (dirtyCount && !window.confirm(leaveText(dirtyCount))) return
    finishEdit()
  }

  async function openSave() {
    setSaveOpen(true)
    setAttachments(null)
    try {
      setAttachments(countAttachments(await listAttachmentRefs(Object.keys(draft.removes))))
    } catch (err) {
      show(err.message)
      setSaveOpen(false)
    }
  }

  // 설계 §3.2: 최신 상태를 다시 읽고 → 계획 → 한 건씩 반영 → 결과 표시 → 새로 읽고 편집 끝
  async function confirmSave() {
    setSaving(true)
    let latestRows
    let latestParts
    try {
      ;[latestRows, latestParts] = await Promise.all([listAllVolumeWorks(), listAllParts()])
    } catch (err) {
      show(err.message) // 편집 내용은 그대로 — 다시 저장할 수 있다
      setSaving(false)
      return
    }
    const plan = planSave({ draft, baseline, latestRows, latestParts })
    const result = await runSave(plan, SAVE_API, { registryMap: new Map() })
    setSaving(false)
    setSaveOpen(false)
    setSaveResult(result)
    finishEdit()
    load().catch(err => show(err.message))
  }

  function rowTrailing(row) {
    if (row._removed) {
      return (
        <button type="button" onClick={() => setDraft(d => revertRow(d, row.id))}
          className="shrink-0 rounded border border-gray-300 px-1.5 py-0.5 text-xs text-gray-600">되돌리기</button>
      )
    }
    const title = row.work_snapshot?.title
    return (
      <CompareMoveMenu
        label={`「${title}」 메뉴`}
        triggerText="⋯"
        triggerClass="shrink-0 rounded px-1 text-gray-500 hover:bg-gray-100"
        volumes={volumes}
        partsByVolume={partsByVolume}
        initialVolumeId={row.volume_id}
        initialPartFor={vid => (vid === row.volume_id ? row.part_id : partFor(row.work_snapshot?.genre, vid))}
        blockedText={vid => blockedFor({ workId: row.work_id, key: row._key, selfId: row.id }, vid)}
        confirmText="옮기기"
        onConfirm={(vid, pid) => setDraft(d => moveRow(d, baseline, row.id, vid, pid))}
        onRemove={() => setDraft(d => removeRow(d, row.id))}
        onRevert={row._moved || row._added ? () => setDraft(d => revertRow(d, row.id)) : null}
      />
    )
  }

  if (loading) return <p className="text-gray-500">불러오는 중…</p>

  const header = editing ? (
    <div className="sticky top-0 z-30 mb-3 flex flex-wrap items-center gap-3 rounded border border-blue-200 bg-blue-50 px-3 py-2">
      <h2 className="text-lg font-bold">권별 비교</h2>
      <span className="text-sm text-blue-800">편집 중 · 바뀐 작품 {dirtyCount}건</span>
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={cancelEdit}
          className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-600">취소</button>
        <button type="button" onClick={openSave} disabled={!dirtyCount}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-40">저장</button>
      </div>
    </div>
  ) : (
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
      <div className="ml-auto flex gap-2">
        <button type="button" onClick={enterEdit} disabled={!volumes.length}
          className="rounded border border-blue-300 px-3 py-1 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-40">
          편집
        </button>
        <button
          type="button"
          onClick={() => downloadCompareExcel({ volumes, allVw, allParts, confirmedOnly })}
          disabled={!volumes.length}
          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          엑셀로 저장
        </button>
      </div>
    </div>
  )

  return (
    <div>
      {header}
      {saveResult && <SaveResult result={saveResult} onClose={() => setSaveResult(null)} />}
      <div className="flex items-start gap-4">
        <div className="@container min-w-0 flex-1">
          <SummaryTable columns={columns} />
          <div className="grid gap-4 pb-4 @2xl:grid-cols-2 @4xl:grid-cols-3 @7xl:grid-cols-4">
            {columns.map(({ volume: v, groups, counts }) => {
              const name = `${v.number}권 ${v.title}`
              const meta = [`${totalOf(counts)}편`, eraSummary(counts), v.status].filter(Boolean).join(' · ')
              const hasParts = groups.some(g => g.label)
              const headClass = 'block border-b border-gray-200 bg-gray-50 px-3 py-2 font-semibold'
              const head = <>{name}<span className="ml-2 text-xs font-normal text-gray-500">{meta}</span></>
              return (
                <section key={v.id} aria-label={name} className="rounded border border-gray-200">
                  {editing
                    ? <div className={headClass}>{head}</div>
                    : <Link to={`/volumes/${v.id}`} className={`${headClass} hover:bg-gray-100`}>{head}</Link>}
                  <div className={`max-h-[70vh] overflow-y-auto px-2 pb-2 ${hasParts ? '' : 'pt-2'}`}>
                    {groups.map((g, i) => (
                      <div key={g.part ? g.part.id : `none-${i}`}>
                        {g.label && <PartBand group={g} first={i === 0} />}
                        <ul className="mt-1 space-y-0.5">
                          {g.works.map(w => (
                            <CompareWorkRow
                              key={w.id}
                              row={w}
                              others={(volumesByWork.get(w.work_id) || []).filter(id => id !== v.id).map(id => numberById[id]).sort((a, b) => a - b)}
                              warnings={warnings.get(w.id) || []}
                              fromLabel={fromLabel(w)}
                              trailing={editing ? rowTrailing(w) : null}
                            />
                          ))}
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
      </div>
      {saveOpen && (
        <CompareSaveDialog
          items={describeDraft(draft, baseline, place)}
          attachments={attachments}
          warnings={warnings}
          saving={saving}
          onConfirm={confirmSave}
          onCancel={() => setSaveOpen(false)}
        />
      )}
    </div>
  )
}
