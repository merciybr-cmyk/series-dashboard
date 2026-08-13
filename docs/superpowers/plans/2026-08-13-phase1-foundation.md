# 1단계: 기반 구축 (세팅·스키마·인증·배포) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 매직 링크로 로그인해 구성원임이 확인된 사용자만 들어올 수 있는 빈 대시보드 셸을, 전체 DB 스키마·RLS·배포 파이프라인(keep-alive 포함)과 함께 GitHub Pages에 배포한다.

**Architecture:** 정적 SPA(React 19 + Vite, HashRouter) + Supabase(인증·Postgres·RLS). 스키마는 v2 설계의 8개 테이블 전체를 이번에 만들고, UI는 로그인/셸까지만 만든다. 초대는 Supabase Studio에서 수동, 첫 로그인 시 DB 트리거가 이메일로 구성원 행에 연결한다.

**Tech Stack:** React 19, Vite 8, Tailwind CSS 4(@tailwindcss/vite), react-router-dom 7(HashRouter), @supabase/supabase-js 2, Vitest 4 + Testing Library + jsdom, GitHub Actions + GitHub Pages.

**설계 문서:** [2026-08-13-series-dashboard-design-v2.md](../specs/2026-08-13-series-dashboard-design-v2.md)

## Global Constraints

- 비용 0원: 무료 플랜·무료 도구만 사용. 유료 전환 없음 (설계 §13)
- service-role 키는 어떤 파일에도 커밋 금지. 프런트에는 anon key만 (설계 §6.5)
- 모든 테이블 RLS 활성화 + 기본 거부. 정책은 "authenticated이면서 members에 연결된 사용자"만 허용 (설계 §6.4)
- 라우팅은 HashRouter(`/#/...`) — GitHub Pages에 서버 리라이트가 없음 (설계 §6.5)
- `created_by`/`updated_by`/`actor_id`는 클라이언트 입력을 믿지 않고 트리거에서 자동 기록 (설계 §6.4)
- activity_log에서 `sort_order`만 바뀐 update는 기록하지 않음 (설계 §4)
- UI 문구는 한국어
- 커밋 메시지는 기존 관례를 따름 (`feat:`, `docs:`, `chore:` + 한국어 요약)

## 파일 구조 (이번 단계에서 만드는 것)

```
series-dashboard/
├─ package.json, vite.config.js, index.html, .gitignore, .env.example
├─ .env.local                      # 커밋 안 함 (Supabase URL/anon key)
├─ .github/workflows/deploy.yml    # 빌드·배포 + 주 1회 keep-alive
├─ supabase/schema.sql             # 전체 스키마·트리거·RLS (Studio SQL Editor에 붙여넣기)
├─ docs/setup-supabase.md          # 사람이 하는 세팅 절차 체크리스트
├─ scripts/check-rls.mjs           # 비로그인 접근 차단 검증 스크립트
└─ src/
   ├─ main.jsx, App.jsx, index.css
   ├─ lib/supabaseClient.js        # 클라이언트 싱글턴 (env 검증 포함)
   ├─ auth/AuthProvider.jsx        # 세션+구성원(member) 컨텍스트, useAuth 훅
   ├─ components/RequireAuth.jsx   # 라우트 가드 (미로그인→로그인, 미등록→안내)
   ├─ components/AppLayout.jsx     # 상단 내비 + Outlet
   ├─ pages/LoginPage.jsx          # 매직 링크 요청 폼
   ├─ pages/HomePage.jsx           # 자리표시 홈 (이름·로그아웃으로 인증 루프 증명)
   └─ tests/ setup.js, AuthProvider.test.jsx, LoginPage.test.jsx, RequireAuth.test.jsx
```

책임 경계: `supabaseClient`는 연결만, `AuthProvider`는 "세션과 member 행 조회"만, `RequireAuth`는 분기만, 페이지는 화면만. 2단계 이후 화면은 이 구조 위에 페이지만 추가한다.

---

### Task 1: 프로젝트 스캐폴드 + 테스트 기반

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `.gitignore`, `.env.example`, `src/main.jsx`, `src/App.jsx`, `src/index.css`, `src/tests/setup.js`, `src/tests/smoke.test.jsx`

**Interfaces:**
- Produces: `npm run dev|build|test`가 동작하는 Vite+Vitest 환경. `App` 컴포넌트(이후 Task 5에서 교체).

인터랙티브 프롬프트를 피하기 위해 `npm create vite`를 쓰지 않고 파일을 직접 만든다.

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "series-dashboard",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "check-rls": "node scripts/check-rls.mjs"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "react": "^19.2.6",
    "react-dom": "^19.2.6",
    "react-router-dom": "^7.1.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.0",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^6.0.1",
    "jsdom": "^29.1.1",
    "tailwindcss": "^4.3.0",
    "vite": "^8.0.12",
    "vitest": "^4.1.8"
  }
}
```

- [ ] **Step 2: vite.config.js 작성** (GitHub Pages 하위 경로 + Vitest 설정 포함)

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages 프로젝트 사이트(/series-dashboard/) 기준.
export default defineConfig({
  base: '/series-dashboard/',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/tests/setup.js',
    globals: true,
  },
})
```

- [ ] **Step 3: index.html, src/index.css, src/main.jsx, src/App.jsx 작성**

`index.html`:

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>단행본 시리즈 대시보드</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

`src/index.css`:

```css
@import "tailwindcss";
```

`src/main.jsx`:

```jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.jsx` (Task 5에서 라우터로 교체될 임시 버전):

```jsx
export default function App() {
  return <h1 className="p-4 text-xl font-bold">단행본 시리즈 대시보드</h1>
}
```

- [ ] **Step 4: .gitignore, .env.example 작성**

`.gitignore`:

```
node_modules
dist
.env.local
.env
*.local
```

`.env.example`:

```
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

- [ ] **Step 5: 테스트 셋업 + 스모크 테스트 작성**

`src/tests/setup.js`:

```js
import '@testing-library/jest-dom/vitest'
```

`src/tests/smoke.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import App from '../App.jsx'

test('앱 제목이 렌더링된다', () => {
  render(<App />)
  expect(screen.getByText('단행본 시리즈 대시보드')).toBeInTheDocument()
})
```

- [ ] **Step 6: 설치 및 테스트 실행**

Run: `npm install && npm test`
Expected: 1 passed. (경고가 있어도 실패만 아니면 진행)

Run: `npm run build`
Expected: `dist/` 생성, exit 0.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: Vite+React+Tailwind+Vitest 스캐폴드"
```

---

### Task 2: 전체 DB 스키마 SQL (supabase/schema.sql)

**Files:**
- Create: `supabase/schema.sql`

**Interfaces:**
- Produces: 8개 테이블(members, volumes, works_registry, volume_works, work_tasks, schedules, files, activity_log), 함수 `current_member_id()`, `is_member()`, work_id 자동발급, 감사필드·completed_at·activity_log·첫로그인 연결 트리거, 전 테이블 RLS, Realtime 발행. 이후 모든 단계의 데이터 계층.
- 이 파일은 Supabase Studio SQL Editor에 통째로 1회 붙여넣는 용도다 (Task 3). 멱등이 아니어도 되지만 빈 프로젝트에서 오류 없이 실행돼야 한다.

- [ ] **Step 1: supabase/schema.sql 작성** (아래 전문 그대로)

```sql
-- =============================================================
-- series-dashboard 스키마 v2 (설계 문서 2026-08-13 §4, §6.4)
-- 빈 Supabase 프로젝트의 SQL Editor에서 1회 실행한다.
-- =============================================================

-- ---------- 테이블 ----------

create table public.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id),
  email text not null unique check (email = lower(email)),
  name text not null,
  affiliation text,
  role text not null default 'committee' check (role in ('editor', 'committee')),
  assigned_volumes int[] not null default '{}',
  phone text,
  created_at timestamptz not null default now()
);

create table public.volumes (
  id uuid primary key default gen_random_uuid(),
  number int not null unique,
  title text not null,
  status text not null default '기획'
    check (status in ('기획', '선정중', '확정', '제작중', '완료')),
  editor_id uuid references public.members (id),
  note text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 작품 레지스트리: 영구 work_id 발급 (설계 §3)
create sequence public.work_id_seq;

create table public.works_registry (
  work_id text primary key
    default ('W' || lpad(nextval('public.work_id_seq')::text, 6, '0')),
  title text not null,
  author_base text not null,
  aliases jsonb not null default '[]',
  snapshot jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table public.volume_works (
  id uuid primary key default gen_random_uuid(),
  volume_id uuid not null references public.volumes (id) on delete cascade,
  work_id text not null references public.works_registry (work_id),
  work_snapshot jsonb not null,
  sort_order int not null default 0,
  selection_status text not null default 'candidate'
    check (selection_status in ('candidate', 'hold', 'confirmed', 'excluded')),
  production_status text not null default 'not_started'
    check (production_status in ('not_started', 'in_progress', 'review', 'completed')),
  note text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (volume_id, work_id)
);

create table public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  volume_work_id uuid not null references public.volume_works (id) on delete cascade,
  task_type text not null default 'custom',
  title text not null,
  assignee_id uuid references public.members (id),
  due_date date,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'review', 'done')),
  note text,
  sort_order int not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  volume_id uuid references public.volumes (id) on delete cascade,
  due_date date not null,
  assignee_id uuid references public.members (id),
  done boolean not null default false,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  volume_id uuid references public.volumes (id) on delete set null,
  volume_work_id uuid references public.volume_works (id) on delete set null,
  kind text not null check (kind in ('upload', 'link')),
  storage_path text,
  url text,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  check ((kind = 'upload' and storage_path is not null) or (kind = 'link' and url is not null))
);

create table public.activity_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  diff jsonb,
  actor_id uuid,
  created_at timestamptz not null default now()
);

-- ---------- 헬퍼 함수 ----------

-- 현재 로그인 사용자의 member id (미연결이면 null)
create function public.current_member_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.members where auth_user_id = auth.uid()
$$;

-- 로그인 + 명부 등록 여부 (RLS의 기준)
create function public.is_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.members where auth_user_id = auth.uid())
$$;

-- ---------- 트리거: 감사 필드 자동 기록 (설계 §6.4) ----------

create function public.set_audit_fields()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := public.current_member_id();
    new.updated_by := new.created_by;
  else
    new.created_by := old.created_by;  -- 클라이언트가 못 바꾸게 고정
    new.created_at := old.created_at;
    new.updated_by := public.current_member_id();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger volumes_audit before insert or update on public.volumes
  for each row execute function public.set_audit_fields();
create trigger volume_works_audit before insert or update on public.volume_works
  for each row execute function public.set_audit_fields();
create trigger work_tasks_audit before insert or update on public.work_tasks
  for each row execute function public.set_audit_fields();
create trigger schedules_audit before insert or update on public.schedules
  for each row execute function public.set_audit_fields();

-- ---------- 트리거: work_tasks.completed_at ----------

create function public.set_task_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger work_tasks_completed_at before insert or update on public.work_tasks
  for each row execute function public.set_task_completed_at();

-- ---------- 트리거: activity_log (설계 §4) ----------
-- update에서 sort_order만 바뀐 경우는 기록하지 않는다 (드래그 정렬 스팸 방지).

create function public.log_activity()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  o jsonb;
  n jsonb;
  k text;
  changed jsonb := '{}'::jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.activity_log (table_name, record_id, action, diff, actor_id)
    values (tg_table_name, new.id, 'insert',
            to_jsonb(new) - 'created_at' - 'updated_at' - 'created_by' - 'updated_by',
            public.current_member_id());
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.activity_log (table_name, record_id, action, diff, actor_id)
    values (tg_table_name, old.id, 'delete',
            to_jsonb(old) - 'created_at' - 'updated_at' - 'created_by' - 'updated_by',
            public.current_member_id());
    return old;
  else
    o := to_jsonb(old);
    n := to_jsonb(new);
    for k in select jsonb_object_keys(n) loop
      if (o -> k) is distinct from (n -> k)
         and k not in ('created_at', 'updated_at', 'created_by', 'updated_by') then
        changed := changed || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
      end if;
    end loop;
    -- 변경 없음, 또는 sort_order만 변경 → 기록 생략
    if changed = '{}'::jsonb or changed - 'sort_order' = '{}'::jsonb then
      return new;
    end if;
    insert into public.activity_log (table_name, record_id, action, diff, actor_id)
    values (tg_table_name, new.id, 'update', changed, public.current_member_id());
    return new;
  end if;
end;
$$;

create trigger volumes_log after insert or update or delete on public.volumes
  for each row execute function public.log_activity();
create trigger volume_works_log after insert or update or delete on public.volume_works
  for each row execute function public.log_activity();
create trigger work_tasks_log after insert or update or delete on public.work_tasks
  for each row execute function public.log_activity();
create trigger schedules_log after insert or update or delete on public.schedules
  for each row execute function public.log_activity();
create trigger files_log after insert or update or delete on public.files
  for each row execute function public.log_activity();

-- ---------- 트리거: 첫 로그인 시 구성원 연결 (설계 §6.1) ----------

create function public.link_member_on_login()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.members
     set auth_user_id = new.id
   where email = lower(new.email)
     and auth_user_id is null;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.link_member_on_login();

-- ---------- RLS: 전 테이블 기본 거부, 구성원만 전체 허용 (설계 §6.4) ----------

alter table public.members enable row level security;
alter table public.volumes enable row level security;
alter table public.works_registry enable row level security;
alter table public.volume_works enable row level security;
alter table public.work_tasks enable row level security;
alter table public.schedules enable row level security;
alter table public.files enable row level security;
alter table public.activity_log enable row level security;

create policy members_member_all on public.members
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy volumes_member_all on public.volumes
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy works_registry_member_all on public.works_registry
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy volume_works_member_all on public.volume_works
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy work_tasks_member_all on public.work_tasks
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy schedules_member_all on public.schedules
  for all to authenticated using (public.is_member()) with check (public.is_member());
create policy files_member_all on public.files
  for all to authenticated using (public.is_member()) with check (public.is_member());
-- activity_log는 조회만 허용 (기록은 security definer 트리거가 수행)
create policy activity_log_member_select on public.activity_log
  for select to authenticated using (public.is_member());

-- ---------- Realtime 발행 (설계 §7) ----------

alter publication supabase_realtime add table public.volume_works;
alter publication supabase_realtime add table public.work_tasks;
```

- [ ] **Step 2: SQL 정적 점검**

로컬에 Postgres가 없으므로 실행 검증은 Task 3(Studio 적용)에서 한다. 여기서는 다음을 눈으로 확인:
- 테이블 참조 순서 (members → volumes → works_registry → volume_works → work_tasks) ✓
- 모든 `create policy` 앞에 해당 테이블 `enable row level security` 존재 ✓
- 함수명 오타 (`current_member_id`, `is_member`, `log_activity`) 참조 일치 ✓

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: 전체 DB 스키마·트리거·RLS SQL (v2 설계 §4·§6.4)"
```

---

### Task 3: Supabase 세팅 절차 문서 + [사용자 작업] 프로젝트 생성·SQL 적용·SMTP

**Files:**
- Create: `docs/setup-supabase.md`
- Create: `.env.local` (커밋하지 않음 — 사용자가 값 기입)

**Interfaces:**
- Consumes: Task 2의 `supabase/schema.sql`
- Produces: 동작하는 Supabase 프로젝트 + `.env.local`의 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Task 4 이후 모든 코드가 이 env를 사용.

- [ ] **Step 1: docs/setup-supabase.md 작성** (아래 내용 그대로)

````markdown
# Supabase 세팅 절차 (1회, 사람 작업)

수행자: 편집부 관리자. 소요 약 30분. 모두 무료.

## 1. 프로젝트 생성
1. https://supabase.com 가입/로그인 (GitHub 계정 권장)
2. New project → 이름 `series-dashboard`, Region `Northeast Asia (Seoul)`, DB 비밀번호 생성해 안전한 곳에 보관
3. Project Settings → API에서 **Project URL**과 **anon public key**를 복사
   - `service_role` 키는 절대 복사·공유·커밋하지 않는다

## 2. 스키마 적용
1. SQL Editor → New query
2. 저장소의 `supabase/schema.sql` 전체를 붙여넣고 Run
3. 오류 없이 "Success"가 떠야 한다. Table Editor에 테이블 8개가 보이는지 확인

## 3. 인증 설정
1. Authentication → Providers → Email: **Enable email provider** 켜기,
   **Confirm email** 끄기(매직 링크만 사용)
2. Authentication → URL Configuration:
   - Site URL: `https://<GitHub계정>.github.io/series-dashboard/`
   - Redirect URLs에 추가: `http://localhost:5173`, `http://localhost:5173/**`,
     `https://<GitHub계정>.github.io/series-dashboard/**`

## 4. Gmail SMTP (설계 §6.2 — 필수)
1. Google 계정 → 보안 → 2단계 인증 켜기 → 앱 비밀번호 생성 (이름: supabase)
2. Supabase → Project Settings → Auth → SMTP Settings → Enable custom SMTP:
   - Host `smtp.gmail.com`, Port `465`
   - Username: Gmail 주소, Password: 앱 비밀번호
   - Sender email: 같은 Gmail 주소, Sender name: `단행본 시리즈 대시보드`
3. 저장 후 아래 "첫 구성원 등록"에서 실제 수신 확인

## 5. 첫 구성원 등록 (관리자 본인)
1. Table Editor → members → Insert row:
   - email: 본인 이메일(**소문자**), name: 본인 이름, role: `editor`
2. Authentication → Users → Invite user → 같은 이메일 입력
3. 메일이 오면 링크 클릭 → 로그인됨
4. Table Editor → members에서 본인 행의 `auth_user_id`가 채워졌는지 확인
   (첫 로그인 연결 트리거 검증)

## 6. 로컬 환경변수
저장소 루트에 `.env.local` 파일 생성 (커밋 금지, .gitignore에 이미 있음):

```
VITE_SUPABASE_URL=<1-3에서 복사한 Project URL>
VITE_SUPABASE_ANON_KEY=<1-3에서 복사한 anon key>
```

## 이후 구성원을 추가할 때 (운영 절차)
1. Table Editor → members에 행 추가 (email 소문자, name, role)
2. Authentication → Users → Invite user로 같은 이메일 초대
순서는 바뀌어도 되지만 둘 다 해야 로그인이 된다.
````

- [ ] **Step 2: Commit**

```bash
git add docs/setup-supabase.md
git commit -m "docs: Supabase 세팅 절차 (프로젝트·스키마·SMTP·초대)"
```

- [ ] **Step 3: [사용자 작업 요청] 세팅 수행**

실행 담당자(에이전트)는 여기서 멈추고 사용자에게 `docs/setup-supabase.md` 수행을 요청한다. 사용자가 1~6 완료를 알려주면 다음으로 진행. **`.env.local`이 존재하고 값이 채워졌는지 확인 후 Task 4 시작.**

Run(확인): `node -e "const s=require('fs').readFileSync('.env.local','utf8'); if(!/VITE_SUPABASE_URL=https:\/\//.test(s)||!/VITE_SUPABASE_ANON_KEY=.{20,}/.test(s)) {console.error('env 미완성'); process.exit(1)}; console.log('env OK')"`
Expected: `env OK`

---

### Task 4: supabaseClient + AuthProvider

**Files:**
- Create: `src/lib/supabaseClient.js`, `src/auth/AuthProvider.jsx`
- Test: `src/tests/AuthProvider.test.jsx`

**Interfaces:**
- Consumes: `.env.local`의 env 2개
- Produces:
  - `supabase` — `createClient` 싱글턴 (named export)
  - `<AuthProvider>{children}</AuthProvider>` — 컨텍스트 제공자
  - `useAuth()` → `{ session, member, loading, signIn(email), signOut() }`
    - `session`: Supabase Session 또는 null
    - `member`: members 행 객체(`{id, name, role, ...}`) 또는 null
    - `signIn(email)`: `signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo } })` 호출, `{ error }` 반환

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/AuthProvider.test.jsx`

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

const mockSupabase = {
  auth: {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    signInWithOtp: vi.fn(),
    signOut: vi.fn(),
  },
  from: vi.fn(),
}
vi.mock('../lib/supabaseClient', () => ({ supabase: mockSupabase }))

const { AuthProvider, useAuth } = await import('../auth/AuthProvider.jsx')

function Probe() {
  const { session, member, loading } = useAuth()
  if (loading) return <div>로딩</div>
  return (
    <div>
      <div>세션:{session ? '있음' : '없음'}</div>
      <div>구성원:{member ? member.name : '없음'}</div>
    </div>
  )
}

function mockMemberQuery(row) {
  mockSupabase.from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
  })
}

test('세션이 없으면 session·member 모두 null', async () => {
  mockSupabase.auth.getSession.mockResolvedValue({ data: { session: null } })
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(screen.getByText('세션:없음')).toBeInTheDocument())
  expect(screen.getByText('구성원:없음')).toBeInTheDocument()
})

test('세션이 있으면 members에서 내 행을 조회해 제공한다', async () => {
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'auth-1' } } },
  })
  mockMemberQuery({ id: 'm-1', name: '김편집' })
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(screen.getByText('구성원:김편집')).toBeInTheDocument())
  expect(mockSupabase.from).toHaveBeenCalledWith('members')
})

test('세션은 있지만 명부에 없으면 member는 null', async () => {
  mockSupabase.auth.getSession.mockResolvedValue({
    data: { session: { user: { id: 'auth-9' } } },
  })
  mockMemberQuery(null)
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(screen.getByText('세션:있음')).toBeInTheDocument())
  expect(screen.getByText('구성원:없음')).toBeInTheDocument()
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test -- src/tests/AuthProvider.test.jsx`
Expected: FAIL — `../auth/AuthProvider.jsx` 모듈 없음

- [ ] **Step 3: 구현** — `src/lib/supabaseClient.js`

```js
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // 빌드/배포 시 env 누락을 빨리 드러낸다
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 환경변수가 필요합니다')
}

export const supabase = createClient(url, anonKey)
```

`src/auth/AuthProvider.jsx`:

```jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

const AuthContext = createContext(null)

async function fetchMember(authUserId) {
  const { data } = await supabase
    .from('members')
    .select('*')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  return data
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function init() {
      const { data } = await supabase.auth.getSession()
      if (cancelled) return
      setSession(data.session)
      if (data.session) {
        const m = await fetchMember(data.session.user.id)
        if (!cancelled) setMember(m)
      }
      setLoading(false)
    }
    init()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) {
        setMember(null)
      } else {
        fetchMember(s.user.id).then(m => setMember(m))
      }
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signIn = email =>
    supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin + window.location.pathname,
      },
    })

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ session, member, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm test`
Expected: 스모크 포함 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabaseClient.js src/auth/AuthProvider.jsx src/tests/AuthProvider.test.jsx
git commit -m "feat: Supabase 클라이언트와 AuthProvider (세션+구성원 컨텍스트)"
```

---

### Task 5: LoginPage + RequireAuth + AppLayout + 라우팅

**Files:**
- Create: `src/pages/LoginPage.jsx`, `src/pages/HomePage.jsx`, `src/components/RequireAuth.jsx`, `src/components/AppLayout.jsx`
- Modify: `src/App.jsx` (전체 교체)
- Test: `src/tests/LoginPage.test.jsx`, `src/tests/RequireAuth.test.jsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 4의 시그니처)
- Produces: HashRouter 라우트 — `/login`(공개), `/`(홈, 보호됨), `/volumes` `/schedule` `/library` `/contacts`(자리표시, 보호됨). `RequireAuth`는 미로그인 → `/login` 리다이렉트, 로그인+명부 미등록 → 안내 화면.

- [ ] **Step 1: 실패하는 테스트 작성** — `src/tests/LoginPage.test.jsx`

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

const signIn = vi.fn()
vi.mock('../auth/AuthProvider.jsx', () => ({
  useAuth: () => ({ session: null, member: null, loading: false, signIn }),
}))

const { default: LoginPage } = await import('../pages/LoginPage.jsx')

test('이메일 제출 시 signIn을 호출하고 안내 문구를 보여준다', async () => {
  signIn.mockResolvedValue({ error: null })
  render(<LoginPage />)
  await userEvent.type(screen.getByLabelText('이메일'), 'test@example.com')
  await userEvent.click(screen.getByRole('button', { name: '로그인 링크 받기' }))
  expect(signIn).toHaveBeenCalledWith('test@example.com')
  expect(await screen.findByText(/메일함을 확인해 주세요/)).toBeInTheDocument()
})

test('미초대 이메일 오류 시 안내 문구를 보여준다', async () => {
  signIn.mockResolvedValue({ error: { message: 'Signups not allowed for otp' } })
  render(<LoginPage />)
  await userEvent.type(screen.getByLabelText('이메일'), 'nobody@example.com')
  await userEvent.click(screen.getByRole('button', { name: '로그인 링크 받기' }))
  expect(await screen.findByText(/초대된 이메일이 아닙니다/)).toBeInTheDocument()
})
```

`src/tests/RequireAuth.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { vi } from 'vitest'

const authState = { session: null, member: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }
vi.mock('../auth/AuthProvider.jsx', () => ({ useAuth: () => authState }))

const { default: RequireAuth } = await import('../components/RequireAuth.jsx')

function renderGuarded() {
  return render(
    <HashRouter>
      <Routes>
        <Route path="/login" element={<div>로그인화면</div>} />
        <Route path="/" element={<RequireAuth><div>보호된내용</div></RequireAuth>} />
      </Routes>
    </HashRouter>,
  )
}

test('미로그인이면 로그인 화면으로 보낸다', () => {
  Object.assign(authState, { session: null, member: null, loading: false })
  renderGuarded()
  expect(screen.getByText('로그인화면')).toBeInTheDocument()
})

test('로그인했지만 명부에 없으면 안내를 보여준다', () => {
  Object.assign(authState, { session: { user: { id: 'a' } }, member: null, loading: false })
  renderGuarded()
  expect(screen.getByText(/구성원 명부에서 확인되지 않았습니다/)).toBeInTheDocument()
})

test('구성원이면 내용을 보여준다', () => {
  Object.assign(authState, { session: { user: { id: 'a' } }, member: { id: 'm', name: '김편집' }, loading: false })
  renderGuarded()
  expect(screen.getByText('보호된내용')).toBeInTheDocument()
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: 새 테스트 2파일 FAIL (모듈 없음)

- [ ] **Step 3: 구현**

`src/pages/LoginPage.jsx`:

```jsx
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
```

`src/components/RequireAuth.jsx`:

```jsx
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
```

`src/components/AppLayout.jsx`:

```jsx
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider.jsx'

const MENU = [
  { to: '/', label: '홈' },
  { to: '/volumes', label: '권별 작품 목록' },
  { to: '/schedule', label: '일정' },
  { to: '/library', label: '자료실' },
  { to: '/contacts', label: '연락처' },
]

export default function AppLayout() {
  const { member, signOut } = useAuth()
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-6 border-b border-gray-200 px-6 py-3">
        <span className="font-bold">단행본 대시보드</span>
        <nav className="flex gap-4 text-sm">
          {MENU.map(m => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.to === '/'}
              className={({ isActive }) => (isActive ? 'font-semibold text-blue-600' : 'text-gray-600')}
            >
              {m.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span>{member?.name}</span>
          <button onClick={signOut} className="text-gray-500 underline">로그아웃</button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
```

`src/pages/HomePage.jsx`:

```jsx
export default function HomePage() {
  return <p className="text-gray-500">홈 — 3단계에서 내 할 일·주의 필요가 여기에 표시됩니다.</p>
}
```

`src/App.jsx` (전체 교체):

```jsx
import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import AppLayout from './components/AppLayout.jsx'
import LoginPage from './pages/LoginPage.jsx'
import HomePage from './pages/HomePage.jsx'

function Placeholder({ name }) {
  return <p className="text-gray-500">{name} — 이후 단계에서 구현됩니다.</p>
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<HomePage />} />
            <Route path="/volumes" element={<Placeholder name="권별 작품 목록" />} />
            <Route path="/schedule" element={<Placeholder name="일정" />} />
            <Route path="/library" element={<Placeholder name="자료실" />} />
            <Route path="/contacts" element={<Placeholder name="연락처" />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
```

- [ ] **Step 4: 스모크 테스트 갱신** — App이 라우터로 바뀌었으므로 `src/tests/smoke.test.jsx`를 아래로 교체 (supabaseClient를 목킹해야 App 임포트가 env 없이 동작):

```jsx
import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
  },
}))

const { default: App } = await import('../App.jsx')

test('미로그인 상태에서 로그인 화면이 보인다', async () => {
  render(<App />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '로그인 링크 받기' })).toBeInTheDocument(),
  )
})
```

- [ ] **Step 5: 통과 확인**

Run: `npm test`
Expected: 4개 파일 전부 PASS

- [ ] **Step 6: 로컬 실사동 확인 (사용자 또는 브라우저 도구)**

Run: `npm run dev` → http://localhost:5173 접속
확인: 로그인 화면 표시 → Task 3에서 초대한 본인 이메일 입력 → 메일 수신 → 링크 클릭 → 대시보드 셸(이름·메뉴·로그아웃) 표시. 로그아웃 → 로그인 화면 복귀.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: 매직 링크 로그인, 라우트 가드, 대시보드 셸"
```

---

### Task 6: RLS 검증 스크립트

**Files:**
- Create: `scripts/check-rls.mjs`

**Interfaces:**
- Consumes: `.env.local`
- Produces: `npm run check-rls` — 비로그인(anon) 상태에서 8개 테이블이 전부 비어 보이는지(=RLS 차단) 자동 확인. 이후 단계에서도 배포 전 상시 사용.

- [ ] **Step 1: scripts/check-rls.mjs 작성**

```js
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
```

- [ ] **Step 2: 실행 확인** (Task 3 세팅과 members 1행이 있는 상태에서)

Run: `npm run check-rls`
Expected: 8줄 전부 `OK`, 마지막 줄 "전체 통과". members에 관리자 행이 있으므로 이 검증은 실질적이다(차단 실패 시 rows: 1로 FAIL).

- [ ] **Step 3: Commit**

```bash
git add scripts/check-rls.mjs
git commit -m "feat: 비로그인 RLS 차단 검증 스크립트"
```

---

### Task 7: 배포 파이프라인 + keep-alive + [사용자 작업] GitHub 설정

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: repo secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Produces: master push → 빌드·Pages 배포. 매주 월요일 09:00 KST(00:00 UTC) keep-alive 요청 (설계 §6.3).

- [ ] **Step 1: .github/workflows/deploy.yml 작성**

```yaml
name: deploy

on:
  push:
    branches: [master]
  schedule:
    - cron: '0 0 * * 1' # 매주 월 00:00 UTC — Supabase 무료 플랜 일시정지 방지
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  keepalive:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - name: Supabase keep-alive 요청
        run: |
          curl -fsS "${{ secrets.VITE_SUPABASE_URL }}/rest/v1/volumes?select=id&limit=1" \
            -H "apikey: ${{ secrets.VITE_SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.VITE_SUPABASE_ANON_KEY }}" \
            -o /dev/null
          echo "keep-alive OK"

  build:
    if: github.event_name != 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
        env:
          VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      - uses: actions/configure-pages@v4
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: Pages 배포 + 주 1회 Supabase keep-alive"
```

- [ ] **Step 3: [사용자 작업] GitHub 저장소·시크릿·Pages 설정**

`gh` CLI가 인증돼 있으면 에이전트가 수행 시도, 아니면 사용자에게 요청:

```bash
gh repo create series-dashboard --public --source . --push
gh secret set VITE_SUPABASE_URL --body "<Project URL>"
gh secret set VITE_SUPABASE_ANON_KEY --body "<anon key>"
```

수동일 경우: github.com에서 `series-dashboard` 공개 저장소 생성 → `git remote add origin ... && git push -u origin master` → Settings → Secrets and variables → Actions에 시크릿 2개 등록 → Settings → Pages → Source를 **GitHub Actions**로 설정.

- [ ] **Step 4: 배포 확인**

push 후 Actions 탭에서 deploy 성공 확인.
접속: `https://<계정>.github.io/series-dashboard/` → 로그인 화면 표시.
Supabase URL Configuration의 Redirect URLs에 이 주소가 등록돼 있는지 재확인(Task 3-3에서 등록함).

---

### Task 8: 1단계 완료 수동 검증

**Files:** 없음 (검증만)

체크리스트 — 전부 통과해야 1단계 완료:

- [ ] 배포된 사이트에서 관리자 이메일로 매직 링크 로그인 성공 (Gmail SMTP 경유 수신)
- [ ] 초대 안 된 이메일 입력 시 "초대된 이메일이 아닙니다" 표시, 메일 미발송
- [ ] 명부(members)에 없는 이메일을 Studio에서 Users로만 초대해 로그인 → "명부에서 확인되지 않았습니다" 화면 (확인 후 해당 테스트 유저 삭제)
- [ ] `npm run check-rls` 전체 통과
- [ ] Studio SQL Editor에서 `insert into volumes (number, title) values (0, '테스트권');` 실행 후 `select * from activity_log;`에 insert 기록 확인, `update volumes set sort_order...` 대신 `update volumes set title='테스트권2' where number=0;` → update 기록 확인, `delete from volumes where number=0;` → delete 기록 확인 (트리거 검증. 이때 actor_id는 SQL Editor 실행이라 null이어도 정상)
- [ ] 새 브라우저(시크릿 창)에서 로그인 상태가 유지되지 않음 확인, 기존 창은 새로고침해도 세션 유지
- [ ] Actions의 deploy 워크플로에 keepalive job이 스케줄로 등록됨 (다음 월요일 실행 예정 확인은 생략 가능)

완료 시:

```bash
git tag phase1-done
```

---

## Self-Review 결과

- **커버리지**: 설계 §10 1단계 항목(세팅/스키마·트리거·RLS/SMTP/로그인+첫 로그인 연결/배포+keep-alive) 전부 Task 1~7에 대응. SMTP는 사람 작업이므로 Task 3 문서로 커버.
- **타입 일관성**: `useAuth()` 시그니처(Task 4 Produces)와 Task 5의 사용처 일치. `check-rls`의 테이블 목록 8개 = schema.sql의 테이블 8개.
- **의도적 제외**: works_registry에는 audit 트리거를 달지 않음(불변 데이터, 설계 §4 트리거 대상 목록에 없음). Storage 버킷 생성은 자료실 단계(5단계)로 미룸 — YAGNI.
- **알려진 한계**: schema.sql은 로컬에서 실행 검증이 불가능해 Task 3에서 첫 적용이 곧 검증이다. 오류 발생 시 Studio의 오류 메시지를 보고 수정 후, 프로젝트가 새것이므로 Database → Tables에서 전체 삭제 후 재실행해도 안전하다.
```
