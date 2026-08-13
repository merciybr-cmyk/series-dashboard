-- 2단계 스키마 보강. 적용: Supabase Studio SQL Editor에서 1회 실행 (docs/setup-phase2.md 참고)

-- (1) 같은 작품(title+author_base)의 중복 등록 차단
create unique index works_registry_title_author_key
  on public.works_registry (title, author_base);

-- (2) 부(部) — 권 하위 구성, 선택적 (설계 §4 volume_parts. UI는 2b단계)
create table public.volume_parts (
  id uuid primary key default gen_random_uuid(),
  volume_id uuid not null references public.volumes (id) on delete cascade,
  number int not null,
  title text,
  sort_order int not null default 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (volume_id, number)
);

alter table public.volume_works
  add column part_id uuid references public.volume_parts (id) on delete set null;

alter table public.volume_parts enable row level security;
create policy volume_parts_member_all on public.volume_parts
  for all to authenticated using (public.is_member()) with check (public.is_member());

create trigger volume_parts_audit before insert or update on public.volume_parts
  for each row execute function public.set_audit_fields();
create trigger volume_parts_log after insert or update or delete on public.volume_parts
  for each row execute function public.log_activity();

alter publication supabase_realtime add table public.volume_parts;

-- (3) works_registry의 created_by 자동 기록 (설계 §6.4 — 클라이언트 입력을 믿지 않는다)
-- set_audit_fields는 updated_* 컬럼을 요구하므로 registry 전용 함수를 둔다.
create function public.set_registry_created_by()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  new.created_by := public.current_member_id();
  return new;
end;
$$;

create trigger works_registry_created_by before insert on public.works_registry
  for each row execute function public.set_registry_created_by();
