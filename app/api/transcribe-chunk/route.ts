import {
  InMemoryTokenBucket,
  type RateLimiter,
} from "@/lib/ratelimit";

export const runtime = "nodejs";

const MAX_DURATION_MS = 25_000;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/octet-stream",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/webm",
]);

const globalRateLimit = globalThis as typeof globalThis & {
  yapIndexRateLimiter?: RateLimiter;
};
const rateLimiter =
  globalRateLimit.yapIndexRateLimiter ??
  new InMemoryTokenBucket({
    capacity: 20,
    refillTokens: 1,
    refillIntervalMs: 3_000,
  });
globalRateLimit.yapIndexRateLimiter = rateLimiter;

function clientIp(request: Request): string {
  // These headers are trustworthy only when the deployment proxy overwrites
  // them. A direct deployment must supply its own trusted client IP source.
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

async function readBodyWithLimit(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) {
    return new Uint8Array();
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > MAX_AUDIO_BYTES) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const rateLimit = await rateLimiter.consume(clientIp(request));
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000))),
        "x-ratelimit-limit": String(rateLimit.limit),
        "x-ratelimit-remaining": String(rateLimit.remaining),
      },
    });
  }

  const rawContentType = request.headers.get("content-type") ?? "";
  const contentType = rawContentType.split(";", 1)[0].trim().toLowerCase();
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    return errorResponse("Unsupported audio content type", 415);
  }

  const durationMs = Number(request.headers.get("x-audio-duration-ms"));
  if (
    !Number.isFinite(durationMs) ||
    durationMs <= 0 ||
    durationMs > MAX_DURATION_MS
  ) {
    return errorResponse("x-audio-duration-ms must be between 1 and 25000", 400);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES) {
    return errorResponse("Audio chunk exceeds 5 MiB", 413);
  }

  let audio: Uint8Array;
  try {
    audio = await readBodyWithLimit(request);
  } catch (error) {
    if ((error as Error).message === "BODY_TOO_LARGE") {
      return errorResponse("Audio chunk exceeds 5 MiB", 413);
    }
    throw error;
  }
  if (audio.byteLength === 0) {
    return errorResponse("Audio chunk is empty", 400);
  }

  const apiKey = process.env.SPEKO_API_KEY;
  const apiBase = process.env.SPEKO_API_BASE;
  if (!apiKey || !apiBase) {
    return errorResponse("Transcription service is not configured", 503);
  }

  const upstream = await fetch(
    `${apiBase.replace(/\/$/, "")}/v1/transcribe`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": contentType,
        "x-speko-intent": JSON.stringify({ language: "en" }),
      },
      body: audio.buffer.slice(
        audio.byteOffset,
        audio.byteOffset + audio.byteLength,
      ) as ArrayBuffer,
      signal: AbortSignal.timeout(60_000),
    },
  );

  const headers = new Headers();
  headers.set(
    "content-type",
    upstream.headers.get("content-type") ?? "text/event-stream",
  );
  headers.set("cache-control", "no-store");
  headers.set("x-ratelimit-limit", String(rateLimit.limit));
  headers.set("x-ratelimit-remaining", String(rateLimit.remaining));

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
