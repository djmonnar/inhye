# 빅솔론 (키오스크 · 매장솔루션 ASP)

포포하우스는 빅솔론 키오스크를 쓰고, 상품·매출은 빅솔론 매장솔루션 관리자 사이트(ASP)에서 관리해요.

- 관리자 사이트: `https://www.bixolon-pos.com` (매장 계정으로 로그인)
- 관리자 사이트가 부르는 API: `https://api.bixolon-pos.com`
- 공식 매뉴얼(노션): https://asp-manual.notion.site/ — 메뉴별 설명. **외부 연결 관리·API 설명은 없음.** 모든 목록 화면에 ‘엑셀 다운로드’가 있다고 안내.
- 매장솔루션 지원센터: **1877-1125** (평일 09–22시, 주말 09–21시)
- 서면 문의 창구 (2026-11-09 조사, 개발 담당 전화는 연결이 잘 안 됨):
  - 지원센터(1877-1125)에 개발 담당 메일 주소를 묻거나 문의 전달을 요청하기
  - 빅솔론 홈페이지 제품 상담 양식: https://kr.bixolon.com/contact.php (본사 대표 031-218-5500)
  - 구글플레이 ‘빅솔론 매장관리자-II’ 앱 페이지의 개발자 연락처 이메일 (같은 ASP 서버를 쓰는 앱 — 매장솔루션 전용 창구인지는 미확인)
  - → 2026-11-10 메일로 개발 담당 답변과 API 문서를 받았어요 (아래 3-1).
- 포포하우스 매장 식별값 (비밀 아님): `shop-id` **434**, `brand-id` 124, `hq-id` 111, `agency-id` 67 — 관리자 화면용 값이고, 외부 API는 매장키만 있으면 돼요.

## 1. 상품 대량작업 엑셀 (✅ 연동 중)

사용자가 준 양식 기준. 앱의 **엑셀 화면**이 이 양식과 칸·색·서식까지 똑같이 내보내고(`src/lib/excel.ts`의 `KIOSK_COLUMNS`), 가져오기도 해요.

| 열 | 머리글 | 필수 | 앱 항목 |
| --- | --- | --- | --- |
| A | `상품 코드\n(상품 수정시에만 입력)` | | `kiosk_code` (예: S000005) |
| B | 상품명 | ✔ | name |
| C | 상품 분류명 | ✔ | category |
| D | 판매가 | ✔ | sale_price |
| E | 사용(Y/N) | ✔ | is_active |
| F | 재고 사용(Y/N) | | kiosk_track_stock |
| G | 재고 수량 | | stock_qty (재고 사용 N이면 0) |
| H | 바코드 | | barcode |
| I | 상품단가 | | 원가/판매가/비우기 중 선택 — **의미 미확인** |
| J–L | 상품명(영어/중국어/일본어) | | name_en / name_zh / name_ja |
| M–P | 상품 설명, 상품 설명(영어/중국어/일본어) | | description* |

- 필수 머리글 배경 노랑 `FFFFFF00`, 선택 주황 `FFFFC000`. 모든 셀 텍스트 서식(`@`), 맑은 고딕 9pt, 가운데, 얇은 테두리. 빈칸은 진짜 빈 셀.
- 원본 파일은 확장자가 `.xls`지만 내용은 xlsx. 앱은 `.xlsx`로 저장해요.
- 이미 빅솔론에 있는 상품은 **상품 코드**가 있어야 새로 생기지 않고 수정돼요. 빅솔론 상품 목록 엑셀을 앱에서 ‘가져오기’ 하면 코드가 채워져요.
- 앱에서 바꾼 상품은 ‘빅솔론 반영 필요’ 표시(`kiosk_changed_at > kiosk_synced_at`). 재고 수량만 바뀐 건 표시 안 함(DB 트리거 `touch_product`).

## 2. ASP ‘외부 연결 관리’ 메뉴 (공지사항/기타 아래)

- **외부 연결 정보 등록**: 업체 드롭다운에 **‘생협’만** 있고 API 키(8자 이상, 영문·숫자·특수문자)를 입력 → 빅솔론과 계약한 연동 업체 전용으로 보임. 우리 앱은 목록에 없음.
- **연동 키 발급**: “새로운 연동 키가 생성되었습니다” 창에 **매장 ID(434)** 와 **생성된 API 키**가 나옴(창을 닫으면 다시 못 봄).
  - 이 키는 채팅에 일부 노출된 적이 있어 **재발급 권장**. 값은 Vercel `BIXOLON_API_KEY`에만 저장.

## 3. 매출 API 조사 (HAR, 2026-11-08) — 관리자 화면용, 연동에는 쓰지 않기

사용자가 관리자 화면에서 HAR을 떠서 줬어요(쿠키·인증 값은 브라우저가 지운 상태).

| 화면 | 요청 |
| --- | --- |
| 상품별 매출 분석 | `GET /api/v2/sales/analysis/goods?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` |
| 결제수단별 매출 분석 | `GET /api/v2/sales/summary/payment?startDate&endDate` |
| 카드사별 매출 분석 | `GET /api/v2/sales/summary/payment/card?startDate&endDate&cardType=ACQUIRER` |

- 요청 헤더: `shop-id`, `brand-id`, `hq-id`, `agency-id`, `authorization` (CORS 허용 헤더도 정확히 이 5개).
- 관리자 화면의 `authorization`은 **로그인 세션 토큰**으로 보임(HAR에서 값 삭제됨).
- `sales/analysis/goods` 응답: 배열, 상품별 합계
  `shopName, categoryId, categoryName, goodsId, goodsCode, goodsName, sellingPrice, unitCost, salesQty, salesAmount, paymentAmount, goodsAmount, optionAmount, discountAmount`
  — `goodsCode`가 대량작업 엑셀의 ‘상품 코드’(S000171 등)와 같아요.
- `sales/summary/payment` 응답: `shopId, shopName, paymentType, paymentAmount, paymentCount, returnAmount, returnCount`
- `sales/summary/payment/card` 응답: `shopName, code, name, paymentAmount, paymentCount, returnAmount, returnCount`

### 연동 키로 관리자 API 호출 → 401 (2026-11-08)

`GET /api/v2/sales/analysis/goods` + `shop-id: 434` + `Authorization: Bearer <연동 키>` → `401 UNAUTHORIZED`.
→ 관리자 화면용 API는 연동 키로 쓸 수 없는 게 맞았어요(아래 공식 답변).

## 3-1. ✅ 공식 외부 매출 API (2026-11-10, 빅솔론 개발 담당 메일 답변)

빅솔론 개발 담당이 메일로 답하면서 **‘외부 매출 API 연동 안내’ PDF**(2쪽)를 보내 줬어요.

**답변 요약**
- 관리자 화면(ASP)이 쓰는 API(`/api/v2/...`)는 쓰면 안 되고, **문서로 준 API만** 쓸 수 있어요.
- 상품별 판매 수량을 상품 코드와 함께 받을 수 있고, 영수증별(건별) 조회도 돼요.
- 건별 조회는 **즉시**, 합계 조회는 **최대 10분 뒤**부터 반영돼요.
- 키 유효기간·비용은 없어요. 다만 **너무 자주 부르면 WAF(방화벽)에 막힐 수 있어요.**
- 매출 엑셀을 메일로 보내주는 기능은 없어요.

**공통**
- 기본 주소 `https://api.bixolon-pos.com`
- 인증: `Authorization: {매장키}` — 키를 **그대로**(Bearer 없이). 매장은 키로 구분해서 `shop-id` 같은 헤더는 필요 없어요.
- 필수 파라미터 `startDate`, `endDate` (YYYY-MM-DD, 시작일 ≤ 종료일). 응답은 HTTP 200 + JSON 배열, 없으면 `[]`.

| API | 내용 |
| --- | --- |
| `GET /api/external/v2/sales` | **매출 상세(건별)**. 영업일 기준, 기간 최대 31일. 항목: `id`, `billNo`(영수증 번호), `deviceName`, `deviceType`, `status`(`PAID`/`VOID`/`RETURNED`), `salesAmount`, `paymentAmount`, `discountAmount`, `orderedAt`, `paidAt`, `cancelledAt`, `returnedAt`, `salesGoods`(상품명·판매수량·금액·옵션금액 등 배열), `salesPayments`(결제수단·결제금액·승인번호 등 배열). `salesGoods`의 정확한 필드 이름은 문서에 없어서 실제 응답으로 확인 필요. |
| `GET /api/external/v2/sales/analysis/goods` | **상품별 매출 분석(합계)**. 선택 파라미터 `categoryId`(정수), `goodsName`(부분 일치). 응답 필드: `shopName, categoryId, categoryName, goodsId, goodsCode, goodsName, sellingPrice, unitCost, salesQty, salesAmount, paymentAmount, goodsAmount, optionAmount, discountAmount` (관리자 화면 API와 같은 모양). |

### 영수증별(건별) 매출 사용 (2026-11-10)

- `GET /api/pos/receipts?day=` → `fetchBixolonReceipts()`가 `/api/external/v2/sales`를 하루 단위로 불러 `normalizeReceipt()`로 정리.
- 문서에 `salesGoods`·`salesPayments` 안쪽 칸 이름이 없어서 후보 이름을 차례로 찾아요(상품: `goodsCode/goodsName/salesQty/...`, 결제: `paymentType/paymentMethod/...`, 금액: `paymentAmount/amount/...`). 결제 종류 코드(CARD, KAKAO_PAY 등)는 한국어로 바꿔요.
- 시간대 표시 없는 시각(`2026-11-10 14:02:33`)은 한국 시각으로 봐요.
- 카드 번호·승인 번호 등은 화면에 필요 없어서 넘기지 않아요.
- **실제 칸 이름 확인 필요**: 영수증 화면 맨 아래 ‘빅솔론 칸 이름 보기(개발용, 관리자)’에 응답의 칸 이름(값 없이)이 나와요. 후보와 다르면 `normalizeReceipt()`의 후보 목록에 추가.

## 4. 앱의 매출 연동 구현 (`src/lib/server/bixolon.ts`, `pos.ts`, `public/schema.sql` 5-2)

- **하루씩** `sales/analysis/goods?startDate=D&endDate=D` 호출 → `pos_sales`에 (날짜, 상품) 한 행.
  `external_id = goods:YYYY-MM-DD:<goodsId>` (엑셀 가져오기를 만들면 API와 같은 키 형식으로 맞출 것), `sold_at = D 00:00 +09:00`.
- 같은 날 수량이 늘면 행을 갱신하고, `apply_pos_sales()`가 `qty - applied_qty` **차이만** 재고에서 빼요. 줄면(반품) 다시 더해요. 멱등.
  PostgreSQL에서 검증: 20 → 17(3개) → 15(5개로 증가) → 16(반품 1).
- 상품 연결: `goodsCode` = 상품의 `kiosk_code`, 없으면 바코드. **이름 자동 연결**(`linkCodesByName`, 판매 바로 보기·가져오기 때): 앱에 없는 코드인데 이름이 똑같은(공백·대소문자 무시) 코드 없는 앱 상품이 딱 하나면 그 상품에 코드를 붙여요. 앱 쪽 같은 이름이 여럿이거나 빅솔론에 같은 이름이 여러 코드면 건너뜀. ‘빅솔론 반영 필요’ 표시는 붙기 전 상태 유지. 연결 안 된 상품은 매출 화면 ‘앱에 없는 상품’에 나오고 원터치 등록.
- 첫 가져오기는 관리자가 **시작 날짜를 골라요**(기본 오늘, 최대 30일 전 = 재고를 센 날). 이후엔 마지막 성공일 전날부터 오늘까지(최대 31일). 하루씩 300ms 간격으로 불러 WAF를 피해요. `POST /api/pos/sync {from}`.
- 호출: `GET /api/external/v2/sales/analysis/goods`, 헤더 `Authorization: {매장키}`만. 401이면 키 확인, 403/429면 WAF로 보고 잠시 뒤 다시.
- 키는 서버 환경변수에만: `BIXOLON_API_KEY`, (선택) `BIXOLON_API_BASE`. 매장 ID·brand/hq/agency 값은 이제 필요 없어요.
- 자동 가져오기(크론)를 만든다면 **10분 이상 간격**으로 (합계는 10분 지연 + WAF).
- ~~대안: 하루치 엑셀 가져오기~~ → 공식 API가 생겨서 필요 없어짐. 참고용 — 엑셀 열: 상품 코드, 상품명, 판매가, 원가, 판매 수량, 상품 금액, 옵션 금액, 할인 금액, 매출 금액, 결제 금액, 이익률(매뉴얼 기준). 실제 샘플 파일을 받은 뒤 구현.

## 5. 기타

- 빅솔론 Web Print SDK(브라우저→빅솔론 프린터)는 있지만, 매장 라벨 프린터는 Xprinter라서 해당 없음 → [printing.md](printing.md)
- 빅솔론 매장관리자-II 앱(안드로이드)도 있음 — API 단서는 아직 없음.

## A/B 정산 (2026-11-14)

- 사장님 매장의 빅솔론 **상품 분류명은 앞글자로 두 묶음**: `A 포포하우스`, `A 실크플라워`, `A 실크플라워 상품`, `A 화병`, `A 화병세트`, `A 꽃다발`, `A 인형` / `B 인형`, `B 소품`, `B 피규어`, `B 피규어S`, `B TY 베어`, `B 가챠`, `B EVENT` (상품정보 엑셀 확인).
- 화면 `/sales/settle`(매출 화면 오른쪽 위 ‘A/B 정산’, 더보기 메뉴): 이번 달 / 지난달 / 직접(최대 31일) → 묶음별 금액·수량·비율 → 분류별 → 상품별. **카톡용 복사**, **엑셀로 받기**(요약 + A·B·기타 시트).
- 데이터: `GET /api/pos/settle?start&end`(직원 이상) → 빅솔론 `sales/analysis/goods?startDate&endDate` **한 번**(기간 합계, `categoryName` 포함, 저장 없음, 같은 기간 1분 캐시). 금액 = `paymentAmount`(없으면 `salesAmount`), 반품은 빠진 금액으로.
- 묶기(`src/lib/settle.ts` `groupOf`): 분류명이 **영문 한 글자 + (공백·한글·끝)**으로 시작하면 그 글자(대문자) — `B피규어`도 B, `BTS 굿즈`는 기타. A·B로 시작하지 않으면 **기타**(화면에 “빅솔론에서 분류명을 고치면 들어가요”).
- 앱 상품의 카테고리가 아니라 **빅솔론 분류명**을 써요(키오스크에서 실제 판매된 기준). 기간 제한 31일은 건별 API 제한에 맞춘 안전값 — 합계 API의 실제 한도는 문서에 없음.
