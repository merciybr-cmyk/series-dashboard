-- 5단계: 갈래 후보 자동 배치 (설계 docs/superpowers/specs/2026-09-28-auto-placement-design.md)
-- 적용: Supabase Studio SQL Editor에서 1회 실행 (docs/setup-phase5.md).
-- 마지막 결과표의 "미매칭 작품"이 비어 있으면(null) 태그 시드 성공.

-- (1) 권 ↔ 교육과정기 (기획안 시리즈 구성)
alter table public.volumes add column curricula text[] not null default '{}';

update public.volumes set curricula = '{1차,2차,3차}' where number = 1;
update public.volumes set curricula = '{4차}' where number = 2;
update public.volumes set curricula = '{5차}' where number = 3;
update public.volumes set curricula = '{6차}' where number = 4;
update public.volumes set curricula = '{7차}' where number = 5;
update public.volumes set curricula = '{2007개정,2009개정}' where number = 6;
update public.volumes set curricula = '{2015개정}' where number = 7;
update public.volumes set curricula = '{2022개정}' where number = 8;

-- (2) 후보 콘셉트 태그 ("어울리는 권")
alter table public.genre_picks add column concept_volume_ids uuid[] not null default '{}';

-- (3) 자동 배치 적용 묶음 (일괄 되돌리기용)
create table public.placement_batches (
  id uuid primary key default gen_random_uuid(),
  genre text not null,
  item_count int not null default 0,
  created_part_ids uuid[] not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by uuid
);

alter table public.placement_batches enable row level security;
create policy placement_batches_member_all on public.placement_batches
  for all to authenticated using (public.is_member()) with check (public.is_member());

-- created_by 자동 기록 (phase2.sql 함수 재사용)
create trigger placement_batches_created_by before insert on public.placement_batches
  for each row execute function public.set_registry_created_by();

-- 되돌린 사람 자동 기록
create function public.set_batch_undone_by()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.undone_at is not null and old.undone_at is null then
    new.undone_by := public.current_member_id();
  end if;
  return new;
end;
$$;

create trigger placement_batches_undone_by before update on public.placement_batches
  for each row execute function public.set_batch_undone_by();

-- (4) 자동 배치로 들어간 행 표시
alter table public.volume_works
  add column placement_batch_id uuid references public.placement_batches (id) on delete set null;

-- (5) 현대시 132편 콘셉트 태그 시드 — 갈래별 후보를 snapshot의 작품명·작가로 찾는다
-- BEGIN SEED (scripts/gen-phase5-seed.mjs가 생성 — 직접 고치지 말 것)
with seed(title, author, vols) as (values
  ('절정', '이육사', array[3]::int[]),
  ('가난한 사랑 노래', '신경림', array[3]::int[]),
  ('개여울', '김소월', array[6]::int[]),
  ('거울', '이상', array[8]::int[]),
  ('귀뚜라미', '나희덕', array[6]::int[]),
  ('꽃', '이육사', array[4]::int[]),
  ('나그네', '박목월', array[1]::int[]),
  ('나룻배와 행인', '한용운', array[8]::int[]),
  ('껍데기는 가라', '신동엽', array[4, 8]::int[]),
  ('남신의주 유동 박시봉방', '백석', array[4]::int[]),
  ('누가 하늘을 보았다 하는가', '신동엽', array[5, 8]::int[]),
  ('님의 침묵', '한용운', array[2, 8]::int[]),
  ('단단한 고요', '김선우', array[6]::int[]),
  ('대설주의보', '최승호', array[6]::int[]),
  ('먼 후일', '김소월', array[7]::int[]),
  ('모닥불', '백석', array[6]::int[]),
  ('모란이 피기까지는', '김영랑', array[2, 8]::int[]),
  ('목계장터', '신경림', array[4]::int[]),
  ('바다와 나비', '김기림', array[4]::int[]),
  ('별 헤는 밤', '윤동주', array[8]::int[]),
  ('봄 길', '정호승', array[7]::int[]),
  ('봄은', '신동엽', array[5]::int[]),
  ('사과를 먹으며', '함민복', array[7]::int[]),
  ('산유화', '김소월', array[8]::int[]),
  ('산에 언덕에', '신동엽', array[]::int[]),
  ('새로운 길', '윤동주', array[1]::int[]),
  ('서시', '윤동주', array[2]::int[]),
  ('성북동 비둘기', '김광섭', array[3]::int[]),
  ('성에꽃', '최두석', array[5]::int[]),
  ('수라', '백석', array[6]::int[]),
  ('숲', '정희성', array[6, 8]::int[]),
  ('쉽게 씌어진 시', '윤동주', array[3]::int[]),
  ('엄마 걱정', '기형도', array[5, 7]::int[]),
  ('연탄 한 장', '안도현', array[8]::int[]),
  ('우리 동네 구자명 씨', '고정희', array[6]::int[]),
  ('자화상', '윤동주', array[7]::int[]),
  ('장수산 1', '정지용', array[8]::int[]),
  ('저녁에', '김광섭', array[7]::int[]),
  ('저문 강에 삽을 씻고', '정희성', array[5]::int[]),
  ('접동새', '김소월', array[4]::int[]),
  ('즐거운 편지', '황동규', array[7]::int[]),
  ('지구', '박용하', array[6]::int[]),
  ('진달래꽃', '김소월', array[2]::int[]),
  ('첫사랑', '고재종', array[7]::int[]),
  ('청노루', '박목월', array[8]::int[]),
  ('청포도', '이육사', array[1, 2]::int[]),
  ('초혼', '김소월', array[3]::int[]),
  ('폭포', '김수영', array[3]::int[]),
  ('풀', '김수영', array[3, 8]::int[]),
  ('하관', '박목월', array[8]::int[]),
  ('해에게서 소년에게', '최남선', array[1]::int[]),
  ('향수', '정지용', array[3]::int[]),
  ('흰 바람벽이 있어', '백석', array[7]::int[]),
  ('흥부 부부상', '박재삼', array[4, 8]::int[]),
  ('빼앗긴 들에도 봄은 오는가', '이상화', array[1]::int[]),
  ('눈', '김수영', array[7]::int[]),
  ('광야', '이육사', array[1, 2]::int[]),
  ('가는 길', '김소월', array[5]::int[]),
  ('유리창 1', '정지용', array[3]::int[]),
  ('농무', '신경림', array[4]::int[]),
  ('가정', '이상', array[4]::int[]),
  ('눈물', '김현승', array[7]::int[]),
  ('새들도 세상을 뜨는구나', '황지우', array[5]::int[]),
  ('여우난골족', '백석', array[4]::int[]),
  ('꽃덤불', '신석정', array[3, 7]::int[]),
  ('봄은 고양이로다', '이장희', array[3, 7]::int[]),
  ('너를 기다리는 동안', '황지우', array[6, 7]::int[]),
  ('묵화', '김종삼', array[6]::int[]),
  ('원어', '하종오', array[6]::int[]),
  ('라디오와 같이 사랑을 끄고 켤 수 있다면', '장정일', array[6]::int[]),
  ('비', '정지용', array[6]::int[]),
  ('바퀴벌레는 진화 중', '김기택', array[5]::int[]),
  ('희미한 옛사랑의 그림자', '김광규', array[5]::int[]),
  ('해', '박두진', array[3]::int[]),
  ('참회록', '윤동주', array[]::int[]),
  ('알 수 없어요', '한용운', array[1]::int[]),
  ('가지 않은 길', '프로스트', array[]::int[]),
  ('엄마야 누나야', '김소월', array[1]::int[]),
  ('깃발', '유치환', array[1]::int[]),
  ('추억에서', '박재삼', array[4]::int[]),
  ('추일서정', '김광균', array[3]::int[]),
  ('플라타너스', '김현승', array[2]::int[]),
  ('타는 목마름으로', '김지하', array[4]::int[]),
  ('사평역에서', '곽재구', array[5]::int[]),
  ('귀천', '천상병', array[4]::int[]),
  ('난초 4', '이병기', array[6]::int[]),
  ('풀벌레 소리 가득 차 있었다', '이용악', array[5]::int[]),
  ('우리 오빠와 화로', '임화', array[5]::int[]),
  ('해바라기의 비명', '함형수', array[4]::int[]),
  ('돌담에 속삭이는 햇발', '김영랑', array[1]::int[]),
  ('개화', '이호우', array[1]::int[]),
  ('성탄제', '김종길', array[2, 7]::int[]),
  ('목마와 숙녀', '박인환', array[3]::int[]),
  ('승무', '조지훈', array[1]::int[]),
  ('사슴', '노천명', array[1]::int[]),
  ('외인촌', '김광균', array[3]::int[]),
  ('낡은 집', '이용악', array[4]::int[]),
  ('인동차', '정지용', array[8]::int[]),
  ('상행', '김광규', array[5]::int[]),
  ('피아노', '전봉건', array[3]::int[]),
  ('행복', '유치환', array[6]::int[]),
  ('자수', '허영자', array[5]::int[]),
  ('산', '김광섭', array[4]::int[]),
  ('말', '정지용', array[4]::int[]),
  ('시1', '김춘수', array[4]::int[]),
  ('국경의 밤', '김동환', array[3]::int[]),
  ('고향', '정지용', array[8]::int[]),
  ('그날이 오면', '심훈', array[3]::int[]),
  ('봉황수', '조지훈', array[3]::int[]),
  ('불놀이', '주요한', array[3]::int[]),
  ('풀잎', '박성룡', array[1]::int[]),
  ('난초', '이병기', array[1]::int[]),
  ('사향', '김상옥', array[1]::int[]),
  ('우리가 물이 되어', '강은교', array[5]::int[]),
  ('남으로 창을 내겠소', '김상용', array[2]::int[]),
  ('달밤', '이호우', array[2]::int[]),
  ('봄', '이성부', array[6]::int[]),
  ('언덕', '김광균', array[1]::int[]),
  ('물새알 산새알', '박목월', array[1]::int[]),
  ('여승', '백석', array[4]::int[]),
  ('낙화', '조지훈', array[8]::int[]),
  ('가을에', '정한모', array[1]::int[]),
  ('가을의 기도', '김현승', array[2]::int[]),
  ('내 마음은', '김동명', array[5]::int[]),
  ('선운사에서', '최영미', array[8]::int[]),
  ('벼', '이성부', array[7]::int[]),
  ('해바라기', '윤곤강', array[3]::int[]),
  ('파랑새', '한하운', array[3]::int[]),
  ('달·포도·잎사귀', '장만영', array[3]::int[]),
  ('불국사', '박목월', array[3]::int[]),
  ('오감도', '이상', array[4]::int[]),
  ('오렌지', '신동집', array[4]::int[])
), matched as (
  update public.genre_picks p
     set concept_volume_ids = coalesce(
       (select array_agg(v.id order by v.number) from public.volumes v where v.number = any (s.vols)),
       '{}')
    from seed s
   where p.work_snapshot ->> 'title' = s.title
     and p.work_snapshot ->> 'author' = s.author
  returning s.title, s.author
)
select
  (select count(*) from seed) as "시드 편수",
  (select count(*) from matched) as "매칭 편수",
  (select string_agg(s.title || ' / ' || s.author, ', ')
     from seed s
    where not exists (select 1 from matched m where m.title = s.title and m.author = s.author)) as "미매칭 작품";
-- END SEED
