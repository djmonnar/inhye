import { IS_DEMO } from "./config";

/** Shrinks phone photos (often 3–8MB) before upload. JPEG works on every browser incl. iOS. */
export async function compressImage(file: File): Promise<Blob> {
  const { default: imageCompression } = await import("browser-image-compression");
  return imageCompression(file, {
    maxSizeMB: IS_DEMO ? 0.12 : 0.35,
    maxWidthOrHeight: IS_DEMO ? 720 : 1200,
    useWebWorker: false,
    fileType: "image/jpeg",
    initialQuality: 0.82,
  });
}
