import { createHash } from "node:crypto";

import { getSql } from "@/lib/db";
import { InMemoryTokenBucket, type RateLimiter } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CardMetrics = {
  wpm: number;
  filler_rate: number;
  longest_run_estimate_sec: number;
  words: number;
  seconds: number;
};

const LIMITS: Record<keyof CardMetrics, [number, number]> = {
  wpm: [1, 600],
  filler_rate: [0, 60],
  longest_run_estimate_sec: [0, 90],
  words: [1, 1_200],
  seconds: [1, 90],
};

const globalScope = globalThis as typeof globalThis & {
  yapCardLimiter?: RateLimiter;
};
const limiter =
  globalScope.yapCardLimiter ??
  new InMemoryTokenBucket({
    capacity: 5,
    refillTokens: 1,
    refillIntervalMs: 30_000,
  });
globalScope.yapCardLimiter = limiter;

function clientIp(request: Request): string {
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

function hashIp(ip: string): string {
  const salt = process.env.IP_HASH_SALT ?? "yap-index";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

function parseMetrics(body: unknown): CardMetrics | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  const out: Partial<CardMetrics> = {};
  for (const key of Object.keys(LIMITS) as (keyof CardMetrics)[]) {
    const value = record[key];
    const [min, max] = LIMITS[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    out[key] = Math.min(max, Math.max(min, Math.round(value * 100) / 100));
  }
  return out as CardMetrics;
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const rate = await limiter.consume(ip);
  if (!rate.allowed) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const metrics = parseMetrics(body);
  if (!metrics) {
    return Response.json({ error: "Invalid metrics" }, { status: 400 });
  }

  const sql = getSql();
  const rows = await sql`
    INSERT INTO yap_index.yap_cards (metrics, ip_hash)
    VALUES (${sql.json(metrics)}, ${hashIp(ip)})
    RETURNING id
  `;
  return Response.json({ id: rows[0].id as string });
}
