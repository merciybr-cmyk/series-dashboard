# DB 자동 백업 (주 1회 pg_dump)

`.github/workflows/backup.yml`이 매주 월요일 03:30(KST)에 Supabase DB의 `public` 스키마를
pg_dump로 받아 **암호화한 뒤** GitHub Actions 아티팩트(90일 보관)로 올린다.

- 저장소가 **공개**이므로 아티팩트는 로그인한 누구나 내려받을 수 있다. 그래서 암호화 없이는 절대 업로드하지 않는다(워크플로가 시크릿 없으면 실패하도록 되어 있음).
- 백업 범위는 `public` 스키마(권·작품·후보·일정·자료 메타데이터 등 앱 데이터 전부).
  - `auth.users`(계정)는 포함되지 않는다 — 복구 시 멤버 재초대로 해결(이메일은 `members`에 있음).
  - **Storage 파일(자료실 회의록·작품 자료 원본)은 포함되지 않는다.** 원본은 구글 드라이브 병행 보관 권장.
- 스케줄 실행이 실패하면 저장소 소유자에게 GitHub 알림 메일이 간다. 무료 플랜 일시정지 시에도 실패하므로 일시정지 감지 역할도 겸한다.
- 참고: 공개 저장소는 60일간 커밋이 없으면 스케줄 워크플로가 자동 비활성화된다(알림 메일 옴 — Actions 탭에서 다시 활성화).

## 최초 설정 (저장소 시크릿 2개)

GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret:

1. `SUPABASE_DB_URL` — Supabase Studio → 프로젝트 상단 **Connect** → **Session pooler** 탭의 URI.
   형식: `postgresql://postgres.gsenqddhkwerhshudgbn:[비밀번호]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`
   - `[비밀번호]` 자리에 DB 비밀번호를 넣는다. 모르면 Studio → Settings → Database에서 Reset 가능.
   - 반드시 **Session pooler**(포트 5432)여야 한다. Direct connection은 IPv6 전용이라 GitHub Actions에서 접속이 안 된다.
2. `BACKUP_PASSPHRASE` — 백업 파일 암호화용 임의의 긴 문구. **비밀번호 관리자 등에 따로 보관할 것**(잃어버리면 백업을 풀 수 없다).

설정 후 Actions 탭 → backup → **Run workflow**로 수동 1회 실행해 성공을 확인한다.

## 복구 절차

1. Actions 탭 → 최근 성공한 backup 실행 → 아티팩트 `db-backup-N` 다운로드, 압축 해제 → `backup.dump.enc`
2. 복호화:
   ```bash
   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
     -pass pass:'<BACKUP_PASSPHRASE>' -in backup.dump.enc -out backup.dump
   ```
3. 복원 (새 프로젝트라면 먼저 `supabase/schema.sql`~`phase4b.sql`을 순서대로 실행해 스키마·RLS·트리거를 만든 뒤):
   ```bash
   pg_restore --dbname "<SUPABASE_DB_URL>" \
     --schema=public --data-only --disable-triggers backup.dump
   ```
   - 기존 프로젝트에 덮어쓸 때는 대상 테이블을 비운 뒤 실행한다.
4. 멤버 초대: Studio에서 `members`의 이메일대로 재초대(스키마 문서의 운영 절차 참고).
