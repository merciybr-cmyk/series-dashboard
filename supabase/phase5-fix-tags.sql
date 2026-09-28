-- phase5 시드 보정: 작품명이 엑셀과 조금 다른(부제·띄어쓰기·문장부호) 현대시 후보에 콘셉트 태그를 채운다.
-- 조건: 태그가 빈 후보 중 작가가 같고, 띄어쓰기·문장부호를 무시한 작품명이 엑셀 작품명으로 시작하는 경우.
--       엑셀 1편 ↔ 후보 1편으로 딱 맞을 때만 채운다(애매하면 건드리지 않고 '여전히 미매칭'으로 보고).
-- 생성: node scripts/gen-phase5-fix.mjs — 여러 번 실행해도 안전(이미 태그가 있는 후보는 건드리지 않음).
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
), norm as (
  select s.*,
         regexp_replace(lower(s.title), '[[:space:][:punct:]·「」『』〈〉《》]', '', 'g') as nt,
         regexp_replace(s.author, '\s', '', 'g') as na
    from seed s
   where not exists (
     select 1 from public.genre_picks p
      where p.work_snapshot ->> 'title' = s.title and p.work_snapshot ->> 'author' = s.author)
), cand as (
  select n.title as seed_title, n.author as seed_author, n.vols,
         p.id as pick_id, p.work_snapshot ->> 'title' as pick_title
    from norm n
    join public.genre_picks p
      on regexp_replace(p.work_snapshot ->> 'author', '\s', '', 'g') = n.na
     and regexp_replace(lower(p.work_snapshot ->> 'title'), '[[:space:][:punct:]·「」『』〈〉《》]', '', 'g') like n.nt || '%'
     and p.concept_volume_ids = '{}'
), uniq as (
  select c.* from cand c
   where (select count(*) from cand c2 where c2.seed_title = c.seed_title and c2.seed_author = c.seed_author) = 1
     and (select count(*) from cand c3 where c3.pick_id = c.pick_id) = 1
), upd as (
  update public.genre_picks p
     set concept_volume_ids = coalesce(
       (select array_agg(v.id order by v.number) from public.volumes v where v.number = any (u.vols)),
       '{}')
    from uniq u
   where p.id = u.pick_id
  returning u.seed_title, u.seed_author, u.pick_title
)
select '보정됨' as 결과, seed_title || ' / ' || seed_author as 엑셀_작품, pick_title as 후보_작품명 from upd
union all
select '여전히 미매칭', n.title || ' / ' || n.author, null
  from norm n
 where not exists (select 1 from uniq u where u.seed_title = n.title and u.seed_author = n.author)
order by 1, 2;
