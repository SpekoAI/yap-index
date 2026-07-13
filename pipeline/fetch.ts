import { access, mkdir, open, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

import showsJson from "./shows.json";
import type { EpisodeMetadata, EpisodesFile, ShowConfig } from "./types";
import { parseArgs, positiveIntegerArg } from "./lib/args";
import { fromRoot, writeJson } from "./lib/files";
import { runProcess } from "./lib/process";
import { parseShowFeed, type FeedEpisode } from "./lib/rss";

const shows = showsJson as ShowConfig[];

async function assertFfmpegAvailable(): Promise<void> {
  try {
    await runProcess("ffmpeg", ["-version"]);
    await runProcess("ffprobe", ["-version"]);
  } catch {
    throw new Error(
      "ffmpeg and ffprobe are required. Install ffmpeg before running the pipeline.",
    );
  }
}

async function isCached(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).size > 0;
  } catch {
    return false;
  }
}

async function downloadAudio(url: string, filePath: string): Promise<void> {
  if (await isCached(filePath)) {
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.part`;
  await rm(temporaryPath, { force: true });
  const response = await fetch(url, {
    headers: { "user-agent": "TheYapIndex/0.1 (+https://yap-index.speko.dev)" },
    redirect: "follow",
    signal: AbortSignal.timeout(30 * 60_000),
  });

  if (!response.ok || !response.body) {
    throw new Error(`audio download failed with HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const file = await open(temporaryPath, "w");
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      await file.write(value);
    }
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  } finally {
    await file.close();
  }
  await rename(temporaryPath, filePath);
}

async function audioDuration(filePath: string): Promise<number> {
  const result = await runProcess("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const duration = Number(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe returned an invalid duration for ${filePath}`);
  }
  return duration;
}

function selectEpisodes(
  episodes: FeedEpisode[],
  limit: number,
  selection: string,
): FeedEpisode[] {
  const latest = episodes.slice(0, Math.max(5, limit));
  if (selection === "shortest") {
    return [...latest]
      .sort(
        (left, right) =>
          (left.declaredDurationSec ?? Number.POSITIVE_INFINITY) -
          (right.declaredDurationSec ?? Number.POSITIVE_INFINITY),
      )
      .slice(0, limit);
  }
  if (selection !== "latest") {
    throw new Error("--select must be latest or shortest");
  }
  return latest.slice(0, limit);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const limit = positiveIntegerArg(args, "limit", 5);
  const selection = String(args.select ?? "latest");
  const showId = args.show ? String(args.show) : null;
  const selectedShows = showId
    ? shows.filter((show) => show.id === showId)
    : shows;

  if (selectedShows.length === 0) {
    throw new Error(`unknown show id: ${showId}`);
  }

  await assertFfmpegAvailable();
  const episodes: EpisodeMetadata[] = [];

  for (const show of selectedShows) {
    const feed = await parseShowFeed(show);
    const selected = selectEpisodes(feed.audioItems, limit, selection);
    console.log(`Fetching ${selected.length} episode(s) for ${show.name}`);

    for (const episode of selected) {
      const relativeAudioFile = path.join(
        "data",
        "audio-cache",
        show.id,
        `${episode.id}.mp3`,
      );
      const absoluteAudioFile = fromRoot(relativeAudioFile);
      await downloadAudio(episode.audioUrl, absoluteAudioFile);
      await access(absoluteAudioFile);
      const measuredDurationSec = await audioDuration(absoluteAudioFile);
      episodes.push({
        ...episode,
        audioDurationSec: measuredDurationSec,
        audioFile: relativeAudioFile,
      });
      console.log(
        `Cached ${show.name}: ${episode.title} (${(measuredDurationSec / 60).toFixed(1)} min)`,
      );
    }
  }

  const output: EpisodesFile = {
    generatedAt: new Date().toISOString(),
    episodes,
  };
  await writeJson(fromRoot("data", "episodes.json"), output);
  console.log(`Wrote data/episodes.json with ${episodes.length} episode(s)`);
}

await main();
