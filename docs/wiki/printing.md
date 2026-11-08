# 라벨 인쇄 · 바코드

## 프린터: Xprinter XP-T4501B

- 뒷면 라벨: `MODEL NO.: XP-T4501B`, `INTERFACE: USB+Cutter`, DC 24V 2.5A → **USB 전용**(블루투스·와이파이·랜 없음).
- XP-T451B 계열: 4인치, 203dpi(1mm = 8점), 명령어 TSPL/EPL/ZPL/DPL.

## 인쇄 방법 3가지 (`/labels`, `/print-station`)

1. **이 기기(브라우저 인쇄)**: PC에 Xprinter 드라이버 → 인쇄 창에서 Xprinter, 용지 크기 선택, 배율 100%.
   라벨 크기별 `@page { size: Wmm Hmm }`, A4 21칸·40칸 시트도 지원. 인쇄 영역은 `<body>` 바로 아래 `#print-root` 포털.
2. **USB 직접 (WebUSB + TSPL)**: 안드로이드 크롬 + OTG 젠더, 맥 크롬. 드라이버 불필요, 한글 그대로.
   - 라벨을 203dpi 캔버스로 그림(`src/lib/labelCanvas.ts`) → 1비트 → `BITMAP` 명령(`src/lib/tspl.ts`) → `transferOut`(`src/lib/usbPrinter.ts`).
   - TSPL II 규격: BITMAP 데이터 **0 = 검은 점**, 1 = 빈 칸 (펌웨어가 반대면 ‘흑백 반전’ 설정).
   - 작업 형식: `SIZE w mm,h mm` / `GAP g mm,0 mm` / `DIRECTION d,0` / `REFERENCE 0,0` / `DENSITY n` / `CLS` / `BITMAP 0,0,행바이트,높이,0,<데이터>` / `PRINT 1,매수`.
   - 바코드는 정수 점 굵기(보통 2점 = 0.25mm) + 양옆 빈 공간(약 9모듈). zxing-cpp로 판독 검증함.
   - 기기별 설정(localStorage): 간격, 진하기, 좌우 위치, 위아래 뒤집기, 흑백 반전 + 테스트 라벨.
   - 윈도우는 드라이버가 USB를 잡고 있어 WebUSB가 보통 안 돼요 → 1번 방식. **아이폰은 모든 브라우저가 WebKit이라 WebUSB 불가.**
3. **폰 → 노트북 인쇄 스테이션 (아이폰도 OK)**: 노트북에 프린터를 꽂고 `/print-station`을 띄워 ‘자동 인쇄’.
   - 폰에서 상품 화면 ‘노트북으로 라벨 보내기’, 라벨 화면 ‘📡 노트북으로’, 새 상품 등록 시 ‘등록하면 라벨도 보내기’.
   - Supabase `print_jobs` 표 + `claim_print_jobs()`(대기→인쇄 중을 원자적으로, 2분 넘게 멈춘 건 재시도) → 두 스테이션이어도 중복 인쇄 없음.
   - 스테이션은 4초마다 확인, 화면 꺼짐 방지(Wake Lock), 완료음, 탭 제목에 대기 수. 인쇄 직전 대기는 rAF 말고 타이머(창이 가려져도 멈추지 않게).
   - 윈도우에서 인쇄 창 없이: Xprinter를 기본 프린터 + 용지 크기 설정, 크롬 바로가기 대상 끝에 `--kiosk-printing`.
   - 체험 모드에선 같은 기기 안에서만 보여요(Supabase 필요).

## 바코드

- 스캔: 폰 카메라(ZXing, EAN-13/8, UPC, CODE128/39, ITF, QR), USB·블루투스 스캐너(키보드 입력, 아무 화면에서 찍으면 그 상품으로 이동 — 입력 화면 제외).
- 같은 바코드가 화면에 계속 있으면 다시 세지 않음(1.2초 이상 사라졌다 다시 찍혀야 +1).
- 바코드 없는 소품: **매장용 EAN-13** `200` + 9자리 일련번호 + 체크디지트(제조사 바코드와 안 겹치는 매장 내부 대역).
