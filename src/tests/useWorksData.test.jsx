import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const CSV = '교육과정,장르,작품명,지은이,교과서명\n7차,소설,소나기,황순원,중학 국어 1-1'

const { useWorksData, _resetWorksCache } = await import('../works/useWorksData.js')

function Probe() {
  const { works, loading, error } = useWorksData()
  if (loading) return <div>로딩</div>
  if (error) return <div>오류:{error}</div>
  return <div>건수:{works.length} 첫작품:{works[0]?.['작품명']}</div>
}

beforeEach(() => {
  _resetWorksCache()
  vi.unstubAllGlobals()
  process.env.VITE_SHEETS_CSV_URL = 'https://example.com/sheets.csv'
})

test('CSV를 받아 파싱해 제공한다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CSV) }))
  render(<Probe />)
  await waitFor(() => expect(screen.getByText('건수:1 첫작품:소나기')).toBeInTheDocument())
})

test('실패하면 error를 제공한다', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
  render(<Probe />)
  await waitFor(() => expect(screen.getByText(/오류:/)).toBeInTheDocument())
})
