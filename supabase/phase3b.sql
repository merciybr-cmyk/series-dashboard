-- 3b: 갈래별 후보(genre_picks) — 권 배치 전 롱리스트 (2026-08-26 사용자 요청)
-- 적용: Supabase Studio SQL Editor에서 1회 실행

create table public.genre_picks (
  id uuid primary key default gen_random_uuid(),
  work_id text not null unique references public.works_registry (work_id),
  work_snapshot jsonb not null,
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);

alter table public.genre_picks enable row level security;
create policy genre_picks_member_all on public.genre_picks
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- created_by 자동 기록 (기존 함수 재사용)
create trigger genre_picks_created_by before insert on public.genre_picks
  for each row execute function public.set_registry_created_by();
