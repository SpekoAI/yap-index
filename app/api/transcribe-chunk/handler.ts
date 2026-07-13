import {
  InMemoryTokenBucket,
  type RateLimiter,
} from "@/lib/ratelimit";
import { parseSpekoSse } from "@/pipeline/lib/speko";

const MAX_DURATION_MS = 25_000;
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_UPSTREAM_BYTES = 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 60_000;

const ALLOWED_CONTENT_TYPES = new Set([
  "application/octet-stream",
  "audio/aac",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-wav",
]);

export const TRANSCRIBE_CHUNK_RATE_LIMIT_OPTIONS = {
  capacity: 3,
  refillTokens: 1,
  refillIntervalMs: 6_000,
} as const;

const globalRateLimit = globalThis as typeof globalThis & {
  yapIndexTranscribeChunkRateLimiter?: RateLimiter;
};
const rateLimiter =
  globalRateLimit.yapIndexTranscribeChunkRateLimiter ??
  new InMemoryTokenBucket(TRANSCRIBE_CHUNK_RATE_LIMIT_OPTIONS);
globalRateLimit.yapIndexTranscribeChunkRateLimiter = rateLimiter;

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type TranscribeChunkDependencies = {
  rateLimiter?: RateLimiter;
  fetcher?: Fetcher;
  nowMs?: () => number;
  apiBase?: string;
  apiKey?: string;
};

function clientIp(request: Request): string {
  // These headers are trustworthy only when the deployment proxy overwrites
  // them. A direct deployment must supply its own trusted client IP source.
  const forwarded =
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip");
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

function limitStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
): ReadableStream<Uint8Array> {
  const reader = stream.getReader();
  let totalBytes = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }

        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          controller.error(new Error("Speko response exceeded the size limit"));
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

async function discardBody(response: Response): Promise<void> {
  if (!response.body) {
    return;
  }

  try {
    await response.body.cancel();
  } catch {
    // The upstream status is the useful error. Cancellation is best-effort.
  }
}

function errorResponse(message: string, status: number): Response {
  return Response.json(
    { error: message },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

export async function handleTranscribeChunk(
  request: Request,
  dependencies: TranscribeChunkDependencies = {},
): Promise<Response> {
  const limiter = dependencies.rateLimiter ?? rateLimiter;
  const fetcher = dependencies.fetcher ?? fetch;
  const nowMs = dependencies.nowMs ?? Date.now;
  const startedAtMs = nowMs();

  const rateLimit = await limiter.consume(clientIp(request));
  if (!rateLimit.allowed) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json",
        "retry-after": String(
          Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1_000)),
        ),
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
    if (error instanceof Error && error.message === "BODY_TOO_LARGE") {
      return errorResponse("Audio chunk exceeds 5 MiB", 413);
    }
    return errorResponse("Could not read audio chunk", 400);
  }
  if (audio.byteLength === 0) {
    return errorResponse("Audio chunk is empty", 400);
  }

  const apiKey = dependencies.apiKey ?? process.env.SPEKO_API_KEY;
  const apiBase = dependencies.apiBase ?? process.env.SPEKO_API_BASE;
  if (!apiKey || !apiBase) {
    return errorResponse("Transcription service is not configured", 503);
  }

  let upstream: Response;
  try {
    upstream = await fetcher(
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
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      },
    );
  } catch (error) {
    return errorResponse(
      isTimeoutError(error)
        ? "Transcription service timed out"
        : "Transcription service is unavailable",
      isTimeoutError(error) ? 504 : 502,
    );
  }

  if (!upstream.ok) {
    await discardBody(upstream);
    return errorResponse(
      `Transcription service returned HTTP ${upstream.status}`,
      502,
    );
  }
  if (!upstream.body) {
    return errorResponse("Transcription service returned an empty response", 502);
  }

  try {
    const transcript = await parseSpekoSse(
      limitStream(upstream.body, MAX_UPSTREAM_BYTES),
    );
    const msElapsed = Math.max(0, Math.round(nowMs() - startedAtMs));
    return Response.json(
      {
        text: transcript.text,
        confidence: transcript.confidence,
        msElapsed,
      },
      {
        headers: {
          "cache-control": "no-store",
          "x-ratelimit-limit": String(rateLimit.limit),
          "x-ratelimit-remaining": String(rateLimit.remaining),
        },
      },
    );
  } catch {
    return errorResponse("Transcription service returned an invalid response", 502);
  }
}
