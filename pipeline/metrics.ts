import { readFile } from "node:fs/promises";
import path from "node:path";

import showsJson from "./shows.json";
import type {
  ChunkTranscript,
  EpisodeMetadata,
  EpisodesFile,
  ShowConfig,
} from "./types";
import { planChunks } from "./lib/chunks";
import { fromRoot, writeJson } from "./lib/files";
import {
  countFillers,
  estimateLongestRunSec,
  joinTranscripts,
  round,
  wordsIn,
} from "./lib/metrics-core";
import { toAscii } from "./lib/text";

type EpisodeStats = {
  episode_id: string;
  show_id: string;
  title: string;
  pub_date: string;
  link: string | null;
  audio_file: string;
  duration_seconds: number;
  duration_minutes: number;
  word_count: number;
  filler_count: number;
  wpm: number;
  yap_density: number;
  longest_run_estimate_sec: number;
  filler_rate: number;
  filler_uncalibrated: true;
  overlap_join_warnings: number;
  providers: string[];
  models: string[];
};

type ShowStats = {
  show_id: string;
  show_name: string;
  wpm: number;
  yap_density: number;
  longest_run_estimate_sec: number;
  filler_rate: number;
  filler_uncalibrated: true;
  totals: {
    episodes: number;
    hours: number;
    words: number;
  };
  episodes: EpisodeStats[];
};

function cachePath(
  episode: EpisodeMetadata,
  chunkIndex: number,
): string {
  return fromRoot(
    "data",
    "transcripts",
    episode.showId,
    episode.id,
    `chunk-${String(chunkIndex).padStart(4, "0")}.json`,
  );
}

async function episodeStats(episode: EpisodeMetadata): Promise<EpisodeStats> {
  const expectedChunks = planChunks(episode.audioDurationSec, String);
  const transcripts: ChunkTranscript[] = [];
  for (const chunk of expectedChunks) {
    let transcript: ChunkTranscript;
    try {
      transcript = JSON.parse(
        await readFile(cachePath(episode, chunk.index), "utf8"),
      ) as ChunkTranscript;
    } catch {
      throw new Error(
        `missing transcript chunk ${chunk.index} for ${episode.showId}/${episode.id}`,
      );
    }
    if (
      transcript.schemaVersion !== 1 ||
      transcript.episodeId !== episode.id ||
      transcript.index !== chunk.index
    ) {
      throw new Error(
        `invalid transcript chunk ${chunk.index} for ${episode.showId}/${episode.id}`,
      );
    }
    transcripts.push(transcript);
  }

  const joined = joinTranscripts(transcripts.map((transcript) => transcript.text));
  const wordCount = wordsIn(joined.text).length;
  const fillerCount = countFillers(joined.text);
  const durationMinutes = episode.audioDurationSec / 60;
  const providers = [
    ...new Set(
      transcripts
        .map((transcript) => transcript.provider)
        .filter((value): value is string => Boolean(value))
        .map(toAscii),
    ),
  ];
  const models = [
    ...new Set(
      transcripts
        .map((transcript) => transcript.model)
        .filter((value): value is string => Boolean(value))
        .map(toAscii),
    ),
  ];

  return {
    episode_id: episode.id,
    show_id: episode.showId,
    title: episode.title,
    pub_date: episode.pubDate,
    link: episode.link,
    audio_file: episode.audioFile.split(path.sep).join("/"),
    duration_seconds: round(episode.audioDurationSec, 6),
    duration_minutes: round(durationMinutes),
    word_count: wordCount,
    filler_count: fillerCount,
    wpm: round(wordCount / durationMinutes),
    yap_density: round(wordCount / (episode.audioDurationSec / 3600)),
    longest_run_estimate_sec: round(
      estimateLongestRunSec(joined.text, episode.audioDurationSec),
    ),
    filler_rate: round(fillerCount / durationMinutes, 3),
    filler_uncalibrated: true,
    overlap_join_warnings: joined.unmatchedJoins,
    providers,
    models,
  };
}

function aggregateShow(show: ShowConfig, episodes: EpisodeStats[]): ShowStats {
  const totalMinutes =
    episodes.reduce((sum, episode) => sum + episode.duration_seconds, 0) / 60;
  const totalWords = episodes.reduce(
    (sum, episode) => sum + episode.word_count,
    0,
  );
  const totalFillers = episodes.reduce(
    (sum, episode) => sum + episode.filler_count,
    0,
  );

  return {
    show_id: show.id,
    show_name: show.name,
    wpm: round(totalWords / totalMinutes),
    yap_density: round(totalWords / (totalMinutes / 60)),
    longest_run_estimate_sec: round(
      Math.max(...episodes.map((episode) => episode.longest_run_estimate_sec)),
    ),
    filler_rate: round(totalFillers / totalMinutes, 3),
    filler_uncalibrated: true,
    totals: {
      episodes: episodes.length,
      hours: round(totalMinutes / 60, 3),
      words: totalWords,
    },
    episodes,
  };
}

async function main(): Promise<void> {
  const manifest = JSON.parse(
    await readFile(fromRoot("data", "episodes.json"), "utf8"),
  ) as EpisodesFile;
  if (manifest.episodes.length === 0) {
    throw new Error("data/episodes.json has no episodes");
  }

  const statsByEpisode = await Promise.all(manifest.episodes.map(episodeStats));
  const shows = (showsJson as ShowConfig[])
    .map((show) => {
      const episodes = statsByEpisode.filter(
        (episode) => episode.show_id === show.id,
      );
      return episodes.length > 0 ? aggregateShow(show, episodes) : null;
    })
    .filter((show): show is ShowStats => show !== null);

  await writeJson(fromRoot("data", "stats.json"), {
    schema_version: 1,
    title: "Yap Index - coming soon",
    generatedAt: new Date().toISOString(),
    methodology: {
      tier: "show-level",
      word_timestamps: false,
      diarization: false,
      longest_run_is_estimate: true,
      filler_counts_calibrated: false,
    },
    shows,
  });
  console.log(
    `Wrote data/stats.json with ${shows.length} show(s) and ${statsByEpisode.length} episode(s)`,
  );
}

await main();
