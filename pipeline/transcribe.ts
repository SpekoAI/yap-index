import { createHash } from "node:crypto";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import type {
  ChunkMetadata,
  ChunkTranscript,
  EpisodeMetadata,
  EpisodesFile,
} from "./types";
import { parseArgs } from "./lib/args";
import { planChunks } from "./lib/chunks";
import { mapConcurrent } from "./lib/concurrency";
import { fromRoot, writeJson } from "./lib/files";
import { runProcess } from "./lib/process";
import { transcribeAudioChunk } from "./lib/speko";

type ChunkJob = {
  episode: EpisodeMetadata;
  chunk: ChunkMetadata;
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).size > 0;
  } catch {
    return false;
  }
}

async function createChunk(
  episode: EpisodeMetadata,
  chunk: ChunkMetadata,
): Promise<void> {
  const outputPath = fromRoot(chunk.audioFile);
  if (await fileExists(outputPath)) {
    return;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await runProcess("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-ss",
    chunk.offsetSec.toFixed(3),
    "-i",
    fromRoot(episode.audioFile),
    "-t",
    chunk.durationSec.toFixed(3),
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-codec:a",
    "libmp3lame",
    "-b:a",
    "48k",
    "-y",
    outputPath,
  ]);
}

async function sha256(filePath: string): Promise<string> {
  const contents = await readFile(filePath);
  return createHash("sha256").update(contents).digest("hex");
}

function transcriptPath(job: ChunkJob): string {
  return fromRoot(
    "data",
    "transcripts",
    job.episode.showId,
    job.episode.id,
    `chunk-${String(job.chunk.index).padStart(4, "0")}.json`,
  );
}

async function readCachedTranscript(
  job: ChunkJob,
  audioSha256: string,
): Promise<ChunkTranscript | null> {
  try {
    const cached = JSON.parse(
      await readFile(transcriptPath(job), "utf8"),
    ) as ChunkTranscript;
    if (
      cached.schemaVersion === 1 &&
      cached.audioSha256 === audioSha256 &&
      cached.episodeId === job.episode.id &&
      cached.index === job.chunk.index &&
      typeof cached.text === "string"
    ) {
      return cached;
    }
  } catch {
    return null;
  }
  return null;
}

async function processJob(
  job: ChunkJob,
  apiBase: string,
  apiKey: string,
  provider?: string,
): Promise<ChunkTranscript> {
  await createChunk(job.episode, job.chunk);
  const absoluteChunkPath = fromRoot(job.chunk.audioFile);
  const audioSha256 = await sha256(absoluteChunkPath);
  const cached = await readCachedTranscript(job, audioSha256);
  if (cached) {
    console.log(
      `Cache hit ${job.episode.showId}/${job.episode.id}/${job.chunk.index}`,
    );
    return cached;
  }

  console.log(
    `Transcribing ${job.episode.showId}/${job.episode.id}/${job.chunk.index}`,
  );
  const result = await transcribeAudioChunk({
    audio: Bun.file(absoluteChunkPath),
    apiBase,
    apiKey,
    provider,
  });
  const transcript: ChunkTranscript = {
    schemaVersion: 1,
    showId: job.episode.showId,
    episodeId: job.episode.id,
    audioSha256,
    ...job.chunk,
    ...result,
    transcribedAt: new Date().toISOString(),
  };
  await writeJson(transcriptPath(job), transcript);
  return transcript;
}

async function main(): Promise<void> {
  const apiKey = process.env.SPEKO_API_KEY;
  const apiBase = process.env.SPEKO_API_BASE;
  if (!apiKey || !apiBase) {
    throw new Error("SPEKO_API_KEY and SPEKO_API_BASE are required");
  }

  await runProcess("ffmpeg", ["-version"]);
  const args = parseArgs(process.argv.slice(2));
  const provider = args.provider
    ? String(args.provider)
    : process.env.SPEKO_STT_PROVIDER;
  const manifest = JSON.parse(
    await readFile(fromRoot("data", "episodes.json"), "utf8"),
  ) as EpisodesFile;
  let episodes = manifest.episodes;
  if (args.show) {
    episodes = episodes.filter((episode) => episode.showId === args.show);
  }
  if (args.episode) {
    episodes = episodes.filter((episode) => episode.id === args.episode);
  }
  if (episodes.length === 0) {
    throw new Error("no episodes matched the transcription filters");
  }

  const jobs: ChunkJob[] = episodes.flatMap((episode) => {
    const chunkDirectory = path.join(
      "data",
      "audio-cache",
      "chunks",
      episode.showId,
      episode.id,
    );
    return planChunks(episode.audioDurationSec, (index) =>
      path.join(chunkDirectory, `chunk-${String(index).padStart(4, "0")}.mp3`),
    ).map((chunk) => ({ episode, chunk }));
  });

  console.log(`Processing ${jobs.length} chunk(s) at concurrency 3`);
  await mapConcurrent(jobs, 3, (job) =>
    processJob(job, apiBase, apiKey, provider),
  );
  console.log(`Transcribed ${jobs.length} chunk(s)`);
}

await main();
