# 포포하우스 위키

포포하우스(무인 소품샵) 관리 앱을 만들면서 알아낸 것·정한 것을 모아둔 곳이에요.
사람도, 코딩 에이전트(Codex·Claude)도 이 위키를 기준으로 일해요. 새로 알게 된 건 여기 적어 주세요.

| 페이지 | 내용 |
| --- | --- |
| [features.md](features.md) | 앱 기능 전체 목록과 화면별 설명 |
| [bixolon.md](bixolon.md) | 빅솔론 키오스크·매장솔루션(ASP): 대량작업 엑셀 양식, 매출 API 조사 결과, 연동 상태 |
| [hielpay.md](hielpay.md) | 히엘페이(카드 결제) 조사 결과 |
| [printing.md](printing.md) | Xprinter 라벨 프린터, TSPL 직접 인쇄, 노트북 인쇄 스테이션, 바코드 |
| [setup-deploy.md](setup-deploy.md) | Supabase · Vercel 설정, 환경변수, 계정/권한, 현재 설정 상태 |
| [decisions.md](decisions.md) | 날짜순 결정·발견 기록 |

## 한눈에 보는 현재 상태 (2026-11-08)

- 앱: **https://inhye.vercel.app** (Vercel 프로젝트 `inhye`, 브랜치 `ccr-3f5271b3-xj7bqa`에 푸시하면 자동 배포)
- 데이터: Supabase **연결 전** → 지금은 체험 모드(기기마다 따로 저장)
- 빅솔론 상품 등록: 엑셀로 연동 ✅ / 빅솔론 매출 자동 수집: 코드 준비 완료, **연동 키 인증 방식 확인 필요** 🟡
- 라벨 인쇄: Xprinter(USB) — PC 드라이버, 안드로이드 USB 직접, 폰→노트북 인쇄 스테이션 ✅
