import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AiError } from "./openai";

export interface PageInfo {
  url: string;
  site: string;
  title: string;
  meta: Record<string, string>;
  jsonld: string;
  text: string;
}

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;
const UNREADABLE = "이 사이트는 자동으로 읽을 수 없어요. ‘AI로 상품 정보 채우기’(사진)를 써 주세요.";

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

/** Only public http(s) hosts — the server must never be pointed at internal addresses. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AiError("링크 주소가 올바르지 않아요.", 400);
  }
  if (!/^https?:$/.test(url.protocol) || (url.port && !["80", "443"].includes(url.port))) {
    throw new AiError("http(s) 상품 페이지 주소만 읽을 수 있어요.", 400);
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new AiError("이 주소는 읽을 수 없어요.", 400);
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new AiError("사이트 주소를 찾지 못했어요. 링크를 확인해 주세요.", 400);
  if (addresses.some(isPrivateAddress)) throw new AiError("이 주소는 읽을 수 없어요.", 400);
  return url;
}

async function readCapped(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(size, MAX_BYTES));
  let at = 0;
  for (const c of chunks) {
    const part = c.subarray(0, out.length - at);
    out.set(part, at);
    at += part.length;
    if (at >= out.length) break;
  }
  return out;
}

/** Korean shops still serve EUC-KR; honour the header or <meta charset>. */
function decode(bytes: Uint8Array, contentType: string): string {
  const fromHeader = /charset=([\w-]+)/i.exec(contentType)?.[1];
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  const charset = (fromHeader || fromMeta || "utf-8").toLowerCase();
  try {
    return new TextDecoder(charset === "ks_c_5601-1987" ? "euc-kr" : charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const META_KEYS = [
  "og:title", "og:description", "og:site_name", "description", "keywords",
  "product:price:amount", "product:price:currency", "og:price:amount", "og:price:currency",
];

function extract(html: string, url: URL): PageInfo {
  const meta: Record<string, string> = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /(?:property|name|itemprop)=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    const content = /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (key && content && META_KEYS.includes(key) && !meta[key]) meta[key] = decodeEntities(content).trim().slice(0, 300);
  }
  const jsonld = (html.match(/<script[^>]+application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) ?? [])
    .map((s) => s.replace(/<\/?script[^>]*>/gi, "").trim())
    .join("\n")
    .slice(0, 4000);
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim().slice(0, 200);
  const text = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, 8000);
  return { url: url.toString(), site: url.hostname, title, meta, jsonld, text };
}

export async function fetchProductPage(raw: string): Promise<PageInfo> {
  let url = await assertPublicUrl(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  for (let hop = 0; ; hop++) {
    let res: Response;
    try {
      res = await fetch(url, {
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6",
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new AiError("사이트가 응답하지 않아요. 링크를 확인하거나 잠시 후 다시 해 주세요.", 504);
    }
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= MAX_REDIRECTS) throw new AiError(UNREADABLE, 422);
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) throw new AiError(UNREADABLE, 422);
    const type = res.headers.get("content-type") ?? "";
    if (!/html|xml/i.test(type)) throw new AiError("상품 페이지 주소를 넣어 주세요. (사진·파일 링크는 읽을 수 없어요)", 422);
    const page = extract(decode(await readCapped(res), type), url);
    if (!page.title && !page.text && !Object.keys(page.meta).length) throw new AiError(UNREADABLE, 422);
    return page;
  }
}
