import Parser from "rss-parser";

import type { ShowConfig } from "../types";
import { parseDuration, stableEpisodeId, toAscii } from "./text";

type RssItem = Parser.Item & {
  enclosure?: {
    url?: string;
    type?: string;
    length?: string;
  };
  "itunes:duration"?: string;
};

export type FeedEpisode = {
  id: string;
  showId: string;
  showName: string;
  title: string;
  pubDate: string;
  declaredDurationSec: number | null;
  link: string | null;
  audioUrl: string;
};

export type ParsedShowFeed = {
  title: string;
  totalItems: number;
  audioItems: FeedEpisode[];
};

const parser = new Parser<Record<string, never>, RssItem>({
  customFields: {
    item: ["itunes:duration"],
  },
});

export function isAudioEnclosure(
  item: RssItem,
): item is RssItem & { enclosure: { url: string; type?: string } } {
  const url = item.enclosure?.url;
  if (!url) {
    return false;
  }

  const type = item.enclosure?.type?.toLowerCase() ?? "";
  return type.startsWith("audio/") || /\.mp3(?:$|[?#])/i.test(url);
}

export async function parseShowFeed(show: ShowConfig): Promise<ParsedShowFeed> {
  const response = await fetch(show.rssUrl, {
    headers: { "user-agent": "TheYapIndex/0.1 (+https://yap-index.speko.dev)" },
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`RSS request failed for ${show.name}: HTTP ${response.status}`);
  }

  const xml = await response.text();
  const feed = await parser.parseString(xml);
  const audioItems = feed.items
    .filter(isAudioEnclosure)
    .map((item) => {
      const title = toAscii(item.title?.trim() || "Untitled episode");
      const rawDate = item.isoDate ?? item.pubDate;
      const parsedDate = rawDate ? new Date(rawDate) : new Date(0);
      const pubDate = Number.isNaN(parsedDate.getTime())
        ? new Date(0).toISOString()
        : parsedDate.toISOString();
      const guid = String(item.guid ?? item.enclosure?.url ?? title);

      return {
        id: stableEpisodeId(title, pubDate, guid),
        showId: show.id,
        showName: show.name,
        title,
        pubDate,
        declaredDurationSec: parseDuration(item["itunes:duration"]),
        link: item.link ? toAscii(item.link) : null,
        audioUrl: item.enclosure.url,
      };
    })
    .sort((left, right) => right.pubDate.localeCompare(left.pubDate));

  return {
    title: toAscii(feed.title ?? show.name),
    totalItems: feed.items.length,
    audioItems,
  };
}
