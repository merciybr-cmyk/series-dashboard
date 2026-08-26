// 자료실: volume_work_id 없는 공용 자료 — 회의록 등 소용량 업로드 + 클라우드 링크 등록
import { useEffect, useMemo, useRef, useState } from 'react'
import { listLibraryFiles, uploadLibraryFile, addLibraryLink, deleteFile, getFileUrl, listVolumes, listMembers } from './volumeApi.js'
import { useToast } from '../components/Toast.jsx'

export default function LibraryPage() {
  const [files, setFiles] = useState([])
  const [volumes, setVolumes] = useState([])
  const [members, setMembers] = useState([])
  const [filterVolumeId, setFilterVolumeId] = useState('all')
  const [uploadVolumeId, setUploadVolumeId] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkVolumeId, setLinkVolumeId] = useState('')
  const fileInputRef = useRef(null)
  const { show } = useToast()

  useEffect(() => {
    listLibraryFiles().then(setFiles).catch(() => setFiles([]))
    listVolumes().then(setVolumes).catch(() => setVolumes([]))
    listMembers().then(setMembers).catch(() => setMembers([]))
  }, [])

  const memberName = id => members.find(m => m.id === id)?.name || '알 수 없음'
  const volumeTag = volumeId => {
    if (!volumeId) return '공통'
    const v = volumes.find(v => v.id === volumeId)
    return v ? `${v.number}권` : '공통'
  }

  const filteredFiles = useMemo(() => {
    if (filterVolumeId === 'all') return files
    if (filterVolumeId === '공통') return files.filter(f => !f.volume_id)
    return files.filter(f => f.volume_id === filterVolumeId)
  }, [files, filterVolumeId])

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 50 * 1024 * 1024) {
      show('50MB 이하 파일만 업로드할 수 있습니다. 링크 첨부를 이용해 주세요.')
      return
    }
    try {
      const row = await uploadLibraryFile(file, uploadVolumeId || null)
      setFiles(fs => [row, ...fs])
    } catch (err) {
      show(err.message)
    }
  }

  async function submitLink() {
    const name = linkName.trim()
    const url = linkUrl.trim()
    if (!name || !url) return
    try {
      const row = await addLibraryLink(name, url, linkVolumeId || null)
      setFiles(fs => [row, ...fs])
      setLinkOpen(false); setLinkName(''); setLinkUrl(''); setLinkVolumeId('')
    } catch (err) {
      show(err.message)
    }
  }

  async function removeFile(f) {
    if (!window.confirm(`'${f.name}' 자료를 삭제할까요?`)) return
    try {
      await deleteFile(f)
      setFiles(fs => fs.filter(x => x.id !== f.id))
    } catch (err) {
      show(err.message)
    }
  }

  async function openFile(f) {
    if (f.kind === 'link') { window.open(f.url, '_blank', 'noopener'); return }
    try {
      window.open(await getFileUrl(f.storage_path, f.name), '_blank', 'noopener')
    } catch (err) {
      show(err.message)
    }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="mb-1 text-lg font-bold">자료실</h2>
      <p className="mb-4 text-sm text-gray-500">
        서버 업로드는 회의록 등 소용량 파일만(50MB), 원고·PDF 등 대용량 자료는 클라우드 링크로 등록해 주세요
      </p>

      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm" htmlFor="library-filter">권 필터</label>
        <select
          id="library-filter"
          aria-label="권 필터"
          value={filterVolumeId}
          onChange={e => setFilterVolumeId(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="all">전체</option>
          <option value="공통">공통(권 없음)</option>
          {volumes.map(v => <option key={v.id} value={v.id}>{v.number}권 {v.title}</option>)}
        </select>
      </div>

      <ul className="mb-4 space-y-1">
        {filteredFiles.map(f => (
          <li key={f.id} className="flex items-center gap-2 rounded border border-gray-100 px-3 py-2 text-sm">
            <button type="button" onClick={() => openFile(f)}
              className="min-w-0 flex-1 truncate text-left text-blue-700 hover:underline">
              <span>{f.kind === 'link' ? '🔗' : '📄'}</span> <span>{f.name}</span>
            </button>
            <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{volumeTag(f.volume_id)}</span>
            <span className="shrink-0 text-xs text-gray-400">
              {memberName(f.uploaded_by)} · {new Date(f.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
            </span>
            <button type="button" aria-label={`${f.name} 삭제`} onClick={() => removeFile(f)}
              className="shrink-0 text-gray-300 hover:text-red-500">✕</button>
          </li>
        ))}
        {!filteredFiles.length && <li className="text-sm text-gray-400">등록된 자료가 없습니다</li>}
      </ul>

      <div className="flex flex-wrap items-center gap-2 rounded border border-gray-200 p-3">
        <label className="text-sm" htmlFor="library-upload-volume">등록할 권</label>
        <select
          id="library-upload-volume"
          aria-label="등록할 권"
          value={uploadVolumeId}
          onChange={e => setUploadVolumeId(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          <option value="">공통(권 미지정)</option>
          {volumes.map(v => <option key={v.id} value={v.id}>{v.number}권 {v.title}</option>)}
        </select>
        <input ref={fileInputRef} type="file" aria-label="자료실 파일 선택" onChange={handleUpload} className="hidden" />
        <button type="button" onClick={() => fileInputRef.current?.click()}
          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600">회의록 업로드</button>
        <button type="button" onClick={() => setLinkOpen(o => !o)}
          className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600">클라우드 링크 등록</button>
      </div>

      {linkOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-gray-200 p-3">
          <input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="자료 이름"
            className="rounded border border-gray-300 px-2 py-1 text-sm" />
          <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…"
            className="rounded border border-gray-300 px-2 py-1 text-sm" />
          <select
            aria-label="링크 등록 권"
            value={linkVolumeId}
            onChange={e => setLinkVolumeId(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">공통(권 미지정)</option>
            {volumes.map(v => <option key={v.id} value={v.id}>{v.number}권 {v.title}</option>)}
          </select>
          <button type="button" onClick={submitLink}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white">등록</button>
        </div>
      )}
    </div>
  )
}
