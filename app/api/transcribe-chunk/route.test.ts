import { expect, test } from "bun:test";

import { InMemoryTokenBucket, type RateLimiter } from "@/lib/ratelimit";

import {
  TRANSCRIBE_CHUNK_RATE_LIMIT_OPTIONS,
  handleTranscribeChunk,
} from "./handler";

function audioRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/transcribe-chunk", {
    method: "POST",
    headers: {
      "content-type": "audio/webm;codecs=opus",
      "x-audio-duration-ms": "25000",
      ...headers,
    },
    body: "audio bytes",
  });
}

function allowedLimiter(onKey?: (key: string) => void): RateLimiter {
  return {
    async consume(key) {
      onKey?.(key);
      return {
        allowed: true,
        limit: 3,
        remaining: 2,
        retryAfterMs: 0,
      };
    },
  };
}

test("transcribe chunk rate limit is a three-request burst at ten per minute", async () => {
  expect(TRANSCRIBE_CHUNK_RATE_LIMIT_OPTIONS).toEqual({
    capacity: 3,
    refillTokens: 1,
    refillIntervalMs: 6_000,
  });

  const limiter = new InMemoryTokenBucket(
    TRANSCRIBE_CHUNK_RATE_LIMIT_OPTIONS,
  );
  expect((await limiter.consume("ip", 1, 0)).allowed).toBe(true);
  expect((await limiter.consume("ip", 1, 0)).allowed).toBe(true);
  expect((await limiter.consume("ip", 1, 0)).allowed).toBe(true);
  expect((await limiter.consume("ip", 1, 0)).allowed).toBe(false);
  expect((await limiter.consume("ip", 1, 6_000)).allowed).toBe(true);
});

test("maps the Speko done event to the public JSON response", async () => {
  let upstreamUrl = "";
  let upstreamInit: RequestInit | undefined;
  let rateLimitKey = "";
  const times = [1_000, 1_137];

  const response = await handleTranscribeChunk(
    audioRequest({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
    {
      apiBase: "https://speko.example.test/",
      apiKey: "test-key",
      rateLimiter: allowedLimiter((key) => {
        rateLimitKey = key;
      }),
      nowMs: () => times.shift() ?? 1_137,
      fetcher: async (input, init) => {
        upstreamUrl = String(input);
        upstreamInit = init;
        return new Response(
          'event: meta\ndata: {"provider":"test"}\n\n' +
            'event: done\ndata: {"text":"hello world","confidence":0.94}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        );
      },
    },
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    text: "hello world",
    confidence: 0.94,
    msElapsed: 137,
  });
  expect(rateLimitKey).toBe("203.0.113.7");
  expect(upstreamUrl).toBe("https://speko.example.test/v1/transcribe");
  expect(upstreamInit?.method).toBe("POST");
  expect(new Headers(upstreamInit?.headers).get("authorization")).toBe(
    "Bearer test-key",
  );
  expect(new Headers(upstreamInit?.headers).get("content-type")).toBe(
    "audio/webm",
  );
  expect(await new Response(upstreamInit?.body).text()).toBe("audio bytes");
  expect(response.headers.get("x-ratelimit-limit")).toBe("3");
  expect(response.headers.get("x-ratelimit-remaining")).toBe("2");
});

test("returns retry metadata without calling Speko when the IP is limited", async () => {
  let fetchCalls = 0;
  const response = await handleTranscribeChunk(audioRequest(), {
    apiBase: "https://speko.example.test",
    apiKey: "test-key",
    rateLimiter: {
      async consume() {
        return {
          allowed: false,
          limit: 3,
          remaining: 0,
          retryAfterMs: 5_001,
        };
      },
    },
    fetcher: async () => {
      fetchCalls += 1;
      return new Response();
    },
  });

  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("6");
  expect(response.headers.get("x-ratelimit-limit")).toBe("3");
  expect(response.headers.get("x-ratelimit-remaining")).toBe("0");
  expect(await response.json()).toEqual({ error: "Rate limit exceeded" });
  expect(fetchCalls).toBe(0);
});

test("maps upstream HTTP and malformed SSE responses to a bad gateway", async () => {
  const common = {
    apiBase: "https://speko.example.test",
    apiKey: "test-key",
    rateLimiter: allowedLimiter(),
  };

  const upstreamError = await handleTranscribeChunk(audioRequest(), {
    ...common,
    fetcher: async () => new Response("upstream details", { status: 503 }),
  });
  expect(upstreamError.status).toBe(502);
  expect(await upstreamError.json()).toEqual({
    error: "Transcription service returned HTTP 503",
  });

  const malformedStream = await handleTranscribeChunk(audioRequest(), {
    ...common,
    fetcher: async () =>
      new Response('event: done\ndata: {"confidence":0.8}\n\n'),
  });
  expect(malformedStream.status).toBe(502);
  expect(await malformedStream.json()).toEqual({
    error: "Transcription service returned an invalid response",
  });
});

test("rejects chunks longer than 25 seconds before calling Speko", async () => {
  let fetchCalls = 0;
  const response = await handleTranscribeChunk(
    audioRequest({ "x-audio-duration-ms": "25001" }),
    {
      apiBase: "https://speko.example.test",
      apiKey: "test-key",
      rateLimiter: allowedLimiter(),
      fetcher: async () => {
        fetchCalls += 1;
        return new Response();
      },
    },
  );

  expect(response.status).toBe(400);
  expect(fetchCalls).toBe(0);
});
