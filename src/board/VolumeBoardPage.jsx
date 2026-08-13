// 권 보드 화면 조립: 좌 검색, 우 수록 목록, 우측 끝 상세 패널
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useWorksData } from '../works/useWorksData.js'
import { buildRegistryMap, workKeyOf, keyOf } from '../works/workKey.js'
import { useVolumeBoard } from './useVolumeBoard.js'
import * as api from './volumeApi.js'
import SearchPane from './SearchPane.jsx'
import VolumeWorkList from './VolumeWorkList.jsx'
import WorkDetailPanel from './WorkDetailPanel.jsx'
import { useToast } from '../components/Toast.jsx'

const VOLUME_STATUSES = ['기획', '선정중', '확정', '제작중', '완료']
const EMPTY_TASKS = []

export default function VolumeBoardPage() {
  const { id: volumeId } = useParams()
  const { works: sheetWorks, loading: sheetLoading, error: sheetError, retry } = useWorksData()
  const board = useVolumeBoard(volumeId)
  const { show } = useToast()

  const [registry, setRegistry] = useState([])
  const [allVw, setAllVw] = useState([])
  const [selectedId, setSelectedId] = useState(null)

  const loadDupData = useCallback(() => {
    api.listRegistry().then(setRegistry).catch(() => {})
    api.listAllVolumeWorks().then(setAllVw).catch(() => {})
  }, [])
  useEffect(loadDupData, [loadDupData, board.works])

  const registryMap = useMemo(() => buildRegistryMap(registry), [registry])

  // work_id → 수록처 목록, 그리고 시트 키 → 수록처 목록 (registry 경유)
  const duplicatesByWorkId = useMemo(() => {
    const map = new Map()
    for (const vw of allVw) {
      if (!map.has(vw.work_id)) map.set(vw.work_id, [])
      map.get(vw.work_id).push({ volumeNumber: vw.volumes?.number, volumeId: vw.volume_id, selection_status: vw.selection_status })
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

  async function handleAdd(work, curricula) {
    const row = await board.actions.addWork(work, curricula, registryMap)
    if (row) setSelectedId(row.id)
  }

  async function handleVolumeStatus(status) {
    try {
      await api.updateVolume(volumeId, { status })
      board.actions.reload()
    } catch (err) {
      show(err.message)
    }
  }

  if (board.loading) return <p className="text-gray-500">불러오는 중…</p>
  if (board.error) return (
    <p className="text-red-600">
      권을 불러올 수 없습니다: {board.error}
      <button type="button" onClick={board.actions.reload} className="ml-2 rounded border px-3 py-1 text-sm">다시 시도</button>
    </p>
  )

  const selectedVw = board.works.find(w => w.id === selectedId) || null
  const selectedDups = selectedVw
    ? (duplicatesByWorkId.get(selectedVw.work_id) || []).filter(d => d.volumeId !== volumeId)
    : []

  return (
    <div className="flex h-[calc(100vh-7rem)] flex-col">
      <div className="mb-3 flex items-center gap-3">
        <Link to="/volumes" className="text-sm text-gray-400 hover:text-gray-700">← 권 목록</Link>
        <h2 className="text-lg font-bold">{board.volume.number}권</h2>
        <span>{board.volume.title}</span>
        <select
          value={board.volume.status}
          onChange={e => handleVolumeStatus(e.target.value)}
          aria-label="권 상태"
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {VOLUME_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="ml-auto text-sm text-gray-400">
          수록 {board.works.length}건 · 확정 {board.works.filter(w => w.selection_status === 'confirmed').length}건
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="w-96 shrink-0 rounded border border-gray-200 p-3">
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
          <VolumeWorkList
            works={board.works}
            tasksByVw={board.tasksByVw}
            members={board.members}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMove={board.actions.move}
          />
        </div>

        {selectedVw && (
          <WorkDetailPanel
            volumeWork={selectedVw}
            tasks={board.tasksByVw[selectedVw.id] || EMPTY_TASKS}
            members={board.members}
            duplicates={selectedDups}
            actions={board.actions}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  )
}
