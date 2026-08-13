import { render, screen, waitFor, act } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../board/volumeApi.js', () => ({
  getBoard: vi.fn(),
  listMembers: vi.fn().mockResolvedValue([{ id: 'm1', name: '김편집' }]),
  subscribeBoard: vi.fn(() => () => {}),
  addWorkToVolume: vi.fn(),
  updateVolumeWork: vi.fn(),
  deleteVolumeWork: vi.fn(),
  applySortSwap: vi.fn(),
  addTasks: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
  createPart: vi.fn(),
  updatePart: vi.fn(),
  deletePart: vi.fn(),
}))
const api = await import('../board/volumeApi.js')
const { useVolumeBoard } = await import('../board/useVolumeBoard.js')
const { ToastProvider } = await import('../components/Toast.jsx')

// vi.mock 팩토리의 mock 함수들은 파일 내 테스트 간 호출 이력이 누적된다(clearMocks 미설정 환경).
// getBoard 호출 횟수를 테스트별로 독립 검증하기 위해 매 테스트 전 호출 이력만 초기화한다
// (mockResolvedValue 등 각 테스트가 직접 설정하는 구현은 mockClear로 지워지지 않음).
beforeEach(() => {
  vi.clearAllMocks()
})

const BOARD = {
  volume: { id: 'v1', number: 3, title: '성장' },
  works: [{ id: 'vw1', volume_id: 'v1', work_id: 'W000001', sort_order: 10, selection_status: 'candidate', production_status: 'not_started', work_snapshot: { title: '소나기', author: '황순원' } }],
  tasks: [{ id: 't1', volume_work_id: 'vw1', status: 'todo', title: '해제 작성' }],
  parts: [],
}

function Probe() {
  const { volume, works, tasksByVw, parts, loading, actions } = useVolumeBoard('v1')
  if (loading) return <div>로딩</div>
  return (
    <div>
      <div>권:{volume.number} 작품수:{works.length} vw1업무:{(tasksByVw.vw1 || []).length} 부:{parts.length}</div>
      <button onClick={() => actions.setTask('t1', { status: 'done' })}>완료</button>
      <button onClick={() => actions.addPart()}>부추가</button>
      <button onClick={() => actions.removePart('p1')}>부삭제</button>
      <button onClick={() => actions.move('w-c', 'up')}>이동</button>
    </div>
  )
}

function renderProbe() {
  return render(<ToastProvider><Probe /></ToastProvider>)
}

test('보드를 로드해 works/tasksByVw를 제공한다', async () => {
  api.getBoard.mockResolvedValue(BOARD)
  renderProbe()
  await waitFor(() => expect(screen.getByText('권:3 작품수:1 vw1업무:1 부:0')).toBeInTheDocument())
})

test('setTask 성공 시 로컬 상태를 패치한다', async () => {
  api.getBoard.mockResolvedValue(BOARD)
  api.updateTask.mockResolvedValue({ ...BOARD.tasks[0], status: 'done' })
  renderProbe()
  await waitFor(() => screen.getByText('완료'))
  await act(() => screen.getByText('완료').click())
  expect(api.updateTask).toHaveBeenCalledWith('t1', { status: 'done' })
})

test('실패하면 reload로 롤백한다', async () => {
  api.getBoard.mockResolvedValue(BOARD)
  api.updateTask.mockRejectedValue(new Error('네트워크 오류'))
  renderProbe()
  await waitFor(() => screen.getByText('완료'))
  await act(() => screen.getByText('완료').click())
  await waitFor(() => expect(api.getBoard).toHaveBeenCalledTimes(2)) // 초기 1 + 롤백 1
})

test('Realtime 이벤트가 오면 다시 로드한다', async () => {
  vi.useFakeTimers()
  api.getBoard.mockResolvedValue(BOARD)
  let fire
  api.subscribeBoard.mockImplementation(cb => { fire = cb; return () => {} })
  renderProbe()
  await act(async () => { await vi.runOnlyPendingTimersAsync() })
  act(() => { fire({}); fire({}) }) // 연속 2회 → 디바운스로 1회만
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })
  expect(api.getBoard).toHaveBeenCalledTimes(2)
  vi.useRealTimers()
})

test('addPart: 다음 번호로 생성해 parts에 반영한다', async () => {
  api.getBoard.mockResolvedValue({ ...BOARD, parts: [{ id: 'p1', number: 1, title: null }] })
  api.createPart.mockResolvedValue({ id: 'p2', number: 2, title: null })
  renderProbe()
  await waitFor(() => screen.getByText(/부:1/))
  await act(() => screen.getByText('부추가').click())
  expect(api.createPart).toHaveBeenCalledWith('v1', 2)
  await waitFor(() => expect(screen.getByText(/부:2/)).toBeInTheDocument())
})

test('removePart: 부 삭제 시 소속 작품이 미배정으로 패치된다', async () => {
  api.getBoard.mockResolvedValue({
    ...BOARD,
    parts: [{ id: 'p1', number: 1, title: null }],
    works: [{ ...BOARD.works[0], part_id: 'p1' }],
  })
  api.deletePart.mockResolvedValue()
  renderProbe()
  await waitFor(() => screen.getByText(/부:1/))
  await act(() => screen.getByText('부삭제').click())
  expect(api.deletePart).toHaveBeenCalledWith('p1')
  await waitFor(() => expect(screen.getByText(/부:0/)).toBeInTheDocument())
})

test('move: 부 그룹 내에서만 이웃과 교환한다(전체 배열 이웃이 아니라)', async () => {
  api.getBoard.mockResolvedValue({
    ...BOARD,
    parts: [{ id: 'p1', number: 1, title: null }, { id: 'p2', number: 2, title: null }],
    works: [
      { ...BOARD.works[0], id: 'w-a', part_id: 'p1', sort_order: 10 },
      { ...BOARD.works[0], id: 'w-b', part_id: 'p2', sort_order: 20 },
      { ...BOARD.works[0], id: 'w-c', part_id: 'p1', sort_order: 30 },
    ],
  })
  api.applySortSwap.mockResolvedValue()
  renderProbe()
  await waitFor(() => screen.getByText('이동'))
  await act(() => screen.getByText('이동').click())
  // w-c(부 p1)의 '위' 이웃은 전체 배열상 w-b(부 p2)가 아니라 같은 부의 w-a여야 한다.
  expect(api.applySortSwap).toHaveBeenCalledWith([
    { id: 'w-c', sort_order: 10 },
    { id: 'w-a', sort_order: 30 },
  ])
})

function ProbeWithError() {
  const { volume, works, loading, error } = useVolumeBoard('v1')
  if (loading) return <div>로딩</div>
  return <div>권:{volume.number} 작품수:{works.length} 에러:{error || '없음'}</div>
}

test('로드 후 배경 재조회 실패는 에러 화면으로 대체하지 않고 토스트로만 알린다', async () => {
  vi.useFakeTimers()
  api.getBoard.mockResolvedValueOnce(BOARD).mockRejectedValueOnce(new Error('네트워크 오류'))
  let fire
  api.subscribeBoard.mockImplementation(cb => { fire = cb; return () => {} })
  render(<ToastProvider><ProbeWithError /></ToastProvider>)
  await act(async () => { await vi.runOnlyPendingTimersAsync() })
  expect(screen.getByText('권:3 작품수:1 에러:없음')).toBeInTheDocument()

  act(() => { fire({}) })
  await act(async () => { await vi.advanceTimersByTimeAsync(400) })

  // 로드가 이미 성공한 뒤의 실패이므로 화면은 그대로 유지되고 (에러 상태로 대체되지 않음)
  expect(screen.getByText('권:3 작품수:1 에러:없음')).toBeInTheDocument()
  // 대신 토스트로 알린다
  expect(screen.getByText('네트워크 오류')).toBeInTheDocument()
  vi.useRealTimers()
})
