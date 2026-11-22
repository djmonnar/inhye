# AGENTS.md — 포포하우스 프로젝트 안내 (Codex · Claude 공통)

이 파일은 코딩 에이전트(Codex, Claude Code 등)가 이 저장소에서 일을 시작할 때 먼저 읽는 안내서예요.
자세한 내용은 [`docs/wiki/`](docs/wiki/README.md)에 있어요. 새로 알게 된 사실·결정은 **반드시 위키에 적고** 이 파일도 갱신해 주세요.

## 1. 무엇을 만드나

- **포포하우스**: 무인 소품샵(사장님 1명 + 직원 가능)의 상품·구매처·재고·라벨·매출 관리 웹앱 (PWA, 폰 우선).
- 사장님이 가장 힘들어하는 것: *“이 소품 어디서 샀더라?”* → 상품마다 구매처·재구매 링크를 붙이고, 바코드만 찍으면 다시 주문할 수 있게.
- 매장 장비: **빅솔론 키오스크/매장솔루션(ASP)** — 상품 등록은 빅솔론 대량작업 엑셀, **히엘페이** 카드 결제, **Xprinter XP-T4501B** 바코드 라벨 프린터(USB 전용), 노트북 1대.
- 화면 문구는 **한국어 해요체**, 귀엽고 짧게. 마스코트 **‘포포’**는 이 앱용으로 새로 그린 캐릭터(`src/components/Mascot.tsx`). **치이카와 등 저작권 캐릭터 이미지는 절대 쓰지 않아요.**

## 2. 기술 스택 · 명령어

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 6 · Tailwind CSS 4 · Supabase (Auth, Postgres RLS, Storage) · TanStack Query · ZXing · JsBarcode · ExcelJS · OpenAI(서버 전용)

```bash
npm install
npm run dev          # 환경변수 없으면 '체험 모드'(IndexedDB, 이 기기만)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint (Next 16엔 next lint 없음)
npm run build
```

커밋 전에 `typecheck`, `lint`, `build`를 꼭 통과시키세요.

## 3. 코드 지도

```
src/app/(app)/        로그인 후 화면: 홈, products, scan, reorder, suppliers, excel, labels,
                      print-station, sales(+receipts, settle=A/B 정산), orders, report, members, guide, history, more, kakao-bot(챗봇 연결)
src/app/login, setup  로그인(자동 로그인) / 처음 설정(SQL 안내, 관리자 계정)
src/app/api/          setup/admin, setup/schema(DB에 schema.sql 바로 적용), members, pos/status, pos/sync, pos/live(빅솔론 하루치 바로 보기, 저장 없음), pos/receipts(영수증별, 저장 없음), pos/settle(기간 상품별+분류명, 정산의 A/B 쪽, 최대 31일 — 꽃다발 주문은 store.settleOrders), orders/chat(주문 비서), logen/{status,register,slips,check}(로젠택배 — 궁중수라간 서버 logenRelay 경유), kakao/{status,connect,callback,test}, kakao/skill(카카오 챗봇 스킬 서버), kakao/bot(챗봇 연결 코드·연결 관리), cron/orders(매일 알림), ai/{product,link,promo,report}
src/components/       ui.tsx(공용 UI), OrderChat(주문 비서 — 주문 화면·홈 떠 있는 버튼 공용), WhenPicker(날짜·시간 버튼), DayNav, ProductForm, BarcodeScanner, StockSheet, SupplierSheet,
                      SourcePrices(상품 화면 ‘거래처별 가격’ + 가격 기록 시트), labels.tsx(라벨 공용), BarcodeMaker(상품 없이 바코드만 만들기 — 라벨 화면), SendLabelSheet, AiFillSheet, PromoSheet, Mascot
src/lib/store/        데이터 계층 인터페이스(types.ts) + supabase-store.ts + demo-store.ts
src/lib/server/       서버 전용: admin.ts(서비스 키, 권한), schema.ts(pg로 schema.sql 적용), orders.ts(주문 비서·알림 글), kakao.ts(나에게 보내기), logen.ts(로젠 Open API — 주문등록·송장번호, 중계/직접·시험 모드), pos.ts, bixolon.ts, openai.ts, ai-*.ts, fetch-page.ts
                      kakao-bot/: bot.ts(챗봇 말 해석·대화 흐름·주문 — DB 없이 시험 가능), ai.ts(AI 해석기·주문 비서 연결), howto.ts(“발주 어떻게 해?” 사용법 답), kakao.ts(오픈빌더 응답·길이 제한·콜백), types.ts(BotDb·BotAi), supabase-db.ts
src/lib/              excel.ts(빅솔론 양식), tspl.ts / labelCanvas.ts / usbPrinter.ts(라벨 직접 인쇄),
                      format.ts, queries.ts, report.ts, sources.ts(거래처별 가격 정렬·최저가 — 앱·챗봇 공용), josa.ts(을/를·이/가 조사),
                      orderParse.ts(주문 한 줄을 AI 없이 바로 읽기 — 주문 비서 앞단), settle.ts(정산 묶기 — A·B 분류명 + 💐 꽃다발 주문 settleOrders, 챗봇 기간·사람·날짜 읽기), priceList.ts(주문 가격표 — 챗봇·주문 비서·주문 화면, 가격 바뀌면 여기만), shipNotice.ts(손님께 보낼 송장 안내문 — 챗봇·주문 비서, 문구 바뀌면 여기만), carriers.ts(택배사 이름·송장번호 읽기·배송 조회 링크), paid.ts(입금 확인 — 챗봇·주문 비서의 입금 처리·묻기 말 읽기와 답)
public/schema.sql     Supabase 스키마 전체 (멱등 — 여러 번 실행해도 안전해야 함)
```

## 4. 꼭 지킬 규칙

- **비밀값 금지**: API 키·토큰·비밀번호를 코드, 커밋, 문서, 채팅에 넣지 않아요. 서버 키는 Vercel 환경변수에만.
  `NEXT_PUBLIC_`이 붙은 값은 브라우저에 공개돼요 — 비밀은 절대 붙이지 마세요.
- **데이터 계층은 두 구현을 같이**: `DataStore`(src/lib/store/types.ts)에 메서드를 추가하면 `supabase-store.ts`와 `demo-store.ts` 둘 다 구현해요.
- **스키마 변경은 `public/schema.sql`에서 멱등하게** (`create ... if not exists`, `drop policy if exists` 후 `create policy`, `add column if not exists`).
  사용자는 `/setup`의 **‘앱에서 바로 실행’**(서버가 `POSTGRES_URL`로 이 파일만 실행) 또는 Supabase SQL 편집기로 적용해요. 마이그레이션 폴더는 없어요.
  스키마를 바꾸면 `app_status()`의 `'version'`과 `src/app/setup/page.tsx`의 `SCHEMA_VERSION`을 **같이 올려요** → 설정 화면이 ‘DB 업데이트 필요’를 알려줘요.
- **권한(RLS)**: 역할은 `admin` / `staff` / `pending`. 첫 계정 = 관리자, 이후 직접 가입은 `pending`(아무것도 못 봄).
  삭제는 관리자만. `pos_sales`는 서버(서비스 키)만 쓰고, `apply_pos_sales()`는 `service_role`만 실행.
- **재고는 이동 기록으로만 바꿔요**: `adjust_stock()` RPC(앱) / `apply_pos_sales()`(빅솔론 매출). `stock_qty`를 직접 덮어쓰지 않기.
- **UI 문구**: 해요체, 짧게, 오류는 무엇을 하면 되는지까지. 숫자는 `won()`/`num()` 사용.
- Tailwind v4 주의: 기본 요소 스타일은 `@layer base` 안에(밖에 두면 유틸리티를 이겨버려요). `@apply`로 쓸 클래스는 `@utility`로.
- TypeScript 6은 `@types/*`를 자동 포함하지 않아요 → 필요한 파일에 `/// <reference types="..."/>`.

## 5. 배포 · 환경 (2026-11-10 기준)

- GitHub `djmonnar/inhye`, 브랜치 **`ccr-3f5271b3-xj7bqa`** (유일한 브랜치 = 기본/프로덕션). 푸시하면 Vercel이 자동 배포.
- Vercel 프로젝트 `inhye` → **https://inhye.vercel.app**
- **Supabase (2026-11-10 새 프로젝트로 옮김)**: supabase.com에서 직접 만든 프로젝트 `popohouse`(ref `ifuuiubraqbxwliyzowq`, 서울, 사용자 개인 조직 Free). Vercel 환경변수는 **직접 입력**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`(Secret), `POSTGRES_URL_NON_POOLING`(Session pooler, `[YOUR-PASSWORD]` 그대로), `SUPABASE_DB_PASSWORD`(Secret, 새 DB 비밀번호).
  - 예전 Vercel 연동 프로젝트 `supabase-erin-mountain`(ref `umbhdjklakksjthzyiqz`, Vercel Marketplace 조직)은 `postgres` 로그인이 PAM 28000으로 막혀 **일시정지**·연결 해제. 지우지 말 것(90일 보관). 상품은 엑셀 전체 백업으로 옮김, 사진은 없었음.
  - 같은 개인 조직의 `djmonnar's Project`는 **다른 앱(센터노트) 전용** — 포포하우스 표를 넣지 않기(로그인·`on_auth_user_created`·`is_admin` 이름이 겹쳐요).
- `BIXOLON_API_KEY`(Secret, Production) 2026-11-10 저장.
- 스키마는 `/setup` ‘앱에서 바로 실행’ 또는 새 프로젝트 SQL 편집기로 적용(둘 다 동작해야 함).
- 환경변수 전체 목록·설명: [`docs/wiki/setup-deploy.md`](docs/wiki/setup-deploy.md), `.env.example`

## 6. 연동 현황 요약

| 대상 | 상태 | 자세히 |
| --- | --- | --- |
| 빅솔론 대량작업 엑셀 (상품 등록) | ✅ 양식 그대로 내보내기/가져오기 | [bixolon.md](docs/wiki/bixolon.md) |
| 빅솔론 매출 API | ✅ 공식 외부 매출 API(`/api/external/v2/...`, `Authorization: {매장키}`) — 키만 Vercel에 넣으면 동작 | [bixolon.md](docs/wiki/bixolon.md) |
| 히엘페이 (결제) | ❌ 공개 API 없음, 승인내역엔 상품 정보 없음 | [hielpay.md](docs/wiki/hielpay.md) |
| Xprinter 라벨 | ✅ PC 드라이버 인쇄 · 안드로이드 USB 직접(TSPL) · 노트북 인쇄 스테이션 | [printing.md](docs/wiki/printing.md) |
| OpenAI | ✅ 사진→상품정보, 링크→상품정보, 홍보글, 가게 리포트, 주문 비서 (`OPENAI_API_KEY`) | [features.md](docs/wiki/features.md) |
| 카카오톡 ‘나에게 보내기’ | ✅ 연결·테스트 발송 확인(2026-11-10). 보내는 시간은 주문 화면에서 선택(스키마 v4 `app_settings`) | [orders-kakao.md](docs/wiki/orders-kakao.md) |
| 로젠택배 API | 🟡 미리 만들어 둠(2026-11-16): 계약 코드·키 대기. 궁중수라간 Firebase 고정 IP(34.50.34.252)의 별도 함수 `logenRelay`를 거쳐요 — `djmonnar/gjsuragan` 브랜치 `logen-relay-popohouse`에 올림(2026-11-16, 유닛 627·lint·smoke 통과). 머지·Secret·배포는 사용자 | [logen.md](docs/wiki/logen.md) |
| 카카오 챗봇 (오픈빌더 스킬) | ✅ 카톡에서 주문 등록 동작 확인(2026-11-13) + **AI 해석·주문 비서**(정해진 모양 주문은 AI 없이 바로 `orderParse.ts`, AI가 5초 넘으면 ‘결과 보기’). **폴백 블록 콜백 켬(2026-11-14)** → 콜백 블록은 매번 `useCallback:true`가 먼저여야 해서 route가 대기 문구 없이 `{useCallback:true}` 후 콜백으로 답 |  [suppliers-kakao-bot.md](docs/wiki/suppliers-kakao-bot.md) |

## 7. 다음에 할 일 (열린 문제)

1. ✅ 2026-11-10 새 Supabase 프로젝트에 스키마 v3 적용·관리자 생성·엑셀 백업 복원(사용자). 남은 것: `/sales` 첫 가져오기(재고 센 날 선택), 카카오톡 연결 확인.
2. 빅솔론 API는 **문서로 받은 외부 API만** 써요(관리자 화면용 `/api/v2/...`는 쓰지 않기). 과도한 호출은 WAF 차단 → 자동 가져오기를 만들면 10분 이상 간격으로.
3. (선택) 건별 매출 `GET /api/external/v2/sales`로 영수증 단위·즉시 반영·취소/반품 상태 받기 — 실제 응답의 `salesGoods` 필드 이름을 확인한 뒤에.
4. `src/lib/report.ts`는 아직 판매를 출고 기록으로 계산해요 → `pos_sales`가 들어오면 그걸 쓰도록.
5. ✅ 카카오톡 연결·테스트 발송 확인. 스키마 v5(알림 시간 설정 + 주문 픽업 시간) 적용은 `/setup` ‘앱에서 바로 실행’으로.
6. **거래처별 가격 + 카카오 챗봇 (스키마 v6, 2026-11-13)**: `/setup`에서 v6 적용 → Vercel `KAKAO_SKILL_SECRET` → 오픈빌더 설정([suppliers-kakao-bot.md](docs/wiki/suppliers-kakao-bot.md) ‘처음 설정’). 다음 후보: 발주 화면에도 ‘더 싼 거래처’ 표시, 엑셀 백업에 거래처별 가격 포함.
7. **택배 출고일 (스키마 v7, 2026-11-14)**: `orders.ship_date` — `/setup`에서 v7 적용(‘앱에서 바로 실행’). D-day·알림 기준은 `actDay()`(택배는 출고일, 없으면 받는 날).
8. **빅솔론이 상품 원본 (2026-11-14)**: 상품 등록은 빅솔론에서만. 앱은 판매에 나온 새 상품을 자동 등록(`registerUnknownGoods`, 태그 `빅솔론 자동 등록`, 바코드 없음 → 스캔 화면 ‘이미 있는 상품에 붙이기’). 빅솔론에 상품 목록·등록 외부 API 문의 중 — 관리자 화면 API는 쓰지 않기.
9. **(열림) 택배 ‘받는 날 미정’ 표시 (2026-11-14 발견)**: 출고일만 적힌 택배 주문은 `due_date`(받는 날)에도 출고일이 그대로 들어가요 — `src/lib/orderParse.ts`(`else if (ship) due = ship`)와 `src/lib/server/orders.ts` AI 지시(“출고일만 있으면 due_date도 같게”). 확인한 도착일처럼 보일 수 있음. 운영에 배포돼 있음(커밋 18d1786부터). 고칠 때: 받는 날을 모른다는 표시(예: `orders.due_unknown boolean`, 다음 스키마 버전)를 두고 목록·챗봇·알림에서 ‘받는 날 미정’으로, AI 지시와 빠른 읽기도 그 표시를 쓰게. 출고 알림·D-day는 이미 출고일(`actDay`) 기준이라 그대로.
10. **(문의 중) 히엘페이 결제 연동 모듈 (2026-11-15)**: 빅솔론 없이 앱이 키오스크 판매 화면을 맡을 수 있는지 — 히엘페이가 외부 프로그램용 결제 연동(SDK/에이전트)을 주는지가 관건. 문의 문구는 앱 ‘연동 안내’ 화면, 자세히는 [hielpay.md](docs/wiki/hielpay.md).
12. **택배사·송장번호 + 로젠 API (스키마 v8, 2026-11-16)**: `/setup`에서 v8 적용. 로젠은 궁중수라간 저장소의 `functions/logenRelay.js`(별도 함수, `api`와 무관)를 거쳐요 — 배포는 Deploy Functions → `functions:logenRelay`만(전체·`api` 배포 금지), Secret Manager `LOGEN_RELAY_TOKEN` 먼저. 로젠에 IP 34.50.34.252 등록 요청. 처음 설정·환경변수: [logen.md](docs/wiki/logen.md).
13. **입금 확인 (스키마 v9, 2026-11-16)**: `orders.paid`(null = v9 전 주문)·`paid_at` — `/setup`에서 v9 적용. 주문 고치기 💰 체크, 챗봇 “김포포 입금 완료”·“김포포 입금했어?”·“입금 안 한 사람”. 입금 ≠ 주문 완료. 자세히 [orders-kakao.md](docs/wiki/orders-kakao.md).
14. **상품 없이 바코드만 만들기 (스키마 v10, 2026-11-17)**: `barcode_issues` — `/setup`에서 v10 적용. 매장용 바코드(200…)를 새로 만들 땐 **꼭 `nextStoreBarcode(products, issued)`에 만든 번호(`listBarcodeIssues`)도 넘기기**(안 그러면 번호가 겹쳐요). 만든 번호는 지우지 않기. 자세히 [printing.md](docs/wiki/printing.md).
11. **(준비 중) 로젠택배 · 네이버 스마트스토어 (2026-11-16)**: 사용자가 로젠 계약 코드 발급을 기다리는 중. 송장은 스마트스토어 굿스플로(윈도우 노트북)로 시작. 앱 연동(커머스API 주문 가져오기·발송처리)은 사용자가 원할 때 — 호출 IP 등록 요건부터 확인. 정산 귀속(A·B·따로)과 재고 겹침은 사용자 결정 필요.

결정·발견 기록은 [`docs/wiki/decisions.md`](docs/wiki/decisions.md)에 날짜순으로 있어요.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
