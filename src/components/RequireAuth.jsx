import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider.jsx'

export default function RequireAuth({ children }) {
  const { session, member, loading, signOut } = useAuth()

  if (loading) return <div className="p-8 text-gray-500">불러오는 중…</div>
  if (!session) return <Navigate to="/login" replace />
  if (!member) {
    return (
      <div className="mx-auto mt-24 max-w-md p-8 text-center">
        <p className="mb-4">
          로그인은 되었지만 구성원 명부에서 확인되지 않았습니다.
          편집부에 명부 등록을 요청해 주세요.
        </p>
        <button onClick={signOut} className="rounded border px-4 py-2">로그아웃</button>
      </div>
    )
  }
  return children
}
