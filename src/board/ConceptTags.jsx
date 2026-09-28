// 갈래별 후보의 '어울리는 권' 칩 + 편집 팝오버 (설계 2026-09-28 §3.7)
// 자동 배치 때 태그된 권이 가점(+4)을 받는다.
import { useEffect, useRef, useState } from 'react'

export default function ConceptTags({ title, volumeIds, volumes, onSave }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const tagged = volumes.filter(v => volumeIds.includes(v.id)) // 삭제된 권 id는 자연히 무시
  function toggle(id) {
    onSave(volumeIds.includes(id) ? volumeIds.filter(x => x !== id) : [...volumeIds, id])
  }

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-label={`${title} 어울리는 권`}
        onClick={() => setOpen(o => !o)}
        className="rounded border border-dashed border-purple-300 px-1.5 py-0.5 text-xs text-purple-700 hover:bg-purple-50"
      >
        {tagged.length ? tagged.map(v => `${v.number}권`).join(' ') : '어울리는 권 +'}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded border border-gray-200 bg-white p-2 shadow-lg">
          <p className="mb-1 text-xs text-gray-500">자동 배치 때 가점을 받는 권</p>
          {volumes.map(v => (
            <label key={v.id} className="flex items-center gap-2 py-0.5 text-sm">
              <input type="checkbox" checked={volumeIds.includes(v.id)} onChange={() => toggle(v.id)} />
              <span className="shrink-0">{v.number}권</span>
              <span className="truncate text-xs text-gray-400">{v.title}</span>
            </label>
          ))}
          {!volumes.length && <p className="text-xs text-gray-400">권이 없습니다</p>}
        </div>
      )}
    </div>
  )
}
