# Supabase 세팅 절차 (1회, 사람 작업)

수행자: 편집부 관리자. 소요 약 30분. 모두 무료.

## 1. 프로젝트 생성
1. https://supabase.com 가입/로그인 (GitHub 계정 권장)
2. New project → 이름 `series-dashboard`, Region `Northeast Asia (Seoul)`, DB 비밀번호 생성해 안전한 곳에 보관
3. Project Settings → API에서 **Project URL**과 **anon public key**를 복사
   - `service_role` 키는 절대 복사·공유·커밋하지 않는다

## 2. 스키마 적용
1. SQL Editor → New query
2. 저장소의 `supabase/schema.sql` 전체를 붙여넣고 Run
3. 오류 없이 "Success"가 떠야 한다. Table Editor에 테이블 8개가 보이는지 확인

## 3. 인증 설정
1. Authentication → Providers → Email: **Enable email provider** 켜기,
   **Confirm email** 끄기(매직 링크만 사용)
2. Authentication → URL Configuration:
   - Site URL: `https://merciybr-cmyk.github.io/series-dashboard/`
   - Redirect URLs에 아래 3줄을 각각 추가:
     - `http://localhost:5173`
     - `http://localhost:5173/**`
     - `https://merciybr-cmyk.github.io/series-dashboard/**`

## 4. Gmail SMTP (설계 §6.2 — 필수)
1. Google 계정 → 보안 → 2단계 인증 켜기 → 앱 비밀번호 생성 (이름: supabase)
2. Supabase → Project Settings → Auth → SMTP Settings → Enable custom SMTP:
   - Host `smtp.gmail.com`, Port `465`
   - Username: Gmail 주소, Password: 앱 비밀번호
   - Sender email: 같은 Gmail 주소, Sender name: `단행본 시리즈 대시보드`
3. 저장 후 아래 "첫 구성원 등록"에서 실제 수신 확인

## 5. 첫 구성원 등록 (관리자 본인)
1. Table Editor → members → Insert row:
   - email: 본인 이메일(**소문자**), name: 본인 이름, role: `editor`
2. Authentication → Users → Invite user → 같은 이메일 입력
3. 메일이 오면 링크 클릭 → 로그인됨
4. Table Editor → members에서 본인 행의 `auth_user_id`가 채워졌는지 확인
   (첫 로그인 연결 트리거 검증)

## 6. 로컬 환경변수
저장소 루트에 `.env.local` 파일 생성 (커밋 금지, .gitignore에 이미 있음):

```
VITE_SUPABASE_URL=<1-3에서 복사한 Project URL>
VITE_SUPABASE_ANON_KEY=<1-3에서 복사한 anon key>
```

## 이후 구성원을 추가할 때 (운영 절차)
1. Table Editor → members에 행 추가 (email 소문자, name, role)
2. Authentication → Users → Invite user로 같은 이메일 초대
순서는 바뀌어도 되지만 둘 다 해야 로그인이 된다.
