// 권별 비교 끌어다 놓기 부품 (@dnd-kit/core, 2026-10-02): 작품 줄·검색 결과는 손잡이(⋮⋮)로 끌고, 부 그룹에 놓는다.
import { useCallback } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import CompareWorkRow from './CompareWorkRow.jsx'

function Handle({ label, listeners, attributes }) {
  return (
    <button type="button" aria-label={label} {...attributes} {...listeners}
      className="shrink-0 cursor-grab touch-none px-0.5 text-gray-400 hover:text-gray-700">⋮⋮</button>
  )
}

// 줄은 끌 수 있고, 다른 줄을 이 줄 위·아래에 끼워 넣는 놓을 곳이기도 하다 (compare-order).
// droppable=false는 놓을 곳에서만 뺀다(끌 수는 있다) — 부가 있는 권의 미배정 묶음처럼 놓을 곳이 아닌 묶음의 줄
export function DraggableWorkRow({ row, droppable = true, ...rest }) {
  const title = row.work_snapshot?.title
  const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({
    id: `row:${row.id}`,
    data: { type: 'row', rowId: row.id, title },
  })
  const { setNodeRef: setDropRef } = useDroppable({
    id: `row-drop:${row.id}`,
    data: { volumeId: row.volume_id, partId: row.part_id ?? null, anchorId: row.id },
    disabled: !droppable,
  })
  const ref = useCallback(node => {
    setDragRef(node)
    setDropRef(node)
  }, [setDragRef, setDropRef])
  return (
    <CompareWorkRow ref={ref} row={row} dragging={isDragging}
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

// 충돌 판정: 포인터가 "화면에 실제로 보이는" 부 위에 있을 때만 놓을 곳으로 본다.
// 권 칸은 스크롤 영역이라 화면 밖으로 밀린 부도 크기를 가진다. 기본 rectIntersection은
// 끌고 있는 줄 전체 사각형과 잘려 나가지 않은 부 사각형을 견주어 엉뚱한 권·부에 놓이게 했다.
// 그래서 포인터 좌표와 살아 있는 DOM 사각형으로만 판정하고, 스크롤 칸([data-drop-clip])도 함께 본다.
// 2026-10-02 compare-order: 줄도 놓을 곳이다 — 줄을 부보다 먼저 돌려주고, 포인터가 줄 가운데보다 위면 before, 아니면 after.
const hits = (r, { x, y }) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom

export function visiblePointerWithin({ pointerCoordinates, droppableContainers }) {
  if (!pointerCoordinates) return []
  const out = []
  for (const c of droppableContainers) {
    const node = c.node.current
    if (!node) continue
    const r = node.getBoundingClientRect()
    if (!hits(r, pointerCoordinates)) continue
    const clip = node.closest('[data-drop-clip]')
    if (clip && !hits(clip.getBoundingClientRect(), pointerCoordinates)) continue
    const data = { droppableContainer: c, value: 0 }
    if (c.data?.current?.anchorId) data.position = pointerCoordinates.y < (r.top + r.bottom) / 2 ? 'before' : 'after'
    out.push({ id: c.id, data })
  }
  const isRow = hit => (hit.data.position ? 1 : 0)
  return out.sort((a, b) => isRow(b) - isRow(a))
}

export function DropZone({ volumeId, partId, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${volumeId}:${partId ?? 'none'}`, data: { volumeId, partId } })
  return <div ref={setNodeRef} className={`rounded ${isOver ? 'bg-blue-50 ring-2 ring-blue-300' : ''}`}>{children}</div>
}
