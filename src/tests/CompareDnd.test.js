import { vi } from 'vitest'
import { visiblePointerWithin } from '../board/CompareDnd.jsx'

const rect = (left, top, right, bottom) => ({
  left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top,
})

// el의 화면 위치를 흉내 낸다 (jsdom은 레이아웃이 없다)
function stub(el, r) {
  el.getBoundingClientRect = vi.fn(() => rect(...r))
  return el
}

// dnd-kit droppableContainers 항목 모양: { id, node: { current } }
const container = (id, node) => ({ id, node: { current: node } })

function mount(parent, className) {
  const el = document.createElement('div')
  if (className) el.setAttribute(className, '')
  parent.appendChild(el)
  return el
}

describe('visiblePointerWithin', () => {
  let root
  beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root) })
  afterEach(() => { root.remove() })

  test('포인터가 부 영역과 스크롤 칸 안에 모두 있으면 그 부를 돌려준다', () => {
    const clip = stub(mount(root, 'data-drop-clip'), [0, 0, 300, 500])
    const zone = stub(mount(clip), [10, 100, 290, 200])
    const c = container('drop:6:p3', zone)
    const out = visiblePointerWithin({ pointerCoordinates: { x: 100, y: 150 }, droppableContainers: [c] })
    expect(out).toEqual([{ id: 'drop:6:p3', data: { droppableContainer: c, value: 0 } }])
  })

  test('포인터가 부 영역 안이지만 스크롤 칸 밖이면(스크롤로 가려진 부) 비어 있다', () => {
    const clip = stub(mount(root, 'data-drop-clip'), [0, 0, 300, 500])
    // 부는 스크롤로 칸 아래로 밀려나 있다 (y 600~700)
    const zone = stub(mount(clip), [10, 600, 290, 700])
    const out = visiblePointerWithin({
      pointerCoordinates: { x: 100, y: 650 }, droppableContainers: [container('drop:6:p3', zone)],
    })
    expect(out).toEqual([])
  })

  test('스크롤 칸 조상이 없는 부는 자기 영역만 본다', () => {
    const zone = stub(mount(root), [0, 0, 100, 100])
    const c = container('drop:1:none', zone)
    const out = visiblePointerWithin({ pointerCoordinates: { x: 50, y: 50 }, droppableContainers: [c] })
    expect(out).toEqual([{ id: 'drop:1:none', data: { droppableContainer: c, value: 0 } }])
  })

  test('가장자리(경계)도 안으로 친다', () => {
    const zone = stub(mount(root), [0, 0, 100, 100])
    const c = container('z', zone)
    expect(visiblePointerWithin({ pointerCoordinates: { x: 0, y: 0 }, droppableContainers: [c] })).toHaveLength(1)
    expect(visiblePointerWithin({ pointerCoordinates: { x: 100, y: 100 }, droppableContainers: [c] })).toHaveLength(1)
    expect(visiblePointerWithin({ pointerCoordinates: { x: 101, y: 100 }, droppableContainers: [c] })).toHaveLength(0)
  })

  test('pointerCoordinates가 null이면 비어 있다', () => {
    const zone = stub(mount(root), [0, 0, 100, 100])
    const out = visiblePointerWithin({ pointerCoordinates: null, droppableContainers: [container('z', zone)] })
    expect(out).toEqual([])
  })

  test('노드가 아직 없는 droppable은 건너뛴다', () => {
    const out = visiblePointerWithin({
      pointerCoordinates: { x: 5, y: 5 }, droppableContainers: [container('z', null)],
    })
    expect(out).toEqual([])
  })

  test('두 부 중 포인터 아래에 있는 부만 돌려준다', () => {
    const clip = stub(mount(root, 'data-drop-clip'), [0, 0, 300, 500])
    const a = stub(mount(clip), [0, 0, 300, 100])
    const b = stub(mount(clip), [0, 100, 300, 200])
    const ca = container('drop:8:p1', a)
    const cb = container('drop:8:p2', b)
    const out = visiblePointerWithin({ pointerCoordinates: { x: 150, y: 150 }, droppableContainers: [ca, cb] })
    expect(out).toEqual([{ id: 'drop:8:p2', data: { droppableContainer: cb, value: 0 } }])
  })

  test('줄(anchorId가 있는 놓을 곳)은 부보다 먼저, 포인터가 줄 가운데보다 위면 before·아래면 after', () => {
    const clip = stub(mount(root, 'data-drop-clip'), [0, 0, 300, 500])
    const zone = stub(mount(clip), [0, 0, 300, 200])
    const rowEl = stub(mount(zone), [0, 40, 300, 60])
    const cz = container('drop:1:p2', zone)
    const cr = { ...container('row-drop:a', rowEl), data: { current: { anchorId: 'a' } } }
    const up = visiblePointerWithin({ pointerCoordinates: { x: 10, y: 45 }, droppableContainers: [cz, cr] })
    expect(up.map(c => c.id)).toEqual(['row-drop:a', 'drop:1:p2'])
    expect(up[0].data).toEqual({ droppableContainer: cr, value: 0, position: 'before' })
    expect(up[1].data).toEqual({ droppableContainer: cz, value: 0 })
    const down = visiblePointerWithin({ pointerCoordinates: { x: 10, y: 55 }, droppableContainers: [cz, cr] })
    expect(down[0].data.position).toBe('after')
  })
})
