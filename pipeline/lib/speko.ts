import type { SpekoTranscriptResult } from "../types";

type SseEvent = {
  event: string;
  data: string;
};

class RetryableSpekoError extends Error {}

type Fetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

async function readSseEvents(stream: ReadableStream<Uint8Array>): Promise<SseEvent[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const events: SseEvent[] = [];
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  function dispatch(): void {
    if (dataLines.length > 0) {
      events.push({ event: eventName, data: dataLines.join("\n") });
    }
    eventName = "message";
    dataLines = [];
  }

  function consumeLine(rawLine: string): void {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") {
      dispatch();
    } else if (line.startsWith("event:")) {
      eventName = line.slice(6).trimStart();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      consumeLine(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  if (buffer.length > 0) {
    consumeLine(buffer);
  }
  dispatch();
  return events;
}

export async function parseSpekoSse(
  stream: ReadableStream<Uint8Array>,
): Promise<SpekoTranscriptResult> {
  const events = await readSseEvents(stream);
  let meta: Record<string, unknown> = {};
  let done: Record<string, unknown> | null = null;

  for (const event of events) {
    if (event.event !== "meta" && event.event !== "done") {
      continue;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(event.data) as Record<string, unknown>;
    } catch {
      throw new RetryableSpekoError(`invalid JSON in Speko ${event.event} event`);
    }

    if (event.event === "meta") {
      meta = data;
    } else {
      done = data;
    }
  }

  if (!done || typeof done.text !== "string") {
    throw new RetryableSpekoError("Speko stream ended without a valid done event");
  }

  return {
    text: done.text,
    provider:
      typeof done.provider === "string"
        ? done.provider
        : typeof meta.provider === "string"
          ? meta.provider
          : null,
    model:
      typeof done.model === "string"
        ? done.model
        : typeof meta.model === "string"
          ? meta.model
          : null,
    confidence: typeof done.confidence === "number" ? done.confidence : null,
    failoverCount:
      typeof done.failoverCount === "number" ? done.failoverCount : null,
  };
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function transcribeAudioChunk(options: {
  audio: Blob;
  apiBase: string;
  apiKey: string;
  provider?: string;
  fetcher?: Fetcher;
  retryDelay?: (milliseconds: number) => Promise<void>;
}): Promise<SpekoTranscriptResult> {
  const fetcher = options.fetcher ?? fetch;
  const retryDelay = options.retryDelay ?? sleep;
  const headers: Record<string, string> = {
    authorization: `Bearer ${options.apiKey}`,
    "content-type": "audio/mpeg",
    "x-speko-intent": JSON.stringify({ language: "en" }),
  };
  if (options.provider) {
    headers["x-speko-constraints"] = JSON.stringify({
      allowedProviders: { stt: [options.provider] },
    });
  }

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= 3; attempt += 1) {
    try {
      const response = await fetcher(
        `${options.apiBase.replace(/\/$/, "")}/v1/transcribe`,
        {
          method: "POST",
          headers,
          body: options.audio,
          signal: AbortSignal.timeout(5 * 60_000),
        },
      );

      if (response.status >= 500) {
        throw new RetryableSpekoError(`Speko returned HTTP ${response.status}`);
      }
      if (!response.ok || !response.body) {
        const details = (await response.text()).slice(0, 500);
        throw new Error(
          `Speko returned HTTP ${response.status}${details ? `: ${details}` : ""}`,
        );
      }

      return await parseSpekoSse(response.body);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      const isRetryable =
        normalized instanceof RetryableSpekoError ||
        normalized.name === "AbortError" ||
        normalized.name === "TimeoutError" ||
        normalized instanceof TypeError;
      lastError = normalized;
      if (!isRetryable || attempt === 3) {
        throw normalized;
      }
      await retryDelay(500 * 2 ** attempt);
    }
  }

  throw lastError ?? new Error("Speko transcription failed");
}
