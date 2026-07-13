import { getSql } from "@/lib/db";
import { InMemoryTokenBucket, type RateLimiter } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalScope = globalThis as typeof globalThis & {
  delistLimiter?: RateLimiter;
};
const limiter =
  globalScope.delistLimiter ??
  new InMemoryTokenBucket({
    capacity: 3,
    refillTokens: 1,
    refillIntervalMs: 60_000,
  });
globalScope.delistLimiter = limiter;

function clientIp(request: Request): string {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const rate = await limiter.consume(clientIp(request));
  if (!rate.allowed) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const record = (body ?? {}) as Record<string, unknown>;
  const showSlug = typeof record.show_slug === "string" ? record.show_slug : "";
  const reason =
    typeof record.reason === "string" ? record.reason.slice(0, 2_000) : null;
  if (!showSlug || showSlug.length > 100 || !/^[a-z0-9-]+$/.test(showSlug)) {
    return Response.json({ error: "Invalid show" }, { status: 400 });
  }

  const sql = getSql();
  await sql`
    INSERT INTO yap_index.delists (show_slug, reason)
    VALUES (${showSlug}, ${reason})
  `;
  return Response.json({ ok: true });
}
