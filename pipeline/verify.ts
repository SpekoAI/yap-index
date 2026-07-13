import showsJson from "./shows.json";
import type { ShowConfig } from "./types";
import { parseShowFeed } from "./lib/rss";

const shows = showsJson as ShowConfig[];

async function verifyEnclosure(url: string): Promise<number> {
  const response = await fetch(url, {
    method: "HEAD",
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  return response.status;
}

async function main(): Promise<void> {
  let failed = false;

  for (const show of shows) {
    try {
      const feed = await parseShowFeed(show);
      if (feed.audioItems.length === 0) {
        throw new Error("feed has no audio enclosures");
      }

      const sampleStatus = await verifyEnclosure(feed.audioItems[0].audioUrl);
      if (sampleStatus < 200 || sampleStatus >= 400) {
        throw new Error(`sample enclosure returned HTTP ${sampleStatus}`);
      }

      console.log(
        `OK | ${show.name} | ${feed.title} | ${feed.audioItems.length}/${feed.totalItems} audio | sample HTTP ${sampleStatus}`,
      );
    } catch (error) {
      failed = true;
      console.error(`FAIL | ${show.name} | ${(error as Error).message}`);
    }
  }

  if (failed) {
    process.exitCode = 1;
  }
}

await main();
