import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getSql } from "@/lib/db";
import { readStats, showsOutYapped } from "@/lib/stats";

export const dynamic = "force-dynamic";

type CardRow = {
  id: string;
  metrics: {
    wpm: number;
    filler_rate: number;
    longest_run_estimate_sec: number;
    words: number;
    seconds: number;
  };
  created_at: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readCard(id: string): Promise<CardRow | null> {
  if (!UUID_RE.test(id)) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT id, metrics, created_at
    FROM yap_index.yap_cards
    WHERE id = ${id}
  `;
  return (rows[0] as CardRow | undefined) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const card = await readCard(id).catch(() => null);
  if (!card) return {};
  const title = `Yap speed: ${card.metrics.wpm.toFixed(0)} WPM`;
  return {
    title: `${title} - The Yap Index`,
    openGraph: {
      title,
      images: [`/yap/${id}/og`],
    },
    twitter: { card: "summary_large_image", images: [`/yap/${id}/og`] },
  };
}

export default async function YapCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await readCard(id).catch(() => null);
  if (!card) notFound();

  const stats = await readStats();
  const beaten = showsOutYapped(stats, card.metrics.wpm);

  return (
    <main className="pt-10 sm:pt-14">
      <p className="text-sm font-bold uppercase tracking-widest text-press">
        Field report
      </p>
      <div className="mt-4 max-w-lg border-2 border-ink p-6">
        <div className="flex items-baseline gap-3">
          <span className="tnum font-display text-7xl font-black">
            {card.metrics.wpm.toFixed(0)}
          </span>
          <span className="text-sm uppercase tracking-widest text-ink-soft">
            words per minute
          </span>
        </div>
        <p className="mt-3 font-display text-lg font-bold">
          Out-yaps {beaten} of {stats.shows.length} tech podcasts.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-4 border-t border-rule pt-4 text-sm">
          <div>
            <div className="tnum font-bold">{card.metrics.words}</div>
            <div className="text-xs text-ink-soft">words</div>
          </div>
          <div>
            <div className="tnum font-bold">
              {card.metrics.filler_rate.toFixed(1)}
            </div>
            <div className="text-xs text-ink-soft">
              fillers/min (uncalibrated)
            </div>
          </div>
          <div>
            <div className="tnum font-bold">
              {card.metrics.longest_run_estimate_sec.toFixed(0)}s
            </div>
            <div className="text-xs text-ink-soft">longest run (estimate)</div>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <Link
          href="/yap"
          className="inline-block border-2 border-press bg-press px-5 py-2 text-sm font-bold uppercase tracking-widest text-paper hover:bg-paper hover:text-press"
        >
          Measure your own yap
        </Link>
      </div>
    </main>
  );
}
