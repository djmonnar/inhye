# 주문 · 주문 비서 · 카카오톡 알림

꽃다발 같은 **예약 주문**을 앱 안 채팅(주문 비서)으로 등록·정리·수정·삭제하고,
매일 아침 카카오톡 **‘나와의 채팅’**으로 챙길 주문을 알려줘요. (2026-11-10 추가)

## 화면 (`/orders`, 더보기 → 주문 · 주문 비서)

- **주문 비서**: 주문을 그대로 붙여 넣거나 말로 써요. 여러 줄이면 줄마다 등록.
  - `11/11 수 픽업 김포포 하치와레 꽃다발 2.5만원` → 11/11 픽업, 김포포, 하치와레 꽃다발, 25,000원
  - `11/23 월 택배 박고양 하치와레 꽃다발 2.5만원 (라넌으로 변경)` → 택배, 메모 ‘라넌으로 변경’
  - 수정 `이토끼 3만5천원으로 바꿔줘`, 완료 `박고양 택배 보냈어`, 삭제 `김포포 주문 취소`, 정리 `이번 주 주문 정리해줘`
  - 어떤 주문인지 애매하면 바꾸지 않고 되물어요. 화면엔 **서버가 실제로 바꾼 것만** ‘✓ 등록/수정/완료’로 보여요.
- **주문 목록**: 진행 중 / 완료 / 전체, 날짜순, D-day(택배 7일 안·픽업 하루 안은 노랑, 지난 건 빨강), ✓ 버튼으로 완료.
  눌러서 직접 고치기·완료·주문 취소(관리자는 취소된 주문 완전히 지우기).
- **홈 카드**: ‘챙길 주문 N건’ (7일 안 택배, 오늘·내일 픽업).

## 데이터 (`public/schema.sql` 7번, 스키마 버전 3)

- `orders`: customer, item, price, due_date, method(`pickup`/`delivery`), status(`open`/`done`/`canceled`), memo, contact, address, source_text(원문), done_at.
  RLS: 읽기·추가·수정 = 직원 이상, 지우기 = 관리자. 채팅의 ‘삭제’는 `canceled`(되살릴 수 있어요).
- `kakao_tokens`(한 줄): 카카오 access/refresh 토큰, `last_brief_on`. **서비스 키만**(anon/authenticated 권한 없음, 정책 없음).
- ⚠️ 2026-11-10 현재 Supabase `postgres` 로그인 문제(PAM 28000)로 새 표를 못 만들어서, 고쳐지면 `/setup` ‘앱에서 바로 실행’ 후 쓸 수 있어요.

## 주문 비서 동작 (`src/lib/server/orders.ts`, `POST /api/orders/chat`)

- OpenAI(서버 전용, `OPENAI_API_KEY`)에 오늘 날짜(KST)·지금 주문 목록(짧은 번호 #1, #2…)·최근 대화 6줄·새 메시지를 주고,
  **엄격한 JSON**으로 `{reply, actions[]}`를 받아요. action = create / update / complete / reopen / cancel.
- 서버가 검사해서 반영: 날짜 형식 확인, 번호 → 진짜 id, 가격 0 이상, 글자 길이 제한. 실패한 건 `skipped`로 이유를 보여줘요.
- 연도 없는 날짜는 오늘 이후 가장 가까운 날(2달 넘게 지난 날짜면 내년).

## 카카오톡 알림 (`src/lib/server/kakao.ts`, `/api/kakao/*`, `/api/cron/orders`)

- **나에게 보내기** API(`POST https://kapi.kakao.com/v2/api/talk/memo/default/send`, 텍스트 템플릿 200자).
  나와의 채팅방은 **보내기 전용**이라 거기서 주문을 받을 수는 없어요(받으려면 카카오톡 채널 + 챗봇이 필요).
- 매일 **UTC 0시 = 한국 9시쯤**(Vercel Cron, `vercel.json`) `/api/cron/orders`가 돌아요. `Authorization: Bearer $CRON_SECRET`이 맞아야만 동작, 하루 한 번(`last_brief_on`).
- 알림 내용: **택배는 날짜 7일 전부터 완료할 때까지 매일**(지난 것도), **픽업은 전날·당일**. 완료·취소는 빠져요. 보낼 게 없으면 안 보내요. 200자 넘으면 ‘외 N건’.
- 토큰: access는 끝나기 5분 전 자동 갱신, refresh는 카카오가 새로 줄 때 저장(매일 돌면 계속 유지).
- 연결: 관리자 → 주문 화면 ‘카카오톡 연결’ → 카카오 동의 → `/api/kakao/callback`이 토큰 저장(state는 서버 키로 서명, 10분 유효).

### 카카오 디벨로퍼스 설정 (사장님이 한 번)

1. https://developers.kakao.com → 로그인 → **내 애플리케이션 → 애플리케이션 추가** (앱 이름 ‘포포하우스’ 등)
2. **앱 키 → REST API 키** 복사 → Vercel 환경변수 `KAKAO_REST_API_KEY` (Secret)
3. **플랫폼 → Web → 사이트 도메인**에 `https://inhye.vercel.app` 등록 (알림 버튼 링크용)
4. **카카오 로그인 → 활성화 ON**, **Redirect URI**에 `https://inhye.vercel.app/api/kakao/callback` 등록
5. **동의항목 → 카카오톡 메시지 전송(talk_message)** → 선택 동의로 설정
6. (선택) **보안 → Client Secret** 을 ‘사용함’으로 했다면 코드 → Vercel `KAKAO_CLIENT_SECRET` (Secret)
7. Vercel `CRON_SECRET` = 아무 긴 비밀 문자열(영문·숫자 32자 이상 권장, Secret)
8. Redeploy → 앱 **주문 화면 → 카카오톡 연결** → 동의 → **지금 보내 보기**로 확인

메뉴 이름은 카카오 콘솔 개편에 따라 조금 다를 수 있어요.

## 환경변수

| 이름 | 공개 | 설명 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 비밀 | 주문 비서(이미 AI 기능에 쓰는 키) |
| `KAKAO_REST_API_KEY` | 비밀 | 카카오 앱 REST API 키 |
| `KAKAO_CLIENT_SECRET` | 비밀 | (선택) Client Secret 사용 시 |
| `KAKAO_REDIRECT_URI` | | (선택) 기본 `https://<사이트>/api/kakao/callback` |
| `CRON_SECRET` | 비밀 | 매일 알림 호출 확인용 |
| `APP_URL` | | (선택) 알림 버튼 주소. 기본은 Vercel 프로덕션 주소 |
