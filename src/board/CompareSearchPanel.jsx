// 권별 비교 편집 중 오른쪽 '작품 넣기' 패널 (설계 2026-10-02 §2.4): 권 보드의 검색 패널을 그대로 쓴다.
// 시트·registry는 패널을 처음 열 때 불러온다(보기 화면 첫 로딩 속도 유지).
import { useWorksData } from '../works/useWorksData.js'
import SearchPane from './SearchPane.jsx'

export default function CompareSearchPanel({ lookup, duplicatesByKey, renderAction, itemComponent, onClose }) {
  const { works, loading, error, retry } = useWorksData()
  const failed = error || lookup.error
  return (
    <aside aria-label="작품 넣기 패널"
      className="sticky top-16 flex h-[calc(100vh-10rem)] w-80 shrink-0 flex-col rounded border border-gray-200 bg-white p-3">
      <div className="mb-2 flex items-center">
        <h3 className="font-semibold">작품 넣기</h3>
        <button type="button" aria-label="작품 넣기 닫기" onClick={onClose}
          className="ml-auto rounded px-1.5 text-gray-400 hover:bg-gray-100">✕</button>
      </div>
      {failed ? (
        <div className="text-sm">
          <p className="mb-2 text-red-600">{failed}</p>
          <button type="button"
            onClick={() => { if (error) retry(); if (lookup.error) lookup.refresh() }}
            className="rounded border px-3 py-1">다시 시도</button>
        </div>
      ) : loading || !lookup.loaded ? (
        <p className="text-sm text-gray-400">작품 데이터 불러오는 중…</p>
      ) : (
        <div className="min-h-0 flex-1">
          <SearchPane
            works={works}
            duplicatesByKey={duplicatesByKey}
            pickKeys={lookup.pickKeys}
            defaultOnlyUnplaced
            renderAction={renderAction}
            itemComponent={itemComponent}
          />
        </div>
      )}
    </aside>
  )
}
