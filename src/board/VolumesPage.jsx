import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listVolumes, createVolume, updateVolume, deleteVolume } from './volumeApi.js'
import { useToast } from '../components/Toast.jsx'

export default function VolumesPage() {
  const [volumes, setVolumes] = useState([])
  const [loading, setLoading] = useState(true)
  const [number, setNumber] = useState('')
  const [title, setTitle] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editNumber, setEditNumber] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const { show } = useToast()

  useEffect(() => {
    listVolumes().then(setVolumes).catch(err => show(err.message)).finally(() => setLoading(false))
  }, [show])

  async function handleCreate(e) {
    e.preventDefault()
    try {
      const v = await createVolume({ number: Number(number), title: title.trim() })
      setVolumes(vs => [...vs, v].sort((a, b) => a.number - b.number))
      setNumber('')
      setTitle('')
    } catch (err) {
      show(/duplicate|23505/i.test(err.message) ? '이미 있는 권 번호입니다' : err.message)
    }
  }

  function startEdit(e, v) {
    e.preventDefault()
    setEditingId(v.id)
    setEditNumber(String(v.number))
    setEditTitle(v.title)
  }

  async function handleUpdate(e) {
    e.preventDefault()
    try {
      const v = await updateVolume(editingId, { number: Number(editNumber), title: editTitle.trim() })
      setVolumes(vs => vs.map(x => (x.id === v.id ? v : x)).sort((a, b) => a.number - b.number))
      setEditingId(null)
    } catch (err) {
      show(/duplicate|23505/i.test(err.message) ? '이미 있는 권 번호입니다' : err.message)
    }
  }

  async function handleDelete(e, v) {
    e.preventDefault()
    if (!window.confirm(`${v.number}권과 수록 목록·업무가 함께 삭제됩니다. 계속할까요? (변경 이력은 남습니다)`)) return
    try {
      await deleteVolume(v.id)
      setVolumes(vs => vs.filter(x => x.id !== v.id))
    } catch (err) {
      show(err.message)
    }
  }

  if (loading) return <p className="text-gray-500">불러오는 중…</p>

  return (
    <div className="max-w-3xl">
      <h2 className="mb-4 text-lg font-bold">권별 작품 목록</h2>

      <ul className="mb-6 space-y-2">
        {volumes.map(v => (
          <li key={v.id}>
            {editingId === v.id ? (
              <form onSubmit={handleUpdate} className="flex items-end gap-3 rounded border border-blue-300 px-4 py-3">
                <div>
                  <label className="block text-xs text-gray-500" htmlFor={`edit-number-${v.id}`}>권 번호 수정</label>
                  <input id={`edit-number-${v.id}`} aria-label="권 번호 수정" type="number" required min="1"
                    value={editNumber} onChange={e => setEditNumber(e.target.value)}
                    className="w-24 rounded border border-gray-300 px-2 py-1" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500" htmlFor={`edit-title-${v.id}`}>주제명 수정</label>
                  <input id={`edit-title-${v.id}`} aria-label="주제명 수정" required
                    value={editTitle} onChange={e => setEditTitle(e.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1" />
                </div>
                <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">저장</button>
                <button type="button" onClick={() => setEditingId(null)} className="text-sm text-gray-500">취소</button>
              </form>
            ) : (
              <Link
                to={`/volumes/${v.id}`}
                className="flex items-center gap-3 rounded border border-gray-200 px-4 py-3 hover:bg-gray-50"
              >
                <span className="font-semibold">{v.number}권</span>
                <span className="flex-1">{v.title}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{v.status}</span>
                <button type="button" onClick={e => startEdit(e, v)}
                  className="text-xs text-gray-400 underline hover:text-gray-700">수정</button>
                <button type="button" onClick={e => handleDelete(e, v)}
                  className="text-xs text-red-300 underline hover:text-red-600">삭제</button>
              </Link>
            )}
          </li>
        ))}
        {!volumes.length && <li className="text-sm text-gray-500">아직 권이 없습니다. 아래에서 추가하세요.</li>}
      </ul>

      <form onSubmit={handleCreate} className="flex items-end gap-3 rounded border border-gray-200 p-4">
        <div>
          <label className="block text-xs text-gray-500" htmlFor="vol-number">권 번호</label>
          <input id="vol-number" type="number" required min="1" value={number}
            onChange={e => setNumber(e.target.value)}
            className="w-24 rounded border border-gray-300 px-2 py-1" />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500" htmlFor="vol-title">주제명</label>
          <input id="vol-title" required value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="예: 다양한 삶의 모습"
            className="w-full rounded border border-gray-300 px-2 py-1" />
        </div>
        <button type="submit" className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white">
          새 권 추가
        </button>
      </form>
    </div>
  )
}
