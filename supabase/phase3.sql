-- 3단계 스키마: 자료 업로드용 비공개 버킷 + 업로더 자동 기록 (설계 §5.1 자료)
-- 적용: Supabase Studio SQL Editor에서 1회 실행 (docs/setup-phase3.md)

-- (1) 비공개 버킷
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', false);

-- (2) 스토리지 접근: 구성원만 읽기/쓰기
create policy attachments_member_all on storage.objects
  for all to authenticated
  using (bucket_id = 'attachments' and public.is_member())
  with check (bucket_id = 'attachments' and public.is_member());

-- (3) files.uploaded_by 자동 기록 (클라이언트 입력을 믿지 않는다 — §6.4)
create function public.set_file_uploader()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  new.uploaded_by := public.current_member_id();
  return new;
end;
$$;

create trigger files_uploader before insert on public.files
  for each row execute function public.set_file_uploader();
