import type { Metadata } from "next";

import DelistForm from "@/components/DelistForm";
import { readStats } from "@/lib/stats";

export const metadata: Metadata = {
  title: "Delist a show - The Yap Index",
  description: "Take your show off the Yap Index. Immediate, logged, no drama.",
};

export default async function DelistPage() {
  const stats = await readStats();
  const shows = stats.shows.map((show) => ({
    slug: show.show_id,
    name: show.show_name,
  }));

  return (
    <main className="pt-10 sm:pt-14">
      <p className="text-sm font-bold uppercase tracking-widest text-press">
        Corrections desk
      </p>
      <h1 className="mt-2 font-display text-[clamp(2.4rem,6vw,4.5rem)] font-black leading-[0.95]">
        Delist a show
      </h1>
      <p className="mt-4 max-w-md text-lg text-ink-soft">
        Your show, your call. The show is hidden immediately and the removal
        is logged.
      </p>
      <div className="double-rule mt-8 max-w-md" />
      <DelistForm shows={shows} />
    </main>
  );
}
