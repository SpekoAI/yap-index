import type { Metadata } from "next";
import Link from "next/link";

import { readStats, totalHours } from "@/lib/stats";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Methodology - The Yap Index",
  description:
    "How the Yap Index measures podcast talking speed, and exactly where the numbers get fuzzy.",
};

const DOCS_URL =
  "https://docs.speko.dev?utm_source=yap-index&utm_medium=viral&utm_campaign=viral-3x";

export default async function MethodologyPage() {
  const stats = await readStats();
  const episodeCount = stats.shows.reduce(
    (sum, show) => sum + show.totals.episodes,
    0,
  );

  return (
    <main className="pt-10 sm:pt-14">
      <p className="text-sm font-bold uppercase tracking-widest text-press">
        The fine print, printed large
      </p>
      <h1 className="mt-2 font-display text-[clamp(2.4rem,6vw,4.5rem)] font-black leading-[0.95]">
        Methodology
      </h1>
      <div className="double-rule mt-8 max-w-xl" />

      <div className="mt-8 max-w-xl space-y-6 leading-relaxed">
        <p>
          The Yap Index runs public podcast episodes through the Speko
          speech-to-text API (
          <a
            href={DOCS_URL}
            className="text-press underline underline-offset-2"
          >
            /v1/transcribe
          </a>
          ) and counts what comes back. As of the last run that is{" "}
          {stats.shows.length} shows, {episodeCount} episodes, and{" "}
          {totalHours(stats)} hours of audio, fetched from each show&apos;s own
          public RSS feed. We never host or redistribute the audio.
        </p>

        <h2 className="font-display text-2xl font-bold">What we measure</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Words per minute</strong>: total transcribed words divided
            by total audio minutes. The steadiest number here.
          </li>
          <li>
            <strong>Words per hour</strong> (yap density): the same math on an
            hourly scale.
          </li>
          <li>
            <strong>Longest run</strong>: an <em>estimate</em> of the longest
            stretch of continuous speech, derived from text cadence. The
            transcripts carry no word timestamps, so this is inference, not
            measurement. Treat it as directional.
          </li>
          <li>
            <strong>Fillers per minute</strong>: counts of um, uh, like, you
            know, sort of, kind of. <em>Uncalibrated</em>: transcription models
            disagree about how many disfluencies survive into text, so
            cross-show comparisons are entertainment, not evidence.
          </li>
        </ul>

        <h2 className="font-display text-2xl font-bold">
          What we deliberately do not publish
        </h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Per-host stats.</strong> The pipeline runs without speaker
            diarization, so we cannot honestly attribute words to individual
            people. Show-level only.
          </li>
          <li>
            <strong>Interruption counts and airtime splits.</strong> Same
            reason. When the measurement is not defensible, it does not ship.
          </li>
        </ul>

        <h2 className="font-display text-2xl font-bold">Error expectations</h2>
        <p>
          Long episodes are transcribed in chunks with overlap, and chunk
          joins occasionally duplicate or drop a few words. WPM figures are
          stable to within a few percent; longest-run and filler figures carry
          wider error bars. A calibration harness with hand-labeled reference
          audio gates which metrics are allowed on the board; fillers have not
          passed it yet, which is why they are labeled uncalibrated wherever
          they appear.
        </p>

        <h2 className="font-display text-2xl font-bold">Removal</h2>
        <p>
          If it is your show and you want off the board,{" "}
          <Link href="/delist" className="text-press underline underline-offset-2">
            delist it
          </Link>
          . The show is hidden immediately and the removal is logged. No
          argument.
        </p>

        <p className="text-sm text-ink-soft">
          Generated {new Date(stats.generatedAt).toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
          . Providers and models are recorded per episode in the public data
          file.
        </p>
      </div>
    </main>
  );
}
