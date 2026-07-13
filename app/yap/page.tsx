import type { Metadata } from "next";

import YapMeter from "@/components/YapMeter";
import { readStats } from "@/lib/stats";

export const metadata: Metadata = {
  title: "Measure your yap - The Yap Index",
  description:
    "Talk for sixty seconds and get your own words-per-minute number, measured live by Speko speech-to-text.",
};

export default async function YapPage() {
  const stats = await readStats();
  const shows = stats.shows.map((show) => ({
    name: show.show_name,
    wpm: show.wpm,
  }));

  return (
    <main className="pt-10 sm:pt-14">
      <p className="text-sm font-bold uppercase tracking-widest text-press">
        The field test
      </p>
      <h1 className="mt-2 font-display text-[clamp(2.4rem,7vw,5rem)] font-black leading-[0.95]">
        Measure your yap
      </h1>
      <p className="mt-4 max-w-md text-lg text-ink-soft">
        Sixty seconds. Say anything. Speko transcribes you live and the meter
        does the math. Then find out how many podcast hosts you out-talk.
      </p>
      <div className="double-rule mt-8 max-w-md" />
      <YapMeter shows={shows} />
    </main>
  );
}
