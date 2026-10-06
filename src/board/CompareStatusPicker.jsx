// 권별 비교 편집 중 선정 상태 고르기 (2026-10-06 compare-status): 줄의 상태 표시를 누르면 후보·보류·확정 단추가 뜬다.
// 권 칸은 스크롤 영역이라 잘리지 않게 body에 띄우고, 스크롤하면 닫는다 (자리가 어긋나지 않게).
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SELECTION_LABELS } from './constants.js'
import { SELECTION_BADGE } from './CompareWorkRow.jsx'

// 제외는 비교 화면에서 보이지 않게 되는 상태라 여기서는 고르지 않는다 (빼기를 쓴다)
const PICKABLE = ['candidate', 'hold', 'confirmed']
const BOX_WIDTH = 150

export default function CompareStatusPicker({ title, status, original = null, onPick }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef(null)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => {
      if (!boxRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = e => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open])

  function toggle() {
    if (!open) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.right - BOX_WIDTH, window.innerWidth - BOX_WIDTH - 8)) })
    }
    setOpen(o => !o)
  }

  function pick(s) {
    onPick(s)
    setOpen(false)
  }

  return (
    <>
      <button ref={btnRef} type="button" aria-label={`「${title}」 상태`} onClick={toggle}
        title={original ? `원래 ${SELECTION_LABELS[original]}` : undefined}
        className={`shrink-0 rounded px-1 py-0.5 text-xs ${SELECTION_BADGE[status]} ${original ? 'ring-2 ring-blue-400' : 'hover:ring-1 hover:ring-gray-300'}`}>
        {SELECTION_LABELS[status]}<span aria-hidden="true" className="ml-0.5 opacity-60">▾</span>
      </button>
      {open && createPortal(
        <div ref={boxRef} role="dialog" aria-label={`「${title}」 상태 고르기`}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: BOX_WIDTH }}
          className="z-50 flex justify-between gap-1 rounded border border-gray-200 bg-white p-1.5 shadow-lg">
          {PICKABLE.map(s => (
            <button key={s} type="button" aria-pressed={s === status} onClick={() => pick(s)}
              className={`flex-1 rounded px-1.5 py-1 text-xs ${SELECTION_BADGE[s]} ${s === status ? 'ring-2 ring-blue-500' : 'hover:ring-1 hover:ring-gray-300'}`}>
              {SELECTION_LABELS[s]}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
