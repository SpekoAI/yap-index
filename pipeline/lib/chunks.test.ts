import { expect, test } from "bun:test";

import { planChunks } from "./chunks";

test("planChunks stays below four minutes and covers audio without gaps", () => {
  const chunks = planChunks(700, (index) => `chunk-${index}.mp3`);
  expect(chunks.map((chunk) => chunk.offsetSec)).toEqual([0, 228, 456, 684]);
  expect(chunks.every((chunk) => chunk.durationSec < 240)).toBe(true);
  expect(chunks.at(-1)?.offsetSec! + chunks.at(-1)?.durationSec!).toBe(700);
});

test("planChunks does not add an overlap-only final chunk", () => {
  expect(planChunks(230, String)).toHaveLength(1);
  expect(planChunks(458, String)).toHaveLength(2);
  expect(planChunks(458.1, String)).toHaveLength(3);
});
