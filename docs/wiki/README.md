# 포포하우스 위키

포포하우스(무인 소품샵) 관리 앱을 만들면서 알아낸 것·정한 것을 모아둔 곳이에요.
사람도, 코딩 에이전트(Codex·Claude)도 이 위키를 기준으로 일해요. 새로 알게 된 건 여기 적어 주세요.

| 페이지 | 내용 |
| --- | --- |
| [features.md](features.md) | 앱 기능 전체 목록과 화면별 설명 |
| [bixolon.md](bixolon.md) | 빅솔론 키오스크·매장솔루션(ASP): 대량작업 엑셀 양식, 매출 API 조사 결과, 연동 상태 |
| [hielpay.md](hielpay.md) | 히엘페이(카드 결제) 조사 결과 |
| [printing.md](printing.md) | Xprinter 라벨 프린터, TSPL 직접 인쇄, 노트북 인쇄 스테이션, 바코드 |
| [orders-kakao.md](orders-kakao.md) | 예약 주문 · 주문 비서(채팅) · 카카오톡 ‘나에게 보내기’ 알림 · 카카오 디벨로퍼스 설정 |
| [suppliers-kakao-bot.md](suppliers-kakao-bot.md) | 거래처별 가격(같은 상품도 거래처마다 값이 달라요) · 카카오 챗봇(오픈빌더 스킬) 설정·권한·명령어 |
| [setup-deploy.md](setup-deploy.md) | Supabase · Vercel 설정, 환경변수, 계정/권한, 현재 설정 상태 |
| [decisions.md](decisions.md) | 날짜순 결정·발견 기록 |

## 한눈에 보는 현재 상태 (2026-11-10)

- 앱: **https://inhye.vercel.app** (Vercel 프로젝트 `inhye`, 브랜치 `ccr-3f5271b3-xj7bqa`에 푸시하면 자동 배포)
- 데이터: Supabase **연결됨** (Vercel Supabase 연동이 넣은 환경변수를 앱이 자동 인식)
- 빅솔론 상품 등록: 엑셀로 연동 ✅ / 빅솔론 매출 자동 수집: 빅솔론 공식 **외부 매출 API**로 연결 ✅ (Vercel에 `BIXOLON_API_KEY`만 넣으면 돼요)
- 라벨 인쇄: Xprinter(USB) — PC 드라이버, 안드로이드 USB 직접, 폰→노트북 인쇄 스테이션 ✅
