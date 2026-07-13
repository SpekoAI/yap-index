import { describe, expect, test } from "bun:test";

import { parseDuration, stableEpisodeId, toAscii } from "./text";

describe("parseDuration", () => {
  test("parses seconds and clock formats", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("01:30")).toBe(90);
    expect(parseDuration("1:02:03")).toBe(3723);
  });

  test("rejects invalid durations", () => {
    expect(parseDuration(undefined)).toBeNull();
    expect(parseDuration("unknown")).toBeNull();
    expect(parseDuration("0")).toBeNull();
  });
});

test("toAscii normalizes punctuation and accents", () => {
  expect(toAscii("Cafe\u0301 \u2014 \u201clevel up\u201d\u2026")).toBe(
    'Cafe - "level up"...',
  );
});

test("stableEpisodeId is deterministic and ASCII safe", () => {
  const id = stableEpisodeId("A title", "2026-01-01", "guid-1");
  expect(id).toMatch(/^a-title-[a-f0-9]{10}$/);
  expect(stableEpisodeId("A title", "2026-01-01", "guid-1")).toBe(id);
});
