// 권별 비교 끌어다 놓기 부품 (@dnd-kit/core, 2026-10-02): 작품 줄·검색 결과는 손잡이(⋮⋮)로 끌고, 부 그룹에 놓는다.
import { useDraggable, useDroppable } from '@dnd-kit/core'
import CompareWorkRow from './CompareWorkRow.jsx'

function Handle({ label, listeners, attributes }) {
  return (
    <button type="button" aria-label={label} {...attributes} {...listeners}
      className="shrink-0 cursor-grab touch-none px-0.5 text-gray-400 hover:text-gray-700">⋮⋮</button>
  )
}

export function DraggableWorkRow({ row, ...rest }) {
  const title = row.work_snapshot?.title
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: `row:${row.id}`,
    data: { type: 'row', rowId: row.id, title },
  })
  return (
    <CompareWorkRow ref={setNodeRef} row={row} dragging={isDragging}
      leading={<Handle label={`「${title}」 끌기`} listeners={listeners} attributes={attributes} />} {...rest} />
  )
}

// SearchPane의 itemComponent로 쓴다
export function DraggableSheetItem({ itemKey, work, getCurricula, className, children }) {
  const title = work['작품명']
  const { setNodeRef, listeners, attributes } = useDraggable({
    id: `sheet:${itemKey}`,
    data: { type: 'sheet', key: itemKey, work, getCurricula, title },
  })
  return (
    <li ref={setNodeRef} className={className}>
      <Handle label={`「${title}」 끌기`} listeners={listeners} attributes={attributes} />
      {children}
    </li>
  )
}

export function DropZone({ volumeId, partId, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${volumeId}:${partId ?? 'none'}`, data: { volumeId, partId } })
  return <div ref={setNodeRef} className={`rounded ${isOver ? 'bg-blue-50 ring-2 ring-blue-300' : ''}`}>{children}</div>
}
