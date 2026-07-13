"use client";

import { useState } from "react";

type ShowOption = { slug: string; name: string };

export default function DelistForm({ shows }: { shows: ShowOption[] }) {
  const [slug, setSlug] = useState(shows[0]?.slug ?? "");
  const [reason, setReason] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    "idle",
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!slug || state === "busy") return;
    setState("busy");
    try {
      const response = await fetch("/api/delist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show_slug: slug, reason: reason || null }),
      });
      setState(response.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div className="mt-8 max-w-md border-2 border-ink p-6">
        <p className="font-display text-xl font-bold">Done.</p>
        <p className="mt-2 text-sm text-ink-soft">
          The show is hidden immediately and the removal is logged. Thanks for
          telling us instead of subtweeting us.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 max-w-md space-y-4">
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-widest text-ink-soft">
          Show
        </span>
        <select
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          className="mt-1 w-full border-2 border-ink bg-paper px-3 py-2"
        >
          {shows.map((show) => (
            <option key={show.slug} value={show.slug}>
              {show.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-widest text-ink-soft">
          Reason (optional)
        </span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={2000}
          className="mt-1 w-full border-2 border-ink bg-paper px-3 py-2"
          placeholder="Anything you want on the record."
        />
      </label>
      <button
        type="submit"
        disabled={state === "busy"}
        className="border-2 border-press bg-press px-5 py-2 text-sm font-bold uppercase tracking-widest text-paper hover:bg-paper hover:text-press disabled:opacity-60"
      >
        {state === "busy" ? "Working..." : "Delist the show"}
      </button>
      {state === "error" && (
        <p className="text-sm text-press">
          That did not go through. Try once more in a minute.
        </p>
      )}
    </form>
  );
}
