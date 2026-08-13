// 작품 시트 CSV를 1회 로드해 모든 화면이 공유한다.
import { useEffect, useState } from 'react'
import { parseCSV } from './parseCSV.js'

let cache = null           // 성공한 works 배열
let inflight = null        // 진행 중 Promise (중복 fetch 방지)

export function _resetWorksCache() { // 테스트 전용
  cache = null
  inflight = null
}

async function loadWorks() {
  const url = import.meta.env.VITE_SHEETS_CSV_URL
  if (!url) throw new Error('VITE_SHEETS_CSV_URL 환경변수가 필요합니다')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`작품 데이터를 불러올 수 없습니다 (HTTP ${res.status})`)
  return parseCSV(await res.text())
}

export function useWorksData() {
  const [works, setWorks] = useState(cache || [])
  const [loading, setLoading] = useState(!cache)
  const [error, setError] = useState(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (cache) return
    let cancelled = false
    setLoading(true)
    setError(null)
    inflight = inflight || loadWorks()
    inflight
      .then(data => {
        cache = data
        if (!cancelled) setWorks(data)
      })
      .catch(err => {
        inflight = null
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [attempt])

  return { works, loading, error, retry: () => setAttempt(a => a + 1) }
}
