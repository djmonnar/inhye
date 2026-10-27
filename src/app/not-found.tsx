import Link from "next/link";
import { Mascot } from "@/components/Mascot";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Mascot mood="sad" size={120} />
      <h1 className="mt-3 font-cute text-2xl">길을 잃었어요</h1>
      <p className="mt-1 text-ink-soft">찾는 페이지가 없어요.</p>
      <Link href="/" className="btn-primary mt-6">
        홈으로
      </Link>
    </main>
  );
}
