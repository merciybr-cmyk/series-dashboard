// 부 탭(전체/N부/미배정) + 부 관리 팝오버 (설계 §5.1 부 흐름)
import { useEffect, useRef, useState } from 'react'
import { partLabel } from './boardUtils.js'

export default function PartControls({ parts, activePart, onSelect, onAddPart, onRenamePart, onRemovePart }) {
  const [managing, setManaging] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setManaging(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const tab = (key, label) => (
    <button
      key={key}
      type="button"
      onClick={() => onSelect(key)}
      className={`rounded px-2 py-1 text-sm ${activePart === key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1">
      {parts.length > 0 && (
        <>
          {tab('all', '전체')}
          {parts.map(p => tab(p.id, partLabel(p)))}
          {tab('none', '미배정')}
        </>
      )}
      <div className="relative ml-auto" ref={ref}>
        <button type="button" onClick={() => setManaging(m => !m)}
          className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-600">
          부 관리
        </button>
        {managing && (
          <div className="absolute right-0 z-20 mt-1 w-64 rounded border border-gray-200 bg-white p-3 shadow-lg">
            <ul className="mb-2 space-y-1">
              {parts.map(p => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="w-9 shrink-0">{p.number}부</span>
                  <input
                    aria-label={`${p.number}부 제목`}
                    defaultValue={p.title || ''}
                    placeholder="제목 (확정 후 입력)"
                    onBlur={e => e.target.value !== (p.title || '') && onRenamePart(p.id, e.target.value)}
                    className="min-w-0 flex-1 rounded border border-gray-200 px-1.5 py-0.5"
                  />
                  <button
                    type="button"
                    aria-label={`${p.number}부 삭제`}
                    onClick={() => {
                      if (window.confirm(`${p.number}부를 삭제할까요? 소속 작품은 미배정으로 이동합니다.`)) onRemovePart(p.id)
                    }}
                    className="text-gray-300 hover:text-red-500"
                  >✕</button>
                </li>
              ))}
              {!parts.length && <li className="text-xs text-gray-400">아직 부가 없습니다. 부 없이도 사용할 수 있습니다.</li>}
            </ul>
            <button type="button" onClick={onAddPart}
              className="w-full rounded border border-dashed border-gray-300 py-1 text-sm text-gray-500 hover:border-gray-400">
              부 추가
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
