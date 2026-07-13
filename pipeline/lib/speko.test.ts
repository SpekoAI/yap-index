import { expect, test } from "bun:test";

import { parseSpekoSse, transcribeAudioChunk } from "./speko";

function fragmentedStream(contents: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(contents);
  return new ReadableStream({
    start(controller) {
      for (const byte of bytes) {
        controller.enqueue(Uint8Array.of(byte));
      }
      controller.close();
    },
  });
}

test("parseSpekoSse handles byte fragmentation and uses done text", async () => {
  const result = await parseSpekoSse(
    fragmentedStream(
      'event: meta\r\ndata: {"provider":"vendor","model":"model"}\r\n\r\n' +
        'event: transcript\ndata: {"text":"partial","isFinal":false}\n\n' +
        'event: done\ndata: {"text":"final text","confidence":0.9,"failoverCount":0}\n\n',
    ),
  );
  expect(result).toEqual({
    text: "final text",
    provider: "vendor",
    model: "model",
    confidence: 0.9,
    failoverCount: 0,
  });
});

test("transcribeAudioChunk retries 5xx three times", async () => {
  let calls = 0;
  const result = await transcribeAudioChunk({
    audio: new Blob(["audio"]),
    apiBase: "https://api.example.test",
    apiKey: "secret",
    fetcher: async () => {
      calls += 1;
      if (calls < 4) {
        return new Response("failed", { status: 503 });
      }
      return new Response('event: done\ndata: {"text":"ok"}\n\n', {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    },
    retryDelay: async () => {},
  });

  expect(calls).toBe(4);
  expect(result.text).toBe("ok");
});
