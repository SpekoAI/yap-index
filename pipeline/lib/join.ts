type Token = {
  normalized: string;
  end: number;
};

function comparisonTokens(text: string): Token[] {
  return Array.from(text.matchAll(/[A-Za-z0-9]+(?:'[A-Za-z0-9]+)*/g)).map(
    (match) => ({
      normalized: match[0].toLowerCase().replace(/'/g, ""),
      end: (match.index ?? 0) + match[0].length,
    }),
  );
}

export function trimTextOverlap(
  previousText: string,
  nextText: string,
  maximumTokens = 50,
): { text: string; matchedTokens: number } {
  const previous = comparisonTokens(previousText);
  const next = comparisonTokens(nextText);
  const maximum = Math.min(maximumTokens, previous.length, next.length);

  for (let size = maximum; size >= 3; size -= 1) {
    const previousStart = previous.length - size;
    let matches = true;
    for (let index = 0; index < size; index += 1) {
      if (previous[previousStart + index].normalized !== next[index].normalized) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return {
        text: nextText.slice(next[size - 1].end).trim(),
        matchedTokens: size,
      };
    }
  }

  return { text: nextText.trim(), matchedTokens: 0 };
}

export function joinChunkTexts(texts: string[]): {
  text: string;
  unmatchedJoins: number;
} {
  let joined = texts[0]?.trim() ?? "";
  let unmatchedJoins = 0;

  for (const next of texts.slice(1)) {
    const trimmed = trimTextOverlap(joined, next);
    if (trimmed.matchedTokens === 0) {
      unmatchedJoins += 1;
    }
    if (trimmed.text) {
      joined = `${joined} ${trimmed.text}`.trim();
    }
  }

  return { text: joined, unmatchedJoins };
}
