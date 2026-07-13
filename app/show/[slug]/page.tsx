import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDelistedSlugs } from "@/lib/delists";
import { findShow, rankOf, readStats, type StatsFile } from "@/lib/stats";

export const dynamic = "force-dynamic";

async function readVisibleStats(): Promise<StatsFile> {
  const rawStats = await readStats();
  const delisted = await getDelistedSlugs();
  return {
    ...rawStats,
    shows: rawStats.shows.filter((show) => !delisted.has(show.show_id)),
  };
}

function headline(rankWpm: number, rankRun: number, rankDensity: number): string {
  if (rankWpm === 1) return "The fastest mouth in tech";
  if (rankRun === 1) return "Home of the marathon monologue";
  if (rankDensity === 1) return "The densest yap on the charts";
  if (rankWpm <= 3) return "A certified talker";
  return "On the board";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const stats = await readVisibleStats();
  const show = findShow(stats, slug);
  if (!show) {
    return {};
  }
  const title = `${show.show_name} on The Yap Index`;
  const description = `${show.show_name} talks at ${show.wpm.toFixed(0)} words per minute across ${show.totals.hours.toFixed(1)} measured hours.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [`/show/${slug}/og`],
    },
    twitter: {
      card: "summary_large_image",
      images: [`/show/${slug}/og`],
    },
  };
}

export default async function ShowPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const stats = await readVisibleStats();
  const show = findShow(stats, slug);
  if (!show) {
    notFound();
  }

  const rankWpm = rankOf(stats, slug, "wpm");
  const rankRun = rankOf(stats, slug, "run");
  const rankDensity = rankOf(stats, slug, "density");

  const shareText = `${show.show_name} talks at ${show.wpm.toFixed(0)} words per minute (no. ${rankWpm} on The Yap Index).`;
  const shareUrl = `https://yap-index.speko.dev/show/${slug}`;
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;

  const statBlocks: { label: string; value: string; note?: string }[] = [
    { label: "Words per minute", value: show.wpm.toFixed(0) },
    {
      label: "Words per hour",
      value: Math.round(show.yap_density).toLocaleString("en-US"),
    },
    {
      label: "Longest run",
      value: `${show.longest_run_estimate_sec.toFixed(0)}s`,
      note: "estimate",
    },
    {
      label: "Fillers per minute",
      value: show.filler_rate.toFixed(2),
      note: "uncalibrated",
    },
    { label: "Hours measured", value: show.totals.hours.toFixed(1) },
  ];

  return (
    <main className="pt-10 sm:pt-14">
      <Link
        href="/"
        className="text-xs font-medium uppercase tracking-widest text-ink-soft hover:text-press"
      >
        &lt;- Back to the board
      </Link>

      <header className="mt-6">
        <p className="text-sm font-bold uppercase tracking-widest text-press">
          {headline(rankWpm, rankRun, rankDensity)}
        </p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-6">
          <h1 className="font-display text-[clamp(2.2rem,6vw,4.5rem)] font-black leading-[0.95]">
            {show.show_name}
          </h1>
          <div className="pb-2 text-right">
            <span className="font-display text-6xl font-black text-press">
              {rankWpm}
            </span>
            <span className="ml-1 text-xs uppercase tracking-widest text-ink-soft">
              of {stats.shows.length} by WPM
            </span>
          </div>
        </div>
        <div className="double-rule mt-6" />
      </header>

      <section className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-5">
        {statBlocks.map((block) => (
          <div key={block.label}>
            <div className="tnum font-display text-3xl font-bold sm:text-4xl">
              {block.value}
            </div>
            <div className="mt-1 text-xs uppercase tracking-widest text-ink-soft">
              {block.label}
              {block.note ? (
                <span className="ml-1 text-press">({block.note})</span>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <div className="mt-8">
        <a
          href={intent}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block border-2 border-ink px-4 py-2 text-sm font-bold uppercase tracking-widest hover:border-press hover:text-press"
        >
          Post this stat
        </a>
      </div>

      <section className="mt-14">
        <h2 className="border-b-2 border-ink pb-2 text-xs font-bold uppercase tracking-widest">
          Episodes measured
        </h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {show.episodes.map((episode) => (
              <tr key={episode.episode_id} className="border-b border-rule">
                <td className="max-w-[28rem] py-3 pr-4">
                  {episode.link ? (
                    <a
                      href={episode.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-press"
                    >
                      {episode.title}
                    </a>
                  ) : (
                    episode.title
                  )}
                  <span className="ml-2 text-xs text-ink-soft">
                    {new Date(episode.pub_date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </td>
                <td className="tnum py-3 pl-4 text-right text-ink-soft">
                  {episode.duration_minutes.toFixed(0)} min
                </td>
                <td className="tnum py-3 pl-4 text-right font-bold">
                  {episode.wpm.toFixed(0)} wpm
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-ink-soft">
          Episode audio stays with the show. We link out; we never host it.
        </p>
      </section>
    </main>
  );
}
