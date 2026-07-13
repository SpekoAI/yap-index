import { expect, test } from "bun:test";

import {
  countFillers,
  estimateLongestRunSec,
  wordsIn,
} from "./metrics-core";

test("wordsIn counts normalized numbers and contractions", () => {
  expect(wordsIn("I've got 4 ideas.")).toEqual(["I've", "got", "4", "ideas"]);
});

test("countFillers counts phrases once", () => {
  expect(countFillers("Um, you know, it is kind of like that, uh.")).toBe(5);
});

test("estimateLongestRunSec uses punctuation and cadence", () => {
  expect(estimateLongestRunSec("one two. three four five six.", 60)).toBe(40);
});
