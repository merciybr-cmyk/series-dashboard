// phase5.sql의 시드 블록(현대시 132편 콘셉트 태그)을 픽스처에서 생성한다.
// 사용: node scripts/gen-phase5-seed.mjs  → supabase/phase5.sql의 BEGIN SEED ~ END SEED 사이를 교체
import fs from 'node:fs'

const FIXTURE = new URL('../src/tests/fixtures/modernPoetry132.json', import.meta.url)
const SQL = new URL('../supabase/phase5.sql', import.meta.url)
const q = s => `'${String(s).replace(/'/g, "''")}'`

const rows = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'))
const values = rows
  .map(r => `  (${q(r.title)}, ${q(r.author)}, array[${r.conceptVolumes.join(', ')}]::int[])`)
  .join(',\n')

const block = `-- BEGIN SEED (scripts/gen-phase5-seed.mjs가 생성 — 직접 고치지 말 것)
with seed(title, author, vols) as (values
${values}
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
-- END SEED`

const sql = fs.readFileSync(SQL, 'utf8')
if (!/-- BEGIN SEED[\s\S]*-- END SEED/.test(sql)) throw new Error('phase5.sql에 BEGIN SEED / END SEED 표식이 없습니다')
fs.writeFileSync(SQL, sql.replace(/-- BEGIN SEED[\s\S]*-- END SEED/, () => block))
console.log(`시드 ${rows.length}편을 phase5.sql에 기록했습니다`)
