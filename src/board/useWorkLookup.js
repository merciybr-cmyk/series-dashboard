// 검색 패널용 작품 조회 (2026-10-02 권별 비교): registry·갈래 후보를 필요할 때 불러와 시트 키 기준 맵을 만든다.
// 권 보드·갈래별 후보 화면에도 같은 계산이 있다 — 그쪽은 회귀 위험 때문에 이번엔 바꾸지 않음(추후 이 훅으로 정리).
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from './volumeApi.js'
import { buildRegistryMap, keyOf } from '../works/workKey.js'

function keysOfRegistryRow(row) {
  return [keyOf(row.title, row.author_base), ...(row.aliases || []).map(a => keyOf(a.title, a.author_base))]
}

// 갈래별 후보의 시트 키 집합 (별칭 포함) — 검색 '갈래 후보만' 필터용
export function buildPickKeys(picks, registry) {
  const pickIds = new Set(picks.map(p => p.work_id))
  const keys = new Set()
  for (const row of registry) {
    if (!pickIds.has(row.work_id)) continue
    for (const k of keysOfRegistryRow(row)) keys.add(k)
  }
  return keys
}

// 시트 키 → 수록처. rows는 화면에 보이는 행(편집 중이면 편집 반영본) — 검색 '미배치만'·권 뱃지가 편집을 따라간다.
export function buildDuplicatesByKey(registry, rows, volumeNumberOf) {
  const byWorkId = new Map()
  const byKey = new Map()
  const push = (map, k, r) => {
    if (!map.has(k)) map.set(k, [])
    map.get(k).push({ volumeNumber: volumeNumberOf(r.volume_id), volumeId: r.volume_id, selection_status: r.selection_status })
  }
  for (const r of rows) {
    if (r._removed) continue
    if (r.work_id) push(byWorkId, r.work_id, r)
    else if (r._key) push(byKey, r._key, r)
  }
  for (const row of registry) {
    const dups = byWorkId.get(row.work_id)
    if (!dups) continue
    for (const k of keysOfRegistryRow(row)) byKey.set(k, [...(byKey.get(k) || []), ...dups])
  }
  return byKey
}

export function useWorkLookup(enabled) {
  const [state, setState] = useState({ registry: [], picks: [], loaded: false, error: null })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setState(s => ({ ...s, error: null }))
    Promise.all([api.listRegistry(), api.listPicks()])
      .then(([registry, picks]) => { if (!cancelled) setState({ registry, picks, loaded: true, error: null }) })
      .catch(err => { if (!cancelled) setState(s => ({ ...s, error: err.message })) })
    return () => { cancelled = true }
  }, [enabled, version])

  const refresh = useCallback(() => setVersion(v => v + 1), [])
  const registryMap = useMemo(() => buildRegistryMap(state.registry), [state.registry])
  const pickKeys = useMemo(() => buildPickKeys(state.picks, state.registry), [state.picks, state.registry])
  return { registry: state.registry, registryMap, pickKeys, loaded: state.loaded, error: state.error, refresh }
}
