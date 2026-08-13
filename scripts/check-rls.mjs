// 비로그인(anon key만) 상태에서 모든 테이블이 RLS로 차단되는지 확인한다.
// 사용: npm run check-rls
import { readFileSync } from 'node:fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const get = key => env.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'))?.[1]?.trim()
const url = get('VITE_SUPABASE_URL')
const anonKey = get('VITE_SUPABASE_ANON_KEY')
if (!url || !anonKey) {
  console.error('.env.local에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY가 필요합니다')
  process.exit(1)
}

const tables = ['members', 'volumes', 'works_registry', 'volume_works',
  'work_tasks', 'schedules', 'files', 'activity_log']

let failed = false
for (const t of tables) {
  const res = await fetch(`${url}/rest/v1/${t}?select=*&limit=5`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  })
  const body = await res.json().catch(() => null)
  const blocked = res.ok ? Array.isArray(body) && body.length === 0 : true
  console.log(`${blocked ? 'OK ' : 'FAIL'} ${t} (HTTP ${res.status}, rows: ${Array.isArray(body) ? body.length : '-'})`)
  if (!blocked) failed = true
}

if (failed) {
  console.error('\nRLS 누출: 비로그인 상태에서 데이터가 보입니다. 정책을 점검하세요.')
  process.exit(1)
}
console.log('\n전체 통과: 비로그인 접근이 모두 차단됩니다.')
