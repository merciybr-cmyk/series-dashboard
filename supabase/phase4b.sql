-- 4b: 일정 색상 (2026-08-27 사용자 요청 — 9색 팔레트 키 저장)
-- 적용: Supabase Studio SQL Editor에서 1회 실행
alter table public.schedules add column color text;
