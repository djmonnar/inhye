import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

/**
 * public/schema.sql 을 Supabase DB에 바로 적용해요 (Supabase SQL 편집기 대신).
 *
 * - 저장소에 들어 있는 schema.sql 만 실행해요. 화면에서 SQL을 받아 실행하는 일은 없어요.
 * - 접속 주소는 Vercel의 Supabase 연동이 넣어 주는 POSTGRES_URL_NON_POOLING / POSTGRES_URL
 *   (앞에 접두어가 붙어도 찾아요). 비밀번호가 들어 있으니 서버에서만 써요.
 * - 전체를 한 트랜잭션으로 실행해서, 중간에 실패하면 아무것도 바뀌지 않아요.
 */

const DB_URL_NAMES = ["POSTGRES_URL_NON_POOLING", "POSTGRES_URL"];

function findDbUrl(): string | undefined {
  for (const n of DB_URL_NAMES) if (process.env[n]) return process.env[n];
  for (const n of DB_URL_NAMES) {
    const key = Object.keys(process.env).find((k) => k.endsWith(n) && process.env[k]);
    if (key) return process.env[key];
  }
  return undefined;
}

export const hasDbUrl = () => Boolean(findDbUrl());

/**
 * Supabase에서 DB 비밀번호를 새로 바꾸면 연동이 넣어 둔 POSTGRES_URL 안의 비밀번호는 옛것이 돼요.
 * 그때는 Vercel에 SUPABASE_DB_PASSWORD(새 비밀번호)만 넣으면 그걸 써요 — 주소를 손으로 고칠 필요 없어요.
 */
function connect(): pg.Client {
  const raw = findDbUrl();
  if (!raw) throw new Error("NO_DB_URL");
  const url = new URL(raw);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  const override = (process.env.SUPABASE_DB_PASSWORD ?? "").trim();
  // 주소를 통째로 넘기면 주소 속 비밀번호가 우선이라, 칸별로 나눠서 넘겨요.
  // sslmode 등은 아래 ssl 설정으로 대신해요 (Supabase 인증서는 Node 기본 인증서 목록에 없어요).
  return new pg.Client({
    host,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: override || decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "postgres",
    ssl: local ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    statement_timeout: 50_000,
  });
}

/** 관리자 계정이 이미 있는지 (표가 아직 없으면 false). */
export async function adminExists(): Promise<boolean> {
  const client = connect();
  await client.connect();
  try {
    const { rows } = await client.query<{ yes: boolean }>(
      "select to_regclass('public.profiles') is not null and exists (select 1 from public.profiles where role = 'admin') as yes",
    );
    return Boolean(rows[0]?.yes);
  } catch {
    // profiles 표가 없으면 위 문장이 실패할 수 있어요 → 처음 설치로 봐요
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

export async function applySchema(): Promise<void> {
  const sql = await readFile(path.join(process.cwd(), "public", "schema.sql"), "utf8");
  const client = connect();
  await client.connect();
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    await client.end().catch(() => {});
  }
}

/** pg 오류를 할 일이 보이는 한국어로. */
export function schemaErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string };
  const msg = err?.message ?? String(e);
  if (msg === "NO_DB_URL") {
    return "Vercel에 DB 접속 주소(POSTGRES_URL)가 없어요. Supabase SQL 편집기로 실행해 주세요.";
  }
  if (err?.code === "28P01") {
    return `DB 비밀번호가 맞지 않아요 (28P01: ${msg}). Vercel 환경변수에 SUPABASE_DB_PASSWORD(Supabase에서 새로 정한 DB 비밀번호)를 Secret으로 넣고 Redeploy 한 뒤 다시 눌러 주세요.`;
  }
  if (err?.code === "28000") {
    return `DB가 로그인 자체를 막고 있어요 (28000: ${msg}). Supabase 쪽 문제일 가능성이 커요 — 프로젝트 재시작·DB 비밀번호 재설정 후 다시 눌러 보고, 그래도 같으면 Supabase에 문의해 주세요.`;
  }
  if (/timeout|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(msg)) {
    return "DB에 연결하지 못했어요. Supabase 프로젝트가 켜져 있는지(일시 정지 아님) 확인하고 다시 눌러 주세요.";
  }
  return `SQL 실행 중 오류: ${msg}`;
}
