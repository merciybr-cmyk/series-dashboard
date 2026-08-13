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
