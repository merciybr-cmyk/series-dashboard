-- 5b: 갈래별 후보에서 뺐다가 다시 넣어도 콘셉트 태그('어울리는 권')가 남게 한다 (2026-09-28)
-- 후보를 지울 때 태그를 works_registry.concept_memo에 보관하고, 같은 작품을 다시 후보로 넣으면 되살린다.
-- 화면 밖(SQL)에서 빼고 넣어도 같게 동작하도록 트리거로 구현. 적용: Supabase MCP로 적용됨(기록용 파일).

alter table public.works_registry add column concept_memo uuid[];

create function public.keep_pick_concept()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if coalesce(array_length(old.concept_volume_ids, 1), 0) > 0 then
    update public.works_registry set concept_memo = old.concept_volume_ids where work_id = old.work_id;
  end if;
  return old;
end;
$$;

create trigger genre_picks_keep_concept before delete on public.genre_picks
  for each row execute function public.keep_pick_concept();

create function public.restore_pick_concept()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  memo uuid[];
begin
  if coalesce(array_length(new.concept_volume_ids, 1), 0) = 0 then
    select concept_memo into memo from public.works_registry where work_id = new.work_id;
    if memo is not null then
      -- 그사이 삭제된 권은 뺀다
      new.concept_volume_ids := coalesce(
        (select array_agg(v.id order by v.number) from public.volumes v where v.id = any (memo)), '{}');
    end if;
  end if;
  return new;
end;
$$;

create trigger genre_picks_restore_concept before insert on public.genre_picks
  for each row execute function public.restore_pick_concept();
