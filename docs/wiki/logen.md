# 로젠택배 API · 송장번호

(2026-11-16) 로젠택배 계약 준비 중 — 계약 코드·Open API 키를 받기 전에 미리 만들어 둔 연동이에요.
키를 받으면 Vercel 환경변수만 넣으면 돼요.

## 한눈에

```
포포하우스 앱(Vercel) ──토큰 + 우리 로젠 키──▶ 궁중수라간 서버 logenRelay (Firebase, 고정 IP 34.50.34.252) ──▶ 로젠 Open API
```

- **로젠은 ‘등록된 고정 IP + secretKey’로만 받아요.** Vercel은 나가는 IP가 고정이 아니라서, 같은 사장님의 궁중수라간 시스템이 이미 쓰는 고정 IP 통로(VPC 커넥터 + Cloud NAT)를 같이 써요.
- 궁중수라간 저장소(`djmonnar/gjsuragan`)에 **따로 떨어진 함수 `logenRelay`** 를 둬요(`functions/logenRelay.js`). 궁중수라간의 `api` 함수·환경변수·고객 데이터·로젠 키는 건드리지 않아요.
- 중계는 정해진 로젠 주소 4개(주문등록·송장번호 조회·화물추적·계약운임)만, 로젠 test/prod 기본 주소로만 보내요. **우리 로젠 키는 우리 Vercel에만** 있고, 중계는 헤더로 받아 전달만 해요(저장·기록 안 함).
- 궁중수라간이 로젠 통로를 꺼 두는 달(`scripts/logen-infra/off.sh`, 비용 절약)에는 포포하우스 로젠 접수도 안 돼요(401). 그땐 송장번호를 직접 넣으면 돼요.

## 앱에서 하는 일 (`src/lib/server/logen.ts`, `/api/logen/*`)

1. **로젠에 접수** — 주문 고치기(택배 주문) → ‘로젠에 접수’. 고친 내용을 먼저 저장하고 보내요. 주소·연락처가 없으면 버튼 대신 무엇이 필요한지 보여줘요.
   - 로젠 주문번호(`fixTakeNo`) = `PP` + 주문 id 앞 12자리 → 같은 주문은 늘 같은 번호(두 번 보내도 로젠이 겹친 걸 알아요).
   - 접수일(`takeDt`) = 출고일(오늘보다 뒤면) 아니면 오늘. 박스 1개, 운임 = `LOGEN_DLV_FARE`(계약 운임보다 낮으면 로젠이 반려), 운임 구분 `030`(신용).
   - 메모는 가게 안 메모라 기사님 메시지(`sndMsg`)로 보내지 않아요.
2. **송장 출력은 로젠 쪽**(iLOGEN / 대리점 프로그램 ‘주문등록출력(복수건)’ 화면)에서 해요. 출력해야 송장번호가 생겨요(그 전엔 비어 있는 게 정상).
3. **송장번호 가져오기** — 주문 목록 위 ‘로젠 송장번호 가져오기 (N건)’ 또는 주문 고치기 안 버튼. 받으면 주문에 `carrier=로젠`, `tracking_no` 저장. 취소된 송장(`delYn=Y`)은 건너뛰어요.
4. **연결 확인**(관리자, 주문 화면 아래 ‘로젠택배 연동’ 카드) — 계약 운임 조회만 해요(아무것도 안 바꿈).

오류 안내: 401 = 키가 틀렸거나 IP(34.50.34.252)가 우리 키에 등록 안 됐거나 궁중수라간 통로가 꺼짐 · 403 = 중계 토큰이 다름 · 404 = 중계 함수가 아직 배포 안 됨.

## 송장번호 (스키마 v8, 로젠 없이도)

- `orders.carrier`, `orders.tracking_no` (+ 로젠용 `logen_take_no`, `logen_status`(registered·slip_ready·failed), `logen_at`, `logen_msg`).
- 앱: 택배 주문 고치기 → 택배사 버튼(로젠·우체국·CJ대한통운·한진·롯데·경동) + 송장번호 칸, ‘송장 안내문 복사’, ‘배송 조회’(네이버 검색 링크 — 택배사 주소가 바뀌어도 그대로). 목록에 📮 송장번호.
- 챗봇·주문 비서: **“김포포 로젠 12345678901”**, “김포포 송장번호 123-4567-8901” → 그 이름의 택배 주문이 하나로 정해지면 바로 저장 + 송장 안내문까지(AI 없이). 택배사나 ‘송장’ 말이 꼭 있어야 해요(“김포포 010…”은 전화번호라). 여럿이면 AI가 어느 주문인지 물어요. 말로 고치기(“이토끼 꽃바구니 송장 한진 5555…”)는 AI가 `carrier`·`tracking_no`로.
- 송장 안내문(“송장안내문 김포포”)은 저장된 택배사·송장번호로 채워요.

## 처음 설정 (계약 코드·키를 받으면)

**1. 로젠에 Open API 신청할 때** — 호출 IP로 **34.50.34.252** 를 등록해 달라고 해요(궁중수라간과 같은 IP). 문의 문구(IP·키·코드·운임·송장 출력·집하·파손·스마트스토어 반품 8가지)는 앱 **더보기 → 연동 안내 → 📦 로젠택배**에 복사 버튼과 함께 있어요(`src/app/(app)/guide/page.tsx` `LOGEN_ASK`). 보낼 곳: 거래처 코드를 만드는 대리점 담당자 → 본사 Open API 담당.

**2. 궁중수라간 쪽 (한 번)**
- 저장소 `djmonnar/gjsuragan` 브랜치 **`logen-relay-popohouse`** 에 `logenRelay` 코드를 올려 뒀어요(2026-11-16, 사용자 허락). 그 저장소 검사(유닛 627개·lint·smoke) 통과. **기본 브랜치(main)에 머지**해야 배포할 수 있어요: https://github.com/djmonnar/gjsuragan/pull/new/logen-relay-popohouse
- GCP Secret Manager(프로젝트 `gjsuragan-60505`)에 비밀 **`LOGEN_RELAY_TOKEN`** 을 긴 무작위 값으로 만들어요.
- 로젠 통로가 켜져 있을 때 GitHub Actions → Deploy Functions → `functions:logenRelay` (이것만! `api`나 전체 배포 아님).
- 주소: `https://asia-northeast3-gjsuragan-60505.cloudfunctions.net/logenRelay`

**3. 포포하우스 Vercel 환경변수** (값은 채팅·커밋에 넣지 않기)

| 이름 | 비밀 | 설명 |
| --- | --- | --- |
| `LOGEN_SECRET_KEY` | **비밀** | 포포하우스 로젠 Open API 키 |
| `LOGEN_CUST_CD` | | 거래처코드(대리점이 만들어 준 코드) |
| `LOGEN_USER_ID` | | (선택) 연동업체코드 — 없으면 거래처코드 |
| `LOGEN_SENDER_ADDRESS` | | 보내는 곳 주소(가게) |
| `LOGEN_SENDER_PHONE` | | 보내는 곳 전화 |
| `LOGEN_SENDER_CELL_PHONE` | | (선택) 보내는 곳 휴대폰 |
| `LOGEN_SENDER_NAME` | | (선택) 기본 `포포하우스` |
| `LOGEN_DLV_FARE` | | 박스 1개 계약 운임(원) — 대리점 단가표 |
| `LOGEN_FARE_TY` | | (선택) 운임 구분, 기본 `030` 신용 |
| `LOGEN_BOX_TY_CD` | | (선택) 박스 크기 코드 |
| `LOGEN_ENV` | | `test`(기본) → 확인되면 `prod` |
| `LOGEN_RELAY_URL` | | 위 중계 주소 |
| `LOGEN_RELAY_TOKEN` | **비밀** | 궁중수라간 Secret Manager의 `LOGEN_RELAY_TOKEN`과 같은 값 |
| `LOGEN_DRY_RUN` | | (선택) `true`면 로젠에 안 보내고 가짜 결과 — 화면 시험용 |
| `LOGEN_DIRECT` | | (선택) 고정 IP가 생겨 중계 없이 부를 때만 `true` |

**4.** 앱 `/setup`에서 DB v8 적용 → 주문 화면 ‘로젠택배 연동’ 카드 → ‘연결 확인’ → 테스트 주문 하나 접수 → 로젠에서 출력 → ‘송장번호 가져오기’.

## 아직 안 한 것

- 화물추적(`inquiryCargoTrackingMulti`)으로 배송 완료 자동 표시 — 중계는 이미 허용, 앱 화면만 남음.
- 송장번호 자동 가져오기(크론). 빅솔론처럼 너무 자주 부르지 않기.
- 박스 여러 개·크기별 운임.
- 네이버 스마트스토어 주문 가져오기(커머스API) — [decisions.md](decisions.md) 2026-11-16.
