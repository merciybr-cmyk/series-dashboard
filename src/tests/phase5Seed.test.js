import fs from 'node:fs'
import path from 'node:path'
import fixture from './fixtures/modernPoetry132.json'

const sql = fs.readFileSync(path.resolve(process.cwd(), 'supabase/phase5.sql'), 'utf8')

test('phase5.sql 시드가 픽스처 132편과 일치한다 (gen-phase5-seed.mjs로 재생성)', () => {
  const block = sql.match(/-- BEGIN SEED[\s\S]*-- END SEED/)[0]
  const rows = block.match(/^ {2}\('.*', '.*', array\[.*\]::int\[\]\)/gm)
  expect(rows).toHaveLength(fixture.length)
  expect(block).toContain("('절정', '이육사', array[3]::int[])")
})

test('phase5.sql이 스키마와 1~8권 교육과정기를 포함한다', () => {
  expect(sql).toContain('alter table public.volumes add column curricula text[]')
  expect(sql).toContain('alter table public.genre_picks add column concept_volume_ids uuid[]')
  expect(sql).toContain('create table public.placement_batches')
  expect(sql).toContain('add column placement_batch_id uuid references public.placement_batches')
  expect(sql).toContain("set curricula = '{2007개정,2009개정}' where number = 6")
})
