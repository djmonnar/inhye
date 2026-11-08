# 설정 · 배포

## 현재 상태 (2026-11-08)

| 항목 | 상태 |
| --- | --- |
| GitHub | `djmonnar/inhye`, 브랜치 `ccr-3f5271b3-xj7bqa` (유일·기본 브랜치) |
| Vercel | 프로젝트 `inhye` (팀 djmonnar4-3362's projects), https://inhye.vercel.app, 푸시하면 자동 배포 |
| Vercel 보호 | Standard Protection 켜져 있음 — 직원 폰에서 Vercel 로그인이 뜨면 Settings → Deployment Protection에서 끄기 |
| Supabase | 프로젝트는 만들었지만 **Vercel 환경변수 미입력** → 사이트는 체험 모드 |
| 빅솔론 키 | Vercel에 아직 없음 (`BIXOLON_STORE_ID`, `BIXOLON_API_KEY`) |

## 환경변수 (Vercel → Settings → Environment Variables, 전 환경 체크 후 Redeploy)

| 이름 | 공개 | 설명 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 공개 | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (또는 `_PUBLISHABLE_KEY`) | 공개 | anon/publishable 키 |
| `SUPABASE_SERVICE_ROLE_KEY` (또는 `SUPABASE_SECRET_KEY`) | **비밀** | 서버 전용. 관리자/직원 계정, 매출 저장 |
| `OPENAI_API_KEY` | **비밀** | AI 기능 |
| `OPENAI_MODEL` | | (선택) 모델 바꾸기 |
| `BIXOLON_STORE_ID` | | 빅솔론 매장 ID (434) |
| `BIXOLON_API_KEY` | **비밀** | 빅솔론 연동 키 |
| `BIXOLON_BRAND_ID` / `BIXOLON_HQ_ID` / `BIXOLON_AGENCY_ID` | | (선택) 124 / 111 / 67 |
| `BIXOLON_AUTH_SCHEME`, `BIXOLON_API_BASE` | | (선택) 인증 형식(기본 Bearer), API 주소 |
| `NEXT_PUBLIC_SHOP_NAME` | 공개 | (선택) 가게 이름, 기본 포포하우스 |
| `NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN` | 공개 | (선택) 아이디 로그인용 내부 도메인, 기본 `inhye.local` |

- `next.config.ts`는 Vercel 연동이 붙이는 접두어(`STORAGE_SUPABASE_URL` 등)나 `NEXT_PUBLIC_` 없는 이름도 찾아서 공개 이름으로 넣어줘요. 서비스 키도 접미어로 찾아요.
- Supabase 값 위치: 프로젝트 위 **Connect → App Frameworks → Next.js**(URL·공개 키), **Project Settings → API Keys**(secret / legacy service_role).

## Supabase 처음 설정

1. Vercel에 값 넣고 Redeploy
2. `https://inhye.vercel.app/setup` → **SQL 복사** → Supabase SQL 편집기에 붙여넣고 Run (`public/schema.sql`, 다시 실행해도 안전)
3. 같은 화면에서 관리자 아이디·비밀번호 만들기 (서비스 키 필요. 없으면 Supabase Authentication에서 `아이디@inhye.local`로 직접 만들고 Auto Confirm — 첫 계정이 관리자)
4. 스키마가 바뀐 업데이트 후에는 2번 SQL을 다시 실행

## 계정 · 권한

- 첫 계정 = `admin`, 이후 직접 가입 = `pending`(아무것도 못 봄, 관리자가 승인). 직원은 `/members`에서 관리자가 만들어요.
- RLS: 읽기/쓰기는 admin·staff, 삭제는 admin. `pos_sales` 쓰기·`apply_pos_sales()`는 서버(service_role)만.

## 에이전트(클라우드 세션) 참고

- 이 저장소를 다루는 클라우드 환경 네트워크 허용 목록에 `asp-manual.notion.site`가 추가돼 있고, `api.bixolon-pos.com`용 키(시험용)가 환경 비밀로 저장돼 있어요. 앱과는 무관, 필요 없으면 환경 설정에서 지우기.
- Vercel 도구로는 배포 조회·재배포는 되지만 환경변수 목록/추가, 프로젝트 생성 권한은 없어요 → 사용자가 대시보드에서.
- 검증 방법: `typecheck`·`lint`·`build`, Playwright(휴대폰 화면, 가짜 카메라/가짜 WebUSB), 로컬 PostgreSQL 16에 Supabase 흉내(auth/storage 스키마, anon·authenticated·service_role 역할)를 만들고 `schema.sql` 2회 실행 + RLS/함수 시험.
