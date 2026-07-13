import { createHash } from "node:crypto";

const ASCII_REPLACEMENTS: Record<string, string> = {
  "\u2018": "'",
  "\u2019": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u2013": "-",
  "\u2014": "-",
  "\u2026": "...",
};

export function toAscii(value: string): string {
  const replaced = value.replace(
    /[\u2018\u2019\u201c\u201d\u2013\u2014\u2026]/g,
    (character) => ASCII_REPLACEMENTS[character] ?? "",
  );

  return replaced
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(value: string): string {
  return toAscii(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

export function stableEpisodeId(
  title: string,
  pubDate: string,
  guid: string,
): string {
  const slug = slugify(title) || "episode";
  const digest = createHash("sha256")
    .update(`${guid}\n${pubDate}\n${title}`)
    .digest("hex")
    .slice(0, 10);
  return `${slug}-${digest}`;
}

export function parseDuration(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }

  const parts = trimmed.split(":").map(Number);
  if (
    (parts.length !== 2 && parts.length !== 3) ||
    parts.some((part) => !Number.isFinite(part) || part < 0)
  ) {
    return null;
  }

  const [hours, minutes, seconds] =
    parts.length === 3 ? parts : [0, parts[0], parts[1]];
  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}
