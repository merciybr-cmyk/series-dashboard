import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider.jsx'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setState('sending')
    const { error } = await signIn(email)
    if (!error) {
      setState('sent')
    } else if (/signup/i.test(error.message)) {
      setState('error')
      setErrorMsg('초대된 이메일이 아닙니다. 편집부에 초대를 요청해 주세요.')
    } else {
      setState('error')
      setErrorMsg('메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    }
  }

  return (
    <div className="mx-auto mt-24 max-w-sm rounded-lg border border-gray-200 p-8">
      <h1 className="mb-1 text-xl font-bold">단행본 시리즈 대시보드</h1>
      <p className="mb-6 text-sm text-gray-500">초대받은 이메일로 로그인 링크를 보내드립니다.</p>
      {state === 'sent' ? (
        <p className="text-sm">
          <strong>{email}</strong> 주소로 로그인 링크를 보냈습니다. 메일함을 확인해 주세요.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="email">이메일</label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
            placeholder="name@example.com"
          />
          <button
            type="submit"
            disabled={state === 'sending'}
            className="w-full rounded bg-blue-600 py-2 font-medium text-white disabled:opacity-50"
          >
            로그인 링크 받기
          </button>
          {state === 'error' && <p className="text-sm text-red-600">{errorMsg}</p>}
        </form>
      )}
    </div>
  )
}
