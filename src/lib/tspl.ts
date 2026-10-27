/**
 * TSPL (TSC/Xprinter 라벨 프린터 명령어) 인코더.
 * 라벨 전체를 1비트 그림(BITMAP)으로 보내서, 프린터에 한글 글꼴이 없어도 화면과 똑같이 찍혀요.
 */

export interface MonoBitmap {
  widthPx: number;
  heightPx: number;
  /** Row-major, MSB first, rows padded to whole bytes. 1 = dark dot. */
  data: Uint8Array<ArrayBuffer>;
}

export function canvasToMono(canvas: HTMLCanvasElement, threshold = 150): MonoBitmap {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  const { width, height } = canvas;
  const px = ctx.getImageData(0, 0, width, height).data;
  const rowBytes = Math.ceil(width / 8);
  const data = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const alpha = px[i + 3] / 255;
      const lum = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) * alpha + 255 * (1 - alpha);
      if (lum < threshold) data[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return { widthPx: width, heightPx: height, data };
}

export interface TsplJob {
  bitmap: MonoBitmap;
  widthMm: number;
  heightMm: number;
  /** Gap between labels on the roll (보통 2~3mm). */
  gapMm: number;
  copies: number;
  /** 0–15, darker is higher. */
  density?: number;
  /** DIRECTION 0 or 1 — flips which edge prints first. */
  direction?: 0 | 1;
  /**
   * TSPL spec: within BITMAP, bit 0 = printed dot. Some firmwares use the
   * opposite; `invert` sends the raw 1 = dark bytes instead.
   */
  invert?: boolean;
}

const enc = new TextEncoder();
const CRLF = "\r\n";

export function buildTsplJob(job: TsplJob): Uint8Array<ArrayBuffer> {
  const { bitmap } = job;
  const rowBytes = Math.ceil(bitmap.widthPx / 8);
  const head = enc.encode(
    [
      "",
      `SIZE ${job.widthMm} mm,${job.heightMm} mm`,
      `GAP ${job.gapMm.toFixed(1)} mm,0 mm`,
      `DIRECTION ${job.direction ?? 0},0`,
      "REFERENCE 0,0",
      ...(job.density !== undefined ? [`DENSITY ${Math.round(job.density)}`] : []),
      "CLS",
      `BITMAP 0,0,${rowBytes},${bitmap.heightPx},0,`,
    ].join(CRLF),
  );
  const payload = job.invert ? bitmap.data : bitmap.data.map((b) => ~b & 0xff);
  const tail = enc.encode(`${CRLF}PRINT 1,${Math.max(1, Math.round(job.copies))}${CRLF}`);
  const out = new Uint8Array(head.length + payload.length + tail.length);
  out.set(head, 0);
  out.set(payload, head.length);
  out.set(tail, head.length + payload.length);
  return out;
}

export function concatJobs(jobs: Uint8Array<ArrayBuffer>[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(jobs.reduce((n, j) => n + j.length, 0));
  let o = 0;
  for (const j of jobs) {
    out.set(j, o);
    o += j.length;
  }
  return out;
}
