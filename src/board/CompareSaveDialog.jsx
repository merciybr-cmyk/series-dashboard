// 권별 비교 저장 확인 창 (설계 2026-10-02 §3.1): 무엇이 바뀌는지, 빼면 함께 지워지는 것, 경고
import { WARNING_LABELS } from './compareUtils.js'
import { attachmentText } from './compareSave.js'

function lineOf(i) {
  if (i.kind === 'move') return `〈${i.title}〉 ${i.from} → ${i.to}`
  if (i.kind === 'add') return `〈${i.title}〉 → ${i.to} (새로)`
  if (i.kind === 'order') return `${i.to} — 순서 변경`
  return `〈${i.title}〉 ${i.from}에서 빼기`
}

export default function CompareSaveDialog({ items, attachments, warnings, saving, onConfirm, onCancel }) {
  const count = kind => items.filter(i => i.kind === kind).length
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div role="dialog" aria-modal="true" aria-label="저장 확인"
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded bg-white p-4 shadow-xl">
        <h3 className="mb-1 font-bold">저장할까요?</h3>
        <p className="mb-3 text-sm text-gray-600">옮기기 {count('move')} · 넣기 {count('add')} · 빼기 {count('remove')} · 순서 {count('order')}</p>
        <ul className="mb-4 space-y-1 text-sm">
          {items.map(i => {
            const w = warnings.get(i.rowId) || []
            const att = i.kind === 'remove' ? attachmentText(attachments?.get(i.rowId)) : ''
            return (
              <li key={`${i.kind}-${i.rowId}`}>
                <span>{lineOf(i)}</span>
                {w.length > 0 && <span className="ml-1 text-xs text-red-700">⚠ {w.map(k => WARNING_LABELS[k]).join(' · ')}</span>}
                {att && <div className="text-xs text-red-600">{att}</div>}
              </li>
            )
          })}
        </ul>
        {attachments === null && <p className="mb-2 text-xs text-gray-400">딸린 업무·의견·자료를 확인하는 중…</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={saving}
            className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 disabled:opacity-40">돌아가기</button>
          <button type="button" onClick={onConfirm} disabled={saving || attachments === null}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-40">
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
