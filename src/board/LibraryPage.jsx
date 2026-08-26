// 자료실 (2026-08-28 사용자 결정 반영)
// - 위: 회의록(서버 업로드, 최신순) — 미리보기(오른쪽 패널)·다운로드
// - 아래: 자료 저장소 — 팀 공용 구글 드라이브 폴더로 바로 이동 (개별 링크 등록 없음)
import { useEffect, useRef, useState } from 'react'
import { listLibraryFiles, uploadLibraryFile, deleteFile, getFileUrl, listMembers } from './volumeApi.js'
import { useToast } from '../components/Toast.jsx'

// 계정 무관 주소(/u/N/ 제외) — 접속자 권한이 있는 구글 계정으로 열린다
const DRIVE_REF_URL = 'https://drive.google.com/drive/folders/18je1FtxZURnp8AN22tO2Bjk3hHfC4ljn'
const DRIVE_MANUSCRIPT_URL = 'https://drive.google.com/drive/folders/1ksWD3v9aeOA-FpTTNf2FK-qIhQKjkP2i'
const WORKS_DB_URL = 'https://merciybr-cmyk.github.io/literature-db/'

// 브라우저가 자체 렌더링할 수 있는 형식만 패널 미리보기
const PREVIEWABLE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'txt'])
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

function extOf(name) {
  const i = (name || '').lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

export default function LibraryPage() {
  const [files, setFiles] = useState([])
  const [members, setMembers] = useState([])
  const [preview, setPreview] = useState(null) // { file, url } | { file, unsupported: true }
  const fileInputRef = useRef(null)
  const { show } = useToast()

  useEffect(() => {
    listLibraryFiles().then(setFiles).catch(() => setFiles([]))
    listMembers().then(setMembers).catch(() => setMembers([]))
  }, [])

  const memberName = id => members.find(m => m.id === id)?.name || '알 수 없음'
  const uploads = files.filter(f => f.kind === 'upload') // listLibraryFiles가 최신순 정렬

  async function handleUpload(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 50 * 1024 * 1024) {
      show('50MB 이하 파일만 업로드할 수 있습니다. 링크 첨부를 이용해 주세요.')
      return
    }
    try {
      const row = await uploadLibraryFile(file, null)
      setFiles(fs => [row, ...fs])
    } catch (err) {
      show(err.message)
    }
  }

  async function removeFile(f) {
    if (!window.confirm(`'${f.name}' 자료를 삭제할까요?`)) return
    try {
      await deleteFile(f)
      setFiles(fs => fs.filter(x => x.id !== f.id))
      if (preview?.file.id === f.id) setPreview(null)
    } catch (err) {
      show(err.message)
    }
  }

  async function handleDownload(f) {
    try {
      window.open(await getFileUrl(f.storage_path, f.name), '_blank', 'noopener')
    } catch (err) {
      show(err.message)
    }
  }

  async function handlePreview(f) {
    if (!PREVIEWABLE.has(extOf(f.name))) {
      setPreview({ file: f, unsupported: true })
      return
    }
    try {
      let url = await getFileUrl(f.storage_path) // download 이름 없이 → 인라인 표시
      // 브라우저 PDF 뷰어의 썸네일 사이드바·툴바를 숨기고 페이지 폭 맞춤
      if (extOf(f.name) === 'pdf') url += '#toolbar=0&navpanes=0&view=FitH'
      setPreview({ file: f, url })
    } catch (err) {
      show(err.message)
    }
  }

  return (
    <div className="flex items-start gap-4">
      <div className={preview ? 'w-[26rem] shrink-0' : 'min-w-0 max-w-3xl flex-1'}>
        <h2 className="mb-1 text-lg font-bold">자료실</h2>
        <p className="mb-4 text-sm text-gray-500">
          회의록은 여기에 업로드하고(50MB 이하), 원고·PDF 등 자료는 아래 자료 저장소(구글 드라이브)에 올려 주세요.
        </p>

        <section className="mb-6">
          <div className="mb-2 flex items-center gap-3">
            <h3 className="font-semibold">회의록</h3>
            <input ref={fileInputRef} type="file" aria-label="자료실 파일 선택" onChange={handleUpload} className="hidden" />
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600">회의록 업로드</button>
          </div>
          <ul className="space-y-1">
            {uploads.map(f => (
              <li key={f.id} className="flex items-center gap-2 rounded border border-gray-100 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">📄 {f.name}</span>
                <span className="shrink-0 text-xs text-gray-400">
                  {memberName(f.uploaded_by)} · {new Date(f.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                </span>
                <button type="button" aria-label={`${f.name} 미리보기`} onClick={() => handlePreview(f)}
                  className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50">미리보기</button>
                <button type="button" aria-label={`${f.name} 다운로드`} onClick={() => handleDownload(f)}
                  className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50">다운로드</button>
                <button type="button" aria-label={`${f.name} 삭제`} onClick={() => removeFile(f)}
                  className="shrink-0 text-gray-300 hover:text-red-500">✕</button>
              </li>
            ))}
            {!uploads.length && <li className="text-sm text-gray-400">등록된 회의록이 없습니다</li>}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 font-semibold">바로가기</h3>
          <div className="space-y-2">
            <a
              href={DRIVE_REF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded border border-gray-200 px-4 py-3 text-sm hover:bg-gray-50"
            >
              <span className="text-xl">📁</span>
              <span className="flex-1">
                <span className="block font-medium text-blue-700">참고 자료 폴더 열기</span>
                <span className="block text-xs text-gray-500">회의 자료·PDF 등 참고 자료 (구글 드라이브)</span>
              </span>
              <span aria-hidden className="text-gray-400">↗</span>
            </a>
            <a
              href={DRIVE_MANUSCRIPT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded border border-gray-200 px-4 py-3 text-sm hover:bg-gray-50"
            >
              <span className="text-xl">📝</span>
              <span className="flex-1">
                <span className="block font-medium text-blue-700">원고 업로드 폴더 열기</span>
                <span className="block text-xs text-gray-500">작성한 원고는 이 폴더에 올려 주세요 (구글 드라이브)</span>
              </span>
              <span aria-hidden className="text-gray-400">↗</span>
            </a>
            <a
              href={WORKS_DB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded border border-gray-200 px-4 py-3 text-sm hover:bg-gray-50"
            >
              <span className="text-xl">📚</span>
              <span className="flex-1">
                <span className="block font-medium text-blue-700">교과서 문학 작품 DB 열기</span>
                <span className="block text-xs text-gray-500">역대 교과서 수록 작품 검색·조회 사이트</span>
              </span>
              <span aria-hidden className="text-gray-400">↗</span>
            </a>
          </div>
        </section>
      </div>

      {preview && (
        <aside className="sticky top-4 flex h-[calc(100vh-6.5rem)] min-w-0 flex-1 flex-col rounded border border-gray-200 bg-white">
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{preview.file.name}</span>
            <button type="button" aria-label="미리보기 다운로드" onClick={() => handleDownload(preview.file)}
              className="shrink-0 rounded border border-gray-300 px-2 py-0.5 text-xs text-gray-600">다운로드</button>
            <button type="button" aria-label="미리보기 닫기" onClick={() => setPreview(null)}
              className="shrink-0 text-gray-400 hover:text-gray-700">✕</button>
          </div>
          {preview.unsupported ? (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-gray-500">
              이 형식은 브라우저 미리보기를 지원하지 않습니다.<br />다운로드해서 확인해 주세요.
            </div>
          ) : IMAGE_EXTS.has(extOf(preview.file.name)) ? (
            <div className="flex-1 overflow-auto p-2">
              <img src={preview.url} alt={preview.file.name} className="max-w-full" />
            </div>
          ) : (
            <iframe title={`${preview.file.name} 미리보기`} src={preview.url} className="w-full flex-1" />
          )}
        </aside>
      )}
    </div>
  )
}
