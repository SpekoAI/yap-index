import { joinChunkTexts } from "./join";

const FILLER_PHRASES = [
  ["you", "know"],
  ["sort", "of"],
  ["kind", "of"],
] as const;
const SINGLE_FILLERS = new Set(["um", "uh", "like"]);

export function wordsIn(text: string): string[] {
  return Array.from(text.matchAll(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*/g)).map(
    (match) => match[0],
  );
}

export function countFillers(text: string): number {
  const words = wordsIn(text).map((word) => word.toLowerCase());
  let count = 0;

  for (let index = 0; index < words.length; index += 1) {
    const phrase = FILLER_PHRASES.find((candidate) =>
      candidate.every((word, offset) => words[index + offset] === word),
    );
    if (phrase) {
      count += 1;
      index += phrase.length - 1;
    } else if (SINGLE_FILLERS.has(words[index])) {
      count += 1;
    }
  }

  return count;
}

export function estimateLongestRunSec(
  text: string,
  durationSec: number,
): number {
  const totalWords = wordsIn(text).length;
  if (totalWords === 0 || durationSec <= 0) {
    return 0;
  }

  // This is an estimate because Speko does not return word timestamps or
  // diarization. Terminal punctuation stands in for pauses, and a uniform
  // episode-wide word cadence converts the longest text run into seconds.
  // It cannot identify real silence, interruptions, or speaker changes.
  const longestRunWords = Math.max(
    ...text
      .split(/[.!?]+/)
      .map((run) => wordsIn(run).length)
      .filter((count) => count > 0),
  );
  const wordsPerSecond = totalWords / durationSec;
  return Math.min(durationSec, longestRunWords / wordsPerSecond);
}

export function joinTranscripts(texts: string[]): {
  text: string;
  unmatchedJoins: number;
} {
  return joinChunkTexts(texts);
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
