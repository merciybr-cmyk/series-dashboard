# 2단계 세팅 절차 (1회, 사람 작업)

## 1. 스키마 보강
Supabase Studio → SQL Editor에서 `supabase/phase2.sql` 내용을 붙여넣고 Run.

## 2. 작품 시트 CSV 주소 등록
literature-db 프로젝트의 `.env` 파일에 있는 `VITE_SHEETS_CSV_URL=` 줄을 그대로 복사해서:
1. 이 저장소의 `.env.local`에 한 줄 추가
2. GitHub 저장소 Settings → Secrets and variables → Actions →
   New repository secret: Name `VITE_SHEETS_CSV_URL`, 값은 URL 부분만
