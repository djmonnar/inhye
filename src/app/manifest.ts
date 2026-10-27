import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} · 소품샵 관리`,
    short_name: APP_NAME,
    description: "무인 소품샵 상품·구매처·재고 관리",
    start_url: "/",
    display: "standalone",
    background_color: "#fff8ef",
    theme_color: "#fff8ef",
    lang: "ko",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
