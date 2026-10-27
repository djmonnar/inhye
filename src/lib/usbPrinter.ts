/// <reference types="w3c-web-usb" />
/**
 * WebUSB로 라벨 프린터에 직접 보내기 (안드로이드 크롬 + OTG 젠더, 맥/크롬북 크롬).
 * 아이폰(사파리)은 WebUSB가 없어서 안 되고, 윈도우는 프린터 드라이버가 USB를 잡고 있어서
 * 보통 ‘인쇄 창’ 방식을 써야 해요.
 */

export function usbAvailable(): boolean {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

export function deviceLabel(d: USBDevice): string {
  return [d.manufacturerName, d.productName].filter(Boolean).join(" ") || "USB 프린터";
}

/** Reuses a printer this browser was already allowed to use; prompts only when asked. */
export async function getPrinter(prompt: boolean): Promise<USBDevice | null> {
  if (!usbAvailable()) return null;
  const known = await navigator.usb.getDevices();
  if (known.length && !prompt) return known[0];
  if (!prompt) return null;
  try {
    return await navigator.usb.requestDevice({ filters: [] });
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return null; // 선택 창을 닫음
    throw e;
  }
}

interface OutTarget {
  iface: number;
  alt: number;
  endpoint: number;
}

function findBulkOut(device: USBDevice): OutTarget | null {
  const candidates: (OutTarget & { printerClass: boolean })[] = [];
  for (const iface of device.configuration?.interfaces ?? []) {
    for (const alt of iface.alternates) {
      const out = alt.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
      if (out) {
        candidates.push({
          iface: iface.interfaceNumber,
          alt: alt.alternateSetting,
          endpoint: out.endpointNumber,
          printerClass: alt.interfaceClass === 7,
        });
      }
    }
  }
  candidates.sort((a, b) => Number(b.printerClass) - Number(a.printerClass));
  return candidates[0] ?? null;
}

const CHUNK = 16 * 1024;

export async function sendToPrinter(device: USBDevice, data: Uint8Array<ArrayBuffer>): Promise<void> {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const target = findBulkOut(device);
  if (!target) throw new Error("이 USB 기기에서 인쇄 통로를 찾지 못했어요. 라벨 프린터가 맞는지 확인해 주세요.");
  try {
    await device.claimInterface(target.iface);
  } catch {
    throw new Error(
      "프린터를 쓸 수 없어요. 다른 앱이 프린터를 쓰고 있거나(PC는 드라이버), 케이블을 다시 꽂아 보세요. PC에서는 ‘인쇄 창’ 방식을 써 주세요.",
    );
  }
  try {
    if (target.alt) await device.selectAlternateInterface(target.iface, target.alt);
    for (let i = 0; i < data.length; i += CHUNK) {
      const res = await device.transferOut(target.endpoint, data.subarray(i, i + CHUNK));
      if (res.status !== "ok") throw new Error("프린터로 보내다가 멈췄어요. 용지와 덮개를 확인해 주세요.");
    }
  } finally {
    await device.releaseInterface(target.iface).catch(() => {});
  }
}
