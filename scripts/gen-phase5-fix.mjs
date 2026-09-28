// phase5 시드 보정 SQL 생성 (2026-09-28): 엑셀 작품명과 DB 작품명이 부제·띄어쓰기로 달라
// 정확 일치 시드에서 빠진 후보에 콘셉트 태그를 채운다.
// 사용: node scripts/gen-phase5-fix.mjs → supabase/phase5-fix-tags.sql
import fs from 'node:fs'

const FIXTURE = new URL('../src/tests/fixtures/modernPoetry132.json', import.meta.url)
const OUT = new URL('../supabase/phase5-fix-tags.sql', import.meta.url)
const q = s => `'${String(s).replace(/'/g, "''")}'`

const rows = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
const values = rows
  .map(r => `  (${q(r.title)}, ${q(r.author)}, array[${r.conceptVolumes.join(', ')}]::int[])`)
  .join(',\n')

const sql = `-- phase5 시드 보정: 작품명이 엑셀과 조금 다른(부제·띄어쓰기·문장부호) 현대시 후보에 콘셉트 태그를 채운다.
-- 조건: 태그가 빈 후보 중 작가가 같고, 띄어쓰기·문장부호를 무시한 작품명이 엑셀 작품명으로 시작하는 경우.
--       엑셀 1편 ↔ 후보 1편으로 딱 맞을 때만 채운다(애매하면 건드리지 않고 '여전히 미매칭'으로 보고).
-- 생성: node scripts/gen-phase5-fix.mjs — 여러 번 실행해도 안전(이미 태그가 있는 후보는 건드리지 않음).
with seed(title, author, vols) as (values
${values}
), norm as (
  select s.*,
         regexp_replace(lower(s.title), '[[:space:][:punct:]·「」『』〈〉《》]', '', 'g') as nt,
         regexp_replace(s.author, '\\s', '', 'g') as na
    from seed s
   where not exists (
     select 1 from public.genre_picks p
      where p.work_snapshot ->> 'title' = s.title and p.work_snapshot ->> 'author' = s.author)
), cand as (
  select n.title as seed_title, n.author as seed_author, n.vols,
         p.id as pick_id, p.work_snapshot ->> 'title' as pick_title
    from norm n
    join public.genre_picks p
      on regexp_replace(p.work_snapshot ->> 'author', '\\s', '', 'g') = n.na
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
`
fs.writeFileSync(OUT, sql)
console.log(`보정 SQL 생성: ${rows.length}편 시드`)
