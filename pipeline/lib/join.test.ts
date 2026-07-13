import { expect, test } from "bun:test";

import { joinChunkTexts, trimTextOverlap } from "./join";

test("trimTextOverlap removes matching overlap with punctuation changes", () => {
  const result = trimTextOverlap(
    "We should build this one careful step at a time.",
    "careful step at a time, then verify the result.",
  );
  expect(result.matchedTokens).toBe(5);
  expect(result.text).toBe(", then verify the result.");
});

test("joinChunkTexts preserves unmatched text", () => {
  expect(joinChunkTexts(["First thought.", "A different thought."])).toEqual({
    text: "First thought. A different thought.",
    unmatchedJoins: 1,
  });
});
