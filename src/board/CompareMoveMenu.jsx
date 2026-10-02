// 권별 비교의 떠 있는 메뉴 (2026-10-02): 권·부를 골라 옮기거나(작품 ⋯) 넣는다(검색 패널 '넣기').
// 권 칸은 스크롤 영역이라 메뉴가 잘리지 않게 body에 띄운다.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { partLabel } from './boardUtils.js'

export default function CompareMoveMenu({
  label, triggerText, triggerClass, volumes, partsByVolume, initialVolumeId = '', initialPartFor,
  blockedText, confirmText, onConfirm, onRemove = null, onRevert = null, order = null,
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const [volumeId, setVolumeId] = useState(initialVolumeId)
  const [partId, setPartId] = useState('')
  const btnRef = useRef(null)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = e => {
      if (!boxRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) setOpen(false)
    }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function toggle() {
    if (!open) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 296)) })
      setVolumeId(initialVolumeId)
      setPartId((initialVolumeId && initialPartFor(initialVolumeId)) || '')
    }
    setOpen(o => !o)
  }

  function pickVolume(id) {
    setVolumeId(id)
    setPartId((id && initialPartFor(id)) || '')
  }

  function act(fn) {
    fn()
    setOpen(false)
  }

  const parts = partsByVolume.get(volumeId) || []
  const blocked = volumeId ? blockedText(volumeId) : null
  const ready = volumeId && !blocked && (parts.length === 0 || partId)

  return (
    <>
      <button ref={btnRef} type="button" aria-label={label} onClick={toggle} className={triggerClass}>{triggerText}</button>
      {open && createPortal(
        <div ref={boxRef} role="dialog" aria-label={label} style={{ position: 'fixed', top: pos.top, left: pos.left }}
          className="z-50 w-72 rounded border border-gray-200 bg-white p-3 text-sm shadow-lg">
          {order && (
            <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-gray-100 pb-2">
              <button type="button" disabled={!order.onUp} onClick={() => act(order.onUp)}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 disabled:opacity-40">위로</button>
              <button type="button" disabled={!order.onDown} onClick={() => act(order.onDown)}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 disabled:opacity-40">아래로</button>
              {order.onRevert && (
                <button type="button" onClick={() => act(order.onRevert)}
                  className="ml-auto text-xs text-gray-500 hover:underline">이 묶음 순서 되돌리기</button>
              )}
            </div>
          )}
          <div className="mb-2 flex gap-2">
            <select aria-label="권" value={volumeId} onChange={e => pickVolume(e.target.value)}
              className="min-w-0 flex-1 rounded border border-gray-300 px-1 py-1">
              <option value="">권 선택</option>
              {volumes.map(v => {
                const taken = !!blockedText(v.id)
                return <option key={v.id} value={v.id} disabled={taken}>{v.number}권{taken ? ' (이미 있음)' : ''}</option>
              })}
            </select>
            {parts.length > 0 && (
              <select aria-label="부" value={partId} onChange={e => setPartId(e.target.value)}
                className="min-w-0 flex-1 rounded border border-gray-300 px-1 py-1">
                <option value="">부 선택</option>
                {parts.map(p => <option key={p.id} value={p.id}>{partLabel(p)}</option>)}
              </select>
            )}
          </div>
          {blocked && <p className="mb-2 text-xs text-red-600">{blocked}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={!ready} onClick={() => act(() => onConfirm(volumeId, partId || null))}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40">
              {confirmText}
            </button>
            {onRevert && (
              <button type="button" onClick={() => act(onRevert)}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600">되돌리기</button>
            )}
            {onRemove && (
              <button type="button" onClick={() => act(onRemove)}
                className="ml-auto text-xs text-red-600 hover:underline">권에서 빼기</button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
