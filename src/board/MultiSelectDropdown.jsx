import { useEffect, useRef, useState } from 'react'

export default function MultiSelectDropdown({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function toggle(value) {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value])
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`rounded border px-2 py-1 text-sm ${selected.length ? 'border-blue-400 text-blue-700' : 'border-gray-300 text-gray-600'}`}
      >
        {label}{selected.length ? ` ${selected.length}` : ''} ▾
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-44 overflow-auto rounded border border-gray-200 bg-white p-2 shadow-lg">
          {options.map(opt => (
            <label key={opt} className="flex items-center gap-2 py-0.5 text-sm">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
              {opt}
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 text-xs text-gray-500 underline">
              모두 해제
            </button>
          )}
        </div>
      )}
    </div>
  )
}
