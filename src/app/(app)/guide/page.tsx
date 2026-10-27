"use client";

import { Copy } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/providers";
import { PageHeader } from "@/components/ui";

const HIEL_ASK = `안녕하세요, 히엘페이 키오스크를 사용 중인 매장입니다.
상품 관리를 자체 프로그램으로 하고 있어서 아래 내용 문의드립니다.

1. 상품을 엑셀로 일괄 등록/수정할 수 있는 관리자 페이지가 있나요? (양식의 ‘상품단가’ 칸 의미도 궁금합니다)
2. 매출·판매 내역을 엑셀로 내려받거나, API(또는 웹훅)로 받아볼 수 있나요?
3. 키오스크 상품 목록을 엑셀로 내려받을 수 있나요? (상품 코드 포함)

답변 부탁드립니다. 감사합니다.`;

const BIXOLON_ASK = `안녕하세요, 빅솔론 제품을 사용 중인 매장입니다.
웹 브라우저에서 바코드 라벨을 바로 인쇄하려고 합니다.

1. 제 기기 모델(___)이 Web Print SDK를 지원하나요?
2. 안드로이드 폰/태블릿에서도 Web Print SDK 앱으로 인쇄할 수 있나요?
3. 한글 상품명을 라벨에 인쇄하려면 어떤 폰트 설정이 필요한가요?

감사합니다.`;

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
        <section className="card space-y-3 p-4">
          <p className="font-cute text-xl">💳 히엘페이 (결제 · 키오스크)</p>
          <div className="rounded-2xl bg-butter-100 p-3 text-sm">
            <b>조사 결과:</b> 공개된 개발자 API 문서는 찾지 못했어요. 히엘페이 홈페이지에서도 상품 등록은 “문자 · 카카오톡 ·
            이메일로 요청하면 히엘페이가 세팅해 준다”고 안내하고 있어요.
          </div>
          <p className="font-cute">그래서 이 앱에서는 이렇게 연결해요</p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-soft">
            <li>상품을 이 앱에 등록하면 ‘키오스크 반영 필요’ 표시가 붙어요.</li>
            <li>
              <Link href="/excel" className="font-semibold text-berry-600 underline">
                엑셀 화면
              </Link>
              에서 보내주신 키오스크 양식 그대로 엑셀을 만들어요.
            </li>
            <li>관리자 페이지에 업로드하거나, ‘카톡으로 보내기’로 히엘페이에 바로 보내요.</li>
            <li>반영되면 ‘반영 완료’를 눌러 표시를 지워요.</li>
          </ol>
          <p className="text-sm text-ink-soft">
            매출 데이터를 자동으로 받아와 재고를 빼는 기능은, 히엘페이가 매출 엑셀이나 API를 주면 추가할 수 있어요. 아래
            문구로 문의해 보세요.
          </p>
          <div className="rounded-2xl border-2 border-dashed border-line bg-cream p-3 text-xs whitespace-pre-wrap text-ink-soft">
            {HIEL_ASK}
          </div>
          <button type="button" className="btn-soft btn-sm w-full" onClick={() => copy(HIEL_ASK)}>
            <Copy size={16} /> 히엘페이 문의 문구 복사
          </button>
        </section>

        <section className="card space-y-3 p-4">
          <p className="font-cute text-xl">🖨️ 빅솔론 (프린터 · 키오스크 기기)</p>
          <div className="rounded-2xl bg-soda-100 p-3 text-sm">
            <b>조사 결과:</b> 빅솔론은 영수증·라벨 프린터와 키오스크(BIXPOS) 기기를 만드는 회사예요. 웹에서 쓸 수 있는 공식
            도구로 <b>Web Print SDK</b>(자바스크립트)가 있어요. 기기에 ‘Web Print SDK’ 앱(윈도우 · 안드로이드 · iOS)을 깔면,
            브라우저가 그 앱(<code>127.0.0.1:18080</code>)으로 인쇄를 요청하는 방식이에요.
          </div>
          <p className="font-cute">지금 바로 되는 것</p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>
              <Link href="/labels" className="font-semibold text-berry-600 underline">
                라벨 · 가격표 인쇄
              </Link>
              : 빅솔론 드라이버가 깔린 PC에서 인쇄 창 → 빅솔론 프린터 선택하면 바로 인쇄돼요.
            </li>
            <li>바코드 없는 소품은 ‘매장용 바코드’(200으로 시작하는 EAN-13)를 만들어 붙이면 키오스크 스캐너로 찍혀요.</li>
            <li>USB · 블루투스 바코드 스캐너를 PC에 꽂고 아무 화면에서나 찍으면 그 상품이 바로 떠요.</li>
          </ul>
          <p className="font-cute">다음 단계로 할 수 있는 것</p>
          <p className="text-sm text-ink-soft">
            쓰고 계신 빅솔론 기기 <b>모델명</b>(기기 뒷면 스티커, 예: SLP-TX400, XD3-40d, BK3-3)을 알려주시면 Web Print SDK로 인쇄
            창 없이 버튼 한 번에 라벨이 나오게 연결해 드릴게요.
          </p>
          <div className="rounded-2xl border-2 border-dashed border-line bg-cream p-3 text-xs whitespace-pre-wrap text-ink-soft">
            {BIXOLON_ASK}
          </div>
          <button type="button" className="btn-soft btn-sm w-full" onClick={() => copy(BIXOLON_ASK)}>
            <Copy size={16} /> 빅솔론 문의 문구 복사
          </button>
        </section>
      </div>
    </div>
  );
}
