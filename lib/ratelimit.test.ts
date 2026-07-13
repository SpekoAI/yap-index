import { expect, test } from "bun:test";

import { InMemoryTokenBucket } from "./ratelimit";

test("token bucket limits per key and refills", async () => {
  const limiter = new InMemoryTokenBucket({
    capacity: 2,
    refillTokens: 1,
    refillIntervalMs: 1_000,
  });

  expect((await limiter.consume("ip-a", 1, 0)).allowed).toBe(true);
  expect((await limiter.consume("ip-a", 1, 0)).allowed).toBe(true);
  expect((await limiter.consume("ip-a", 1, 0)).allowed).toBe(false);
  expect((await limiter.consume("ip-b", 1, 0)).allowed).toBe(true);
  expect((await limiter.consume("ip-a", 1, 1_000)).allowed).toBe(true);
});

test("token bucket tolerates clock rollback", async () => {
  const limiter = new InMemoryTokenBucket({
    capacity: 1,
    refillTokens: 1,
    refillIntervalMs: 1_000,
  });
  await limiter.consume("ip", 1, 1_000);
  expect((await limiter.consume("ip", 1, 500)).allowed).toBe(false);
});
