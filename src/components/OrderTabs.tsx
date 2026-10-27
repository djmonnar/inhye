"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function OrderTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/reorder", label: "🛒 발주할 것" },
    { href: "/suppliers", label: "🏪 구매처" },
  ];
  return (
    <div className="mb-3 flex gap-1 rounded-2xl border-2 border-line bg-cream-deep p-1">
      {tabs.map((t) => {
        const on = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex-1 rounded-xl py-2 text-center font-cute transition ${
              on ? "bg-white text-berry-600 shadow-sm" : "text-ink-soft"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
