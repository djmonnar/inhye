"use client";

import { Copy } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/providers";
import { PageHeader } from "@/components/ui";
import { SHOP_NAME } from "@/lib/config";

const BIXOLON_ASK = `안녕하세요, 빅솔론 키오스크를 사용 중인 소품샵(${SHOP_NAME})입니다.
상품 관리를 별도 프로그램으로 하고 있어서 몇 가지 여쭤봅니다.

1. 등록된 상품 목록을 상품 코드 포함해서 엑셀로 내려받을 수 있나요?
2. 대량작업 양식의 ‘상품단가’ 칸은 원가인가요, 판매 단가인가요?

감사합니다.`;

const HIEL_ASK = `[문의] 키오스크 결제 연동 모듈(SDK) 제공 여부

안녕하세요. 히엘페이 키오스크로 카드 결제를 받고 있는 무인 소품샵 ‘${SHOP_NAME}’입니다.

지금은 빅솔론 매장솔루션에 상품을 등록해서 키오스크로 팔고 있는데, 상품·재고·구매처는 저희가 따로 만든 매장 관리 프로그램에서 관리하고 있어서 상품을 두 곳에 이중으로 등록하고 있어요. 그래서 저희 프로그램이 키오스크 판매 화면을 맡고, 카드 결제만 히엘페이로 하는 방법이 가능한지 여쭤봅니다.

1. 지금 쓰는 키오스크 기기에 빅솔론 대신 다른 키오스크 프로그램을 설치해서 쓸 수 있나요? (기기 운영체제가 윈도우인지 안드로이드인지도 알려 주세요)
2. 외부에서 만든 프로그램이 카드 결제를 요청할 수 있는 결제 연동 모듈(SDK·에이전트)과 개발 문서를 제공하시나요? 비용이 있다면 얼마인가요?
3. 지금 가맹점 계약(수수료)을 그대로 쓸 수 있나요? 결제 방식이 PG인지 VAN인지도 궁금해요.
4. 결제 취소·환불도 연동 모듈로 할 수 있나요?
5. 영수증 프린터와 바코드 리더기는 키오스크에 어떻게 연결돼 있나요? (USB 등)
6. 카드 승인 내역(일별 결제 금액)을 엑셀이나 API로 받을 수 있나요?

답변 주시면 검토 후 다시 연락드릴게요. 감사합니다.`;

const LOGEN_ASK = `[문의] 로젠 Open API 연동 신청 — ${SHOP_NAME}

안녕하세요. 진주 ‘${SHOP_NAME}’입니다. 택배 계약은 접수소장님과 이야기가 됐고, 저희 주문 관리 프로그램에서 로젠 Open API로 주문을 바로 접수하려고 해요.

1. Open API 사용 신청: 주문등록(registerOrderData), 송장번호 조회(inquirySlipNoMulti), 화물추적(inquiryCargoTrackingMulti), 계약운임 조회(contPickFares)를 쓰려고 해요. 테스트·운영 secretKey를 발급해 주세요.
2. 호출 IP 등록: 34.50.34.252 를 등록해 주세요. 같은 대표가 운영하는 다른 거래처(궁중수라간)가 이미 이 IP로 Open API를 쓰고 있어요. 한 IP를 두 거래처 키가 같이 써도 되는지도 알려 주세요.
3. API에 넣을 값: 거래처코드(custCd), 연동업체코드(userId — 따로 없으면 거래처코드를 써도 되는지), 운임 구분 코드(fareTy — 신용 030이 맞는지)를 알려 주세요.
4. API로 보낸 주문은 ‘주문등록출력(복수건)’ 화면에서 송장을 출력하는 게 맞나요?

secretKey는 메일 등으로 따로 보내 주시면 돼요. 감사합니다.`;

const STATUS = [
  { tone: "bg-matcha-100 text-matcha-700", mark: "지금 됨", text: "앱에서 등록·수정 → 빅솔론 대량등록 엑셀 → 빅솔론에 업로드" },
  { tone: "bg-matcha-100 text-matcha-700", mark: "지금 됨", text: "빅솔론 상품 목록 엑셀 → 앱으로 가져오기 (상품 코드 맞추기)" },
  { tone: "bg-matcha-100 text-matcha-700", mark: "지금 됨", text: "바코드 라벨 · 가격표 → Xprinter로 인쇄 (PC 인쇄 창 · 안드로이드 USB 직접)" },
  { tone: "bg-matcha-100 text-matcha-700", mark: "지금 됨", text: "폰(아이폰 포함)에서 보내면 노트북 인쇄 스테이션이 자동 인쇄" },
  { tone: "bg-matcha-100 text-matcha-700", mark: "지금 됨", text: "빅솔론 매출 API(매장키) → 팔린 만큼 재고 자동 차감 + 매출 통계" },
  { tone: "bg-butter-100 text-butter-700", mark: "파일만 주시면", text: "히엘페이 정산 엑셀 → 일/월 카드 매출 · 수수료" },
  { tone: "bg-berry-100 text-berry-700", mark: "업체 협조 필요", text: "히엘페이 결제 내역 자동 연동 (공개 API 없음)" },
];

export default function GuidePage() {
  const toast = useToast();
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("문의 문구를 복사했어요", "wink");
    } catch {
      toast("복사하지 못했어요", "sad");
    }
  };

  return (
    <div>
      <PageHeader back title="연동 안내" sub="빅솔론 · 히엘페이" />
      <div className="space-y-4 text-[15px] leading-relaxed">
        <section className="card space-y-2 p-4">
          <p className="font-cute text-xl">한눈에 보기</p>
          <ul className="space-y-2">
            {STATUS.map((s) => (
              <li key={s.text} className="flex items-start gap-2 text-sm">
                <span className={`badge mt-0.5 shrink-0 ${s.tone}`}>{s.mark}</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card space-y-3 p-4">
          <p className="font-cute text-xl">🖥️ 빅솔론 (키오스크 · 상품 관리)</p>
          <div className="rounded-2xl bg-soda-100 p-3 text-sm">
            <b>연결 방법:</b> 매출은 빅솔론이 알려준 <b>외부 매출 API</b>(매장키)로 자동으로 받아요. 받은 API는 매출 조회뿐이라{" "}
            <b>상품 등록은 대량작업 엑셀</b>로 해요.
          </div>
          <p className="font-cute">상품 올리는 순서</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
            <li>이 앱에서 상품을 등록·수정하면 ‘빅솔론 반영 필요’ 표시가 붙어요.</li>
            <li>
              <Link href="/excel" className="font-semibold text-berry-600 underline">
                엑셀 화면
              </Link>
              에서 대량등록 엑셀을 받아요 (보내주신 양식과 칸·색·서식 동일).
            </li>
            <li>빅솔론 관리 프로그램의 대량 작업에 업로드해요.</li>
            <li>‘반영 완료’를 누르면 표시가 사라져요. 다음에 가격 등을 고치면 다시 떠요.</li>
          </ol>
          <div className="rounded-2xl bg-cream p-3 text-sm text-ink-soft">
            <b className="text-ink">상품 코드 팁</b> · 이미 빅솔론에 있는 상품은 빅솔론이 붙인 상품 코드(예: S000005)가 엑셀에
            들어가야 새로 생기지 않고 수정돼요. 빅솔론에서 상품 목록을 엑셀로 내려받아 앱에서 ‘가져오기’ 하면 코드가 자동으로
            채워져요.
          </div>
          <div className="rounded-2xl bg-butter-100 p-3 text-sm">
            <b>판매 → 재고 자동 차감</b> · 빅솔론 매장키를 서버(Vercel)에 넣으면{" "}
            <Link href="/sales" className="font-semibold text-berry-600 underline">
              매출 화면
            </Link>
            에서 팔린 상품을 받아와 그만큼 재고를 빼요. 판매 후 최대 10분 뒤에 잡혀요.
          </div>
          <div className="rounded-2xl border-2 border-dashed border-line bg-cream p-3 text-xs whitespace-pre-wrap text-ink-soft">
            {BIXOLON_ASK}
          </div>
          <button type="button" className="btn-soft btn-sm w-full" onClick={() => copy(BIXOLON_ASK)}>
            <Copy size={16} /> 빅솔론(설치 업체) 문의 문구 복사
          </button>
        </section>

        <section className="card space-y-3 p-4">
          <p className="font-cute text-xl">🏷️ 바코드 프린터 (Xprinter XP-T4501B)</p>
          <div className="rounded-2xl bg-matcha-100 p-3 text-sm">
            <b>이 기기는 USB 전용</b>이에요 (뒷면 라벨: INTERFACE USB+Cutter). 같은 계열에 랜·와이파이·블루투스 버전이 따로
            있는데, 이 제품은 USB만 있어요. 그래도 USB로 두 가지 방법이 돼요.
          </div>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-ink-soft">
            <li>
              <b className="text-ink">PC에 꽂기</b> · Xprinter 드라이버 설치 →{" "}
              <Link href="/labels" className="font-semibold text-berry-600 underline">
                라벨 화면
              </Link>
              에서 ‘인쇄 창 (PC)’ → 프린터는 Xprinter, 용지는 라벨 크기로 선택.
            </li>
            <li>
              <b className="text-ink">노트북에 꽂아두고 폰으로 보내기 (아이폰도 OK)</b> · 노트북에서{" "}
              <Link href="/print-station" className="font-semibold text-berry-600 underline">
                인쇄 스테이션
              </Link>
              을 띄우고 ‘자동 인쇄’ 켜기 → 폰에서 상품 화면 ‘노트북으로 라벨 보내기’ 또는 라벨 화면 ‘📡 노트북으로’. 새 상품 등록할 때
              ‘등록하면 라벨도 보내기’를 켜두면 재고만큼 자동으로 나와요.
            </li>
            <li>
              <b className="text-ink">안드로이드 폰·태블릿에 꽂기</b> · OTG 젠더(C타입 → USB-A)로 연결 → 크롬으로 이 앱 열기 →
              라벨 화면 ‘USB 바로 (폰)’ → 연결 → 바로 인쇄. 드라이버 없이 한글 상품명도 그대로 찍혀요.
            </li>
          </ol>
          <div className="rounded-2xl bg-cream p-3 text-sm text-ink-soft">
            <b className="text-ink">안 되는 것</b> · 아이폰에 프린터 직접 꽂기(아이폰은 모든 브라우저가 USB 연결을 막아요 → 대신 노트북으로
            보내기) · 무선 인쇄(이 모델엔 블루투스·와이파이가 없어요). 무선이 꼭 필요하면 같은 계열 LAN·와이파이 모델이 있지만, 웹앱에서 쓰려면 결국 PC 드라이버를 거쳐야 해요.
          </div>
          <p className="text-xs text-ink-soft">
            처음 한 번은 ‘USB 바로 → 인쇄 설정 → 테스트 라벨’로 위치와 간격을 맞춰 주세요. 바코드 없는 소품은 ‘매장용 바코드’를
            만들어 붙이면 키오스크 스캐너로 찍혀요.
          </p>
        </section>

        <section className="card space-y-3 p-4">
          <p className="font-cute text-xl">💳 히엘페이 (카드 결제)</p>
          <div className="rounded-2xl bg-butter-100 p-3 text-sm">
            <b>조사 결과:</b> 공개된 개발자 API 문서는 없어요. 지금은 결제가 키오스크(빅솔론 프로그램 + 히엘페이) 안에서 끝나요.
            빅솔론 대신 이 앱이 키오스크 판매 화면을 맡으려면 히엘페이의 <b>결제 연동 모듈</b>이 필요해서, 아래 문구로 문의해
            보세요(2026-11-15).
          </div>
          <div className="rounded-2xl bg-cream p-3 text-sm text-ink-soft">
            <b className="text-ink">꼭 알아둘 점</b> · 카드 승인 내역에는 <b className="text-ink">‘얼마’</b>만 있고{" "}
            <b className="text-ink">‘무슨 상품’</b>은 없어요. 그래서 재고를 빼려면 히엘페이가 아니라 <b className="text-ink">빅솔론 판매내역</b>
            이 필요해요. 히엘페이 정산 엑셀은 일·월 매출과 카드 수수료를 보는 데 쓸 수 있어요.
          </div>
          <div className="rounded-2xl border-2 border-dashed border-line bg-cream p-3 text-xs whitespace-pre-wrap text-ink-soft">
            {HIEL_ASK}
          </div>
          <button type="button" className="btn-soft btn-sm w-full" onClick={() => copy(HIEL_ASK)}>
            <Copy size={16} /> 히엘페이 문의 문구 복사
          </button>
          <p className="text-xs text-ink-soft">
            보낼 곳: <a href="mailto:info@hielpay.com" className="font-semibold underline">info@hielpay.com</a> (대표, 참조 mkt@hielpay.com 제휴) ·
            고객센터 <a href="tel:15771984" className="underline">1577-1984</a> · 신규·가맹 상담 1577-5526
          </p>
        </section>

        <section className="card space-y-3 p-4">
          <p className="font-cute text-xl">📦 로젠택배 (택배 접수·송장번호)</p>
          <div className="rounded-2xl bg-butter-100 p-3 text-sm">
            <b>준비 상태:</b> 앱 쪽 연동은 미리 만들어 뒀어요. 로젠은 <b>등록된 IP(34.50.34.252)</b>에서 온 요청만 받아서, 궁중수라간 서버를 거쳐
            보내요. 로젠에서 <b>Open API 키·거래처코드</b>를 받으면 켤 수 있어요(2026-11-16).
          </div>
          <div className="rounded-2xl border-2 border-dashed border-line bg-cream p-3 text-xs whitespace-pre-wrap text-ink-soft">
            {LOGEN_ASK}
          </div>
          <button type="button" className="btn-soft btn-sm w-full" onClick={() => copy(LOGEN_ASK)}>
            <Copy size={16} /> 로젠 문의 문구 복사
          </button>
          <p className="text-xs text-ink-soft">
            운임·송장 용지·집하는 접수소장님과 정했으니 API 내용만 물어봐요. 보낼 곳: 접수소장님(대리점)께 보내고 Open API는 본사 담당으로
            넘겨 달라고 하면 돼요. 받은 키는 채팅에 붙이지 말고 Vercel 환경변수에만 넣어요.
          </p>
        </section>
      </div>
    </div>
  );
}
