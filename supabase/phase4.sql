-- 4단계: 일정에 종류·확인 대상자 추가 (2026-08-26 사용자 결정)
-- 적용: Supabase Studio SQL Editor에서 1회 실행

alter table public.schedules
  add column kind text not null default '마감' check (kind in ('회의', '마감')),
  add column attendee_ids uuid[] not null default '{}';
