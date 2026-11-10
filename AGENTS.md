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
                      print-station, sales(+receipts), orders, report, members, guide, history, more
src/app/login, setup  로그인(자동 로그인) / 처음 설정(SQL 안내, 관리자 계정)
src/app/api/          setup/admin, setup/schema(DB에 schema.sql 바로 적용), members, pos/status, pos/sync, pos/live(빅솔론 하루치 바로 보기, 저장 없음), pos/receipts(영수증별, 저장 없음), orders/chat(주문 비서), kakao/{status,connect,callback,test}, cron/orders(매일 알림), ai/{product,link,promo,report}
src/components/       ui.tsx(공용 UI), ProductForm, BarcodeScanner, StockSheet, SupplierSheet,
                      labels.tsx(라벨 공용), SendLabelSheet, AiFillSheet, PromoSheet, Mascot
src/lib/store/        데이터 계층 인터페이스(types.ts) + supabase-store.ts + demo-store.ts
src/lib/server/       서버 전용: admin.ts(서비스 키, 권한), schema.ts(pg로 schema.sql 적용), orders.ts(주문 비서·알림 글), kakao.ts(나에게 보내기), pos.ts, bixolon.ts, openai.ts, ai-*.ts, fetch-page.ts
src/lib/              excel.ts(빅솔론 양식), tspl.ts / labelCanvas.ts / usbPrinter.ts(라벨 직접 인쇄),
                      format.ts, queries.ts, report.ts
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
- **Supabase 연결됨**: Vercel의 Supabase 연동이 10-28에 환경변수를 넣어 둠(`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `POSTGRES_*` 등). `next.config.ts`·`admin.ts`가 이 이름을 자동 인식 → 사이트는 Supabase 모드(2026-11-10 로그인 화면으로 확인).
- `BIXOLON_API_KEY`(Secret, Production) 2026-11-10 저장.
- Supabase 대시보드 SQL 편집기는 `PAM authentication failed`로 막혀 있음(Supabase 쪽) → 스키마는 `/setup` ‘앱에서 바로 실행’으로 적용. DB 비밀번호를 재설정해서 `SUPABASE_DB_PASSWORD`(새 비밀번호)를 Vercel에 넣어야 해요.
- 환경변수 전체 목록·설명: [`docs/wiki/setup-deploy.md`](docs/wiki/setup-deploy.md), `.env.example`

## 6. 연동 현황 요약

| 대상 | 상태 | 자세히 |
| --- | --- | --- |
| 빅솔론 대량작업 엑셀 (상품 등록) | ✅ 양식 그대로 내보내기/가져오기 | [bixolon.md](docs/wiki/bixolon.md) |
| 빅솔론 매출 API | ✅ 공식 외부 매출 API(`/api/external/v2/...`, `Authorization: {매장키}`) — 키만 Vercel에 넣으면 동작 | [bixolon.md](docs/wiki/bixolon.md) |
| 히엘페이 (결제) | ❌ 공개 API 없음, 승인내역엔 상품 정보 없음 | [hielpay.md](docs/wiki/hielpay.md) |
| Xprinter 라벨 | ✅ PC 드라이버 인쇄 · 안드로이드 USB 직접(TSPL) · 노트북 인쇄 스테이션 | [printing.md](docs/wiki/printing.md) |
| OpenAI | ✅ 사진→상품정보, 링크→상품정보, 홍보글, 가게 리포트, 주문 비서 (`OPENAI_API_KEY`) | [features.md](docs/wiki/features.md) |
| 카카오톡 ‘나에게 보내기’ | 🟡 코드 완성 — 카카오 앱 키·`CRON_SECRET` 넣고 연결, 표(v3)는 Supabase 복구 후 | [orders-kakao.md](docs/wiki/orders-kakao.md) |

## 7. 다음에 할 일 (열린 문제)

1. 사용자: 키 저장 후 배포 → `/setup`에서 **최신 SQL 실행**(POS 표 포함, 예전에 돌렸어도 다시)·관리자 생성(처음이면) → `/sales`에서 ‘지금 가져오기’로 첫 연결 확인.
2. 빅솔론 API는 **문서로 받은 외부 API만** 써요(관리자 화면용 `/api/v2/...`는 쓰지 않기). 과도한 호출은 WAF 차단 → 자동 가져오기를 만들면 10분 이상 간격으로.
3. (선택) 건별 매출 `GET /api/external/v2/sales`로 영수증 단위·즉시 반영·취소/반품 상태 받기 — 실제 응답의 `salesGoods` 필드 이름을 확인한 뒤에.
4. `src/lib/report.ts`는 아직 판매를 출고 기록으로 계산해요 → `pos_sales`가 들어오면 그걸 쓰도록.
5. 주문·카카오: 사용자가 카카오 디벨로퍼스 앱을 만들고 `KAKAO_REST_API_KEY`·`CRON_SECRET`을 Vercel에 넣기 → Supabase 복구 후 스키마 v3 적용 → 주문 화면에서 카카오톡 연결.

결정·발견 기록은 [`docs/wiki/decisions.md`](docs/wiki/decisions.md)에 날짜순으로 있어요.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
