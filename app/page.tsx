import Link from "next/link";

import { getDelistedSlugs } from "@/lib/delists";
import {
  rankedShows,
  readStats,
  superlatives,
  totalHours,
  type ShowStats,
  type SortKey,
  SORT_KEYS,
} from "@/lib/stats";

export const dynamic = "force-dynamic";

const COLUMNS: { key: SortKey; label: string; short: string }[] = [
  { key: "wpm", label: "Words per minute", short: "WPM" },
  { key: "density", label: "Words per hour", short: "Words/hr" },
  { key: "run", label: "Longest run (sec)", short: "Longest run" },
  { key: "fillers", label: "Fillers per minute", short: "Fillers/min*" },
  { key: "hours", label: "Hours measured", short: "Hours" },
];

function metricCell(show: ShowStats, key: SortKey): string {
  switch (key) {
    case "wpm":
      return show.wpm.toFixed(0);
    case "density":
      return Math.round(show.yap_density).toLocaleString("en-US");
    case "run":
      return `${show.longest_run_estimate_sec.toFixed(0)}s`;
    case "fillers":
      return show.filler_rate.toFixed(2);
    case "hours":
      return show.totals.hours.toFixed(1);
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const { sort } = await searchParams;
  const sortKey: SortKey = SORT_KEYS.includes(sort as SortKey)
    ? (sort as SortKey)
    : "wpm";

  const rawStats = await readStats();
  const delisted = await getDelistedSlugs();
  const stats = {
    ...rawStats,
    shows: rawStats.shows.filter((show) => !delisted.has(show.show_id)),
  };
  const shows = rankedShows(stats, sortKey);
  const badges = superlatives(stats);
  const hours = totalHours(stats);

  return (
    <main>
      <header className="pt-10 sm:pt-14">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <h1 className="font-display text-[clamp(3rem,9vw,6.5rem)] font-black uppercase leading-[0.9] tracking-tight">
              The Yap
              <br />
              Index
            </h1>
            <p className="mt-4 max-w-md text-lg text-ink-soft">
              The talking speed of tech, measured.
            </p>
          </div>
          <Link
            href="/yap"
            className="sticker sticker-alt mt-3 px-3 py-2 text-sm hover:bg-press hover:text-paper"
          >
            Measure your yap -&gt;
          </Link>
        </div>
        <div className="double-rule mt-8" />
        <p className="mt-3 text-xs font-medium uppercase tracking-widest text-ink-soft">
          Measured by Speko speech-to-text
          <span className="mx-2 text-press">|</span>
          {stats.shows.length} shows
          <span className="mx-2 text-press">|</span>
          {hours} hours transcribed
        </p>
      </header>

      <section className="mt-12">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b-2 border-ink text-left text-xs uppercase tracking-widest text-ink-soft">
                <th className="w-14 py-3 pr-2 font-medium">Rank</th>
                <th className="py-3 pr-4 font-medium">Show</th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="py-3 pl-4 text-right">
                    <Link
                      href={col.key === "wpm" ? "/" : `/?sort=${col.key}`}
                      title={`Sort by ${col.label.toLowerCase()}`}
                      className={
                        col.key === sortKey
                          ? "font-bold text-press underline underline-offset-4"
                          : "font-medium hover:text-press"
                      }
                    >
                      {col.short}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shows.map((show, index) => (
                <tr
                  key={show.show_id}
                  className="reveal border-b border-rule hover:bg-tan"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <td
                    className={`py-4 pr-2 font-display text-3xl font-black ${
                      index === 0 ? "text-press" : ""
                    }`}
                  >
                    {index + 1}
                  </td>
                  <td className="py-4 pr-4">
                    <Link
                      href={`/show/${show.show_id}`}
                      className="font-display text-xl font-bold hover:text-press sm:text-2xl"
                    >
                      {show.show_name}
                    </Link>
                    <span className="ml-3 inline-flex gap-2 align-middle">
                      {badges.fastestMouth === show.show_id && (
                        <span className="sticker">Fastest mouth</span>
                      )}
                      {badges.marathonMonologue === show.show_id && (
                        <span className="sticker sticker-alt">
                          Marathon monologue
                        </span>
                      )}
                      {badges.densestYap === show.show_id && (
                        <span className="sticker">Densest yap</span>
                      )}
                    </span>
                  </td>
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={`tnum py-4 pl-4 text-right ${
                        col.key === sortKey
                          ? "font-bold"
                          : "text-ink-soft"
                      }`}
                    >
                      {metricCell(show, col.key)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-ink-soft">
          * Filler counts are uncalibrated: transcription models do not agree
          on how many ums survive the transcript. Details in the{" "}
          <Link href="/methodology" className="underline underline-offset-2">
            methodology
          </Link>
          .
        </p>
      </section>
    </main>
  );
}
