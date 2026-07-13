import { readFile } from "node:fs/promises";

import { fromRoot } from "./lib/files";
import { round } from "./lib/metrics-core";

type CalibrationReference = {
  audioFile: string;
  trueWordCount: number;
  trueFillers: number;
  trueLongestRunSec: number;
};

type EpisodeStats = {
  audio_file: string;
  word_count: number;
  filler_count: number;
  longest_run_estimate_sec: number;
};

type StatsFile = {
  shows: Array<{ episodes: EpisodeStats[] }>;
};

type ErrorRow = {
  predicted: number;
  truth: number;
  error: number;
  absoluteError: number;
  percentError: number | null;
};

function errorRow(predicted: number, truth: number): ErrorRow {
  const error = predicted - truth;
  return {
    predicted,
    truth,
    error: round(error, 3),
    absoluteError: round(Math.abs(error), 3),
    percentError:
      truth === 0 ? null : round((Math.abs(error) / Math.abs(truth)) * 100, 2),
  };
}

function summary(rows: ErrorRow[]): {
  mae: number;
  bias: number;
  mape: number | null;
} {
  const percentageRows = rows.filter((row) => row.percentError !== null);
  return {
    mae: round(
      rows.reduce((sum, row) => sum + row.absoluteError, 0) / rows.length,
      3,
    ),
    bias: round(
      rows.reduce((sum, row) => sum + row.error, 0) / rows.length,
      3,
    ),
    mape:
      percentageRows.length === 0
        ? null
        : round(
            percentageRows.reduce(
              (sum, row) => sum + (row.percentError ?? 0),
              0,
            ) / percentageRows.length,
            2,
          ),
  };
}

async function main(): Promise<void> {
  const references = JSON.parse(
    await readFile(
      fromRoot("data", "calibration", "reference.json"),
      "utf8",
    ),
  ) as CalibrationReference[];
  if (references.length === 0) {
    console.log("No calibration references found.");
    return;
  }

  const stats = JSON.parse(
    await readFile(fromRoot("data", "stats.json"), "utf8"),
  ) as StatsFile;
  const episodes = stats.shows.flatMap((show) => show.episodes);
  const reports = references.map((reference) => {
    const episode = episodes.find(
      (candidate) => candidate.audio_file === reference.audioFile,
    );
    if (!episode) {
      throw new Error(`no stats row found for ${reference.audioFile}`);
    }
    return {
      audioFile: reference.audioFile,
      wordCount: errorRow(episode.word_count, reference.trueWordCount),
      fillers: errorRow(episode.filler_count, reference.trueFillers),
      longestRunSec: errorRow(
        episode.longest_run_estimate_sec,
        reference.trueLongestRunSec,
      ),
    };
  });

  console.log(JSON.stringify({ reports }, null, 2));
  console.log(
    JSON.stringify(
      {
        summary: {
          wordCount: summary(reports.map((report) => report.wordCount)),
          fillers: summary(reports.map((report) => report.fillers)),
          longestRunSec: summary(
            reports.map((report) => report.longestRunSec),
          ),
        },
      },
      null,
      2,
    ),
  );
}

await main();
