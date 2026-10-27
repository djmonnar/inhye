"use client";

import { Copy } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/providers";
import { PageHeader } from "@/components/ui";
import { SHOP_NAME } from "@/lib/config";

const BIXOLON_ASK = `안녕하세요, 빅솔론 키오스크를 사용 중인 소품샵(${SHOP_NAME})입니다.
상품 관리를 별도 프로그램으로 하고 있어서 몇 가지 여쭤봅니다.

1. 판매 내역을 상품별(상품코드/바코드, 수량, 금액, 일시)로 엑셀 다운로드할 수 있나요?
2. 등록된 상품 목록을 상품 코드 포함해서 엑셀로 내려받을 수 있나요?
3. 상품·판매 데이터를 API나 웹훅으로 받을 수 있나요?
4. 대량작업 양식의 ‘상품단가’ 칸은 원가인가요, 판매 단가인가요?

감사합니다.`;

const HIEL_ASK = `안녕하세요, 히엘페이 결제를 사용 중인 소품샵(${SHOP_NAME})입니다.

1. 카드 승인·정산 내역을 엑셀로 내려받을 수 있는 가맹점 페이지가 있나요?
2. 결제 내역을 API나 웹훅으로 받아볼 수 있나요?
3. 결제 내역에 키오스크 주문 번호나 상품 정보가 함께 남나요?

감사합니다.`;

const STATUS = [
  { tone: "bg-matcha-100 text-matcha-700", mark: "지금 됨", text: "앱에서 등록·수정 → 빅솔론 대량등록 엑셀 → 빅솔론에 업로드" },
  { tone: "bg-matcha-100 text-matcha-700", mark: "지금 됨", text: "빅솔론 상품 목록 엑셀 → 앱으로 가져오기 (상품 코드 맞추기)" },
  { tone: "bg-matcha-100 text-matcha-700", mark: "지금 됨", text: "바코드 라벨 · 가격표 → Xprinter로 인쇄 (PC 인쇄 창 · 안드로이드 USB 직접)" },
  { tone: "bg-butter-100 text-butter-700", mark: "파일만 주시면", text: "빅솔론 판매내역 엑셀 → 재고 자동 차감 + 매출 통계" },
  { tone: "bg-butter-100 text-butter-700", mark: "파일만 주시면", text: "히엘페이 정산 엑셀 → 일/월 카드 매출 · 수수료" },
  { tone: "bg-berry-100 text-berry-700", mark: "업체 협조 필요", text: "엑셀 없이 실시간 자동 연동 (빅솔론·히엘페이 모두 공개 API 없음)" },
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
            <b>조사 결과:</b> 빅솔론은 키오스크(K1 등)와 프린터를 만드는 회사예요. 상품·매출 데이터를 주고받는 공개 API나
            개발자 문서는 찾지 못했어요 (공개된 개발 도구는 프린터 인쇄용 Web Print SDK뿐이에요). 그래서{" "}
            <b>대량작업 엑셀이 공식 연결 통로</b>예요.
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
            <b>판매 → 재고 자동 차감</b> · 빅솔론에서 <b>상품별 판매내역 엑셀</b>을 받을 수 있으면, 그 파일 하나만 보내주세요.
            올리기만 하면 팔린 만큼 재고가 빠지고 많이 팔린 상품·일별 매출이 보이게 붙여 드릴게요.
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
              <b className="text-ink">안드로이드 폰·태블릿에 꽂기</b> · OTG 젠더(C타입 → USB-A)로 연결 → 크롬으로 이 앱 열기 →
              라벨 화면 ‘USB 바로 (폰)’ → 연결 → 바로 인쇄. 드라이버 없이 한글 상품명도 그대로 찍혀요.
            </li>
          </ol>
          <div className="rounded-2xl bg-cream p-3 text-sm text-ink-soft">
            <b className="text-ink">안 되는 것</b> · 아이폰(사파리는 USB 기기 연결이 안 돼요) · 무선 인쇄(이 모델엔 블루투스·와이파이가
            없어요). 무선이 꼭 필요하면 같은 계열 LAN·와이파이 모델이 있지만, 웹앱에서 쓰려면 결국 PC 드라이버를 거쳐야 해요.
          </div>
          <p className="text-xs text-ink-soft">
            처음 한 번은 ‘USB 바로 → 인쇄 설정 → 테스트 라벨’로 위치와 간격을 맞춰 주세요. 바코드 없는 소품은 ‘매장용 바코드’를
            만들어 붙이면 키오스크 스캐너로 찍혀요.
          </p>
        </section>

        <section className="card space-y-3 p-4">
          <p className="font-cute text-xl">💳 히엘페이 (카드 결제)</p>
          <div className="rounded-2xl bg-butter-100 p-3 text-sm">
            <b>조사 결과:</b> 공개된 개발자 API 문서는 없어요. 결제는 키오스크 안에서 끝나기 때문에 이 앱이 결제에 직접 붙을
            일은 거의 없어요.
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
        </section>
      </div>
    </div>
  );
}
