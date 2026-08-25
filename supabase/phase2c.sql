-- 2c 스키마: 작품 검토 의견 (설계 §4 work_comments)
-- 적용: Supabase Studio SQL Editor에서 1회 실행 (docs/setup-phase2c.md)

create table public.work_comments (
  id uuid primary key default gen_random_uuid(),
  volume_work_id uuid not null references public.volume_works (id) on delete cascade,
  body text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.work_comments enable row level security;
create policy work_comments_member_all on public.work_comments
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- created_by 자동 기록: phase2.sql의 set_registry_created_by 재사용 (created_by만 세팅하는 함수)
create trigger work_comments_created_by before insert on public.work_comments
  for each row execute function public.set_registry_created_by();
