"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  countFillers,
  estimateLongestRunSec,
  wordsIn,
} from "@/pipeline/lib/metrics-core";

const MAX_MS = 60_000;
const SLICE_MS = 8_000;

export type ShowRef = { name: string; wpm: number };

type Phase = "idle" | "recording" | "processing" | "result" | "denied" | "error";

type FinalStats = {
  wpm: number;
  fillerRate: number;
  longestRunSec: number;
  words: number;
  seconds: number;
};

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  if (MediaRecorder.isTypeSupported("audio/mp4")) {
    return "audio/mp4";
  }
  return "";
}

export default function YapMeter({ shows }: { shows: ShowRef[] }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [liveWords, setLiveWords] = useState(0);
  const [failedChunks, setFailedChunks] = useState(0);
  const [final, setFinal] = useState<FinalStats | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);

  const phaseRef = useRef<Phase>("idle");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const sliceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const sliceStartedAtRef = useRef(0);
  const textRef = useRef("");
  const pendingRef = useRef(0);
  const mimeRef = useRef("");

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const cleanupMedia = useCallback(() => {
    if (sliceTimerRef.current) clearTimeout(sliceTimerRef.current);
    if (tickerRef.current) clearInterval(tickerRef.current);
    sliceTimerRef.current = null;
    tickerRef.current = null;
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => cleanupMedia, [cleanupMedia]);

  const maybeFinish = useCallback(() => {
    if (phaseRef.current !== "processing" || pendingRef.current > 0) {
      return;
    }
    const text = textRef.current.trim();
    const seconds = Math.max(1, elapsedMsFinal.current / 1000);
    const minutes = seconds / 60;
    const words = wordsIn(text).length;
    setFinal({
      wpm: words / minutes,
      fillerRate: countFillers(text) / minutes,
      longestRunSec: estimateLongestRunSec(text, seconds),
      words,
      seconds,
    });
    setPhase("result");
  }, []);

  const elapsedMsFinal = useRef(0);

  const sendSlice = useCallback(
    async (blob: Blob, durationMs: number) => {
      if (blob.size === 0 || durationMs < 250) return;
      pendingRef.current += 1;
      try {
        const response = await fetch("/api/transcribe-chunk", {
          method: "POST",
          headers: {
            "Content-Type": mimeRef.current.split(";")[0] || "audio/webm",
            "x-audio-duration-ms": String(Math.min(25_000, Math.round(durationMs))),
          },
          body: blob,
        });
        if (response.ok) {
          const data = (await response.json()) as { text?: string };
          if (data.text) {
            textRef.current = `${textRef.current} ${data.text}`.trim();
            setLiveWords(wordsIn(textRef.current).length);
          }
        } else {
          setFailedChunks((n) => n + 1);
        }
      } catch {
        setFailedChunks((n) => n + 1);
      } finally {
        pendingRef.current -= 1;
        maybeFinish();
      }
    },
    [maybeFinish],
  );

  const startSlice = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const recorder = new MediaRecorder(
      stream,
      mimeRef.current ? { mimeType: mimeRef.current } : undefined,
    );
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const durationMs = performance.now() - sliceStartedAtRef.current;
      void sendSlice(
        new Blob(chunks, { type: mimeRef.current || "audio/webm" }),
        durationMs,
      );
      if (phaseRef.current === "recording") {
        startSlice();
      }
    };
    sliceStartedAtRef.current = performance.now();
    recorderRef.current = recorder;
    recorder.start();
    sliceTimerRef.current = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, SLICE_MS);
  }, [sendSlice]);

  const stopRecording = useCallback(() => {
    if (phaseRef.current !== "recording") return;
    elapsedMsFinal.current = performance.now() - startedAtRef.current;
    setPhase("processing");
    phaseRef.current = "processing";
    if (sliceTimerRef.current) clearTimeout(sliceTimerRef.current);
    if (tickerRef.current) clearInterval(tickerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    // If every send already settled, finish now; otherwise sendSlice will.
    setTimeout(maybeFinish, 400);
  }, [maybeFinish]);

  const start = useCallback(async () => {
    setFinal(null);
    setShareUrl(null);
    setFailedChunks(0);
    setLiveWords(0);
    textRef.current = "";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
    } catch {
      setPhase("denied");
      return;
    }
    mimeRef.current = pickMimeType();
    startedAtRef.current = performance.now();
    setElapsedMs(0);
    setPhase("recording");
    phaseRef.current = "recording";
    startSlice();
    tickerRef.current = setInterval(() => {
      const elapsed = performance.now() - startedAtRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_MS) {
        stopRecording();
      }
    }, 200);
  }, [startSlice, stopRecording]);

  const share = useCallback(async () => {
    if (!final || shareBusy) return;
    setShareBusy(true);
    try {
      let url = shareUrl;
      if (!url) {
        const response = await fetch("/api/yap-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wpm: final.wpm,
            filler_rate: final.fillerRate,
            longest_run_estimate_sec: final.longestRunSec,
            words: final.words,
            seconds: final.seconds,
          }),
        });
        if (!response.ok) throw new Error("card failed");
        const data = (await response.json()) as { id: string };
        url = `https://yap-index.speko.dev/yap/${data.id}`;
        setShareUrl(url);
      }
      const beaten = shows.filter((show) => show.wpm < final.wpm).length;
      const text = `My yap speed: ${final.wpm.toFixed(0)} WPM. Faster than ${beaten} of ${shows.length} tech podcasts on The Yap Index.`;
      window.open(
        `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
        "_blank",
        "noopener",
      );
    } catch {
      setPhase("error");
    } finally {
      setShareBusy(false);
    }
  }, [final, shareBusy, shareUrl, shows]);

  const liveMinutes = Math.max(elapsedMs, 1_000) / 60_000;
  const liveWpm = liveWords / liveMinutes;
  const beaten = final
    ? shows.filter((show) => show.wpm < final.wpm).length
    : 0;

  return (
    <div className="mt-10">
      {phase === "idle" && (
        <div>
          <button
            type="button"
            onClick={start}
            className="border-2 border-press bg-press px-6 py-3 text-sm font-bold uppercase tracking-widest text-paper hover:bg-paper hover:text-press"
          >
            Start talking
          </button>
          <p className="mt-3 max-w-sm text-xs text-ink-soft">
            Audio is transcribed and discarded. Nothing is stored unless you
            share.
          </p>
        </div>
      )}

      {phase === "denied" && (
        <div className="max-w-md border border-rule p-6">
          <p className="font-display text-xl font-bold">No microphone, no yap.</p>
          <p className="mt-2 text-sm text-ink-soft">
            Your browser blocked the microphone. Allow mic access and reload,
            or just enjoy the{" "}
            <Link href="/" className="underline underline-offset-2">
              leaderboard
            </Link>
            .
          </p>
        </div>
      )}

      {phase === "recording" && (
        <div>
          <div className="flex items-baseline gap-6">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-press">
              <span className="rec-dot inline-block h-2.5 w-2.5 rounded-full bg-press" />
              Recording
            </span>
            <span className="tnum font-display text-5xl font-black">
              {Math.floor(elapsedMs / 1000)}s
            </span>
            <span className="tnum text-2xl font-bold text-ink-soft">
              {liveWords > 0 ? `${liveWpm.toFixed(0)} wpm` : "..."}
            </span>
          </div>
          <p className="mt-2 text-xs text-ink-soft">
            Keep talking. Sixty seconds max. The meter updates as the
            transcript comes back.
          </p>
          <button
            type="button"
            onClick={stopRecording}
            className="mt-6 border-2 border-ink px-5 py-2 text-sm font-bold uppercase tracking-widest hover:border-press hover:text-press"
          >
            Stop
          </button>
        </div>
      )}

      {phase === "processing" && (
        <p className="font-display text-2xl font-bold">
          Counting your words...
        </p>
      )}

      {phase === "result" && final && (
        <div className="max-w-lg">
          <div className="border-2 border-ink p-6">
            <p className="text-xs font-bold uppercase tracking-widest text-press">
              Your yap card
            </p>
            <div className="mt-3 flex items-baseline gap-3">
              <span className="tnum font-display text-7xl font-black">
                {final.wpm.toFixed(0)}
              </span>
              <span className="text-sm uppercase tracking-widest text-ink-soft">
                words per minute
              </span>
            </div>
            <p className="mt-3 font-display text-lg font-bold">
              You out-yap {beaten} of {shows.length} tech podcasts.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-4 border-t border-rule pt-4 text-sm">
              <div>
                <div className="tnum font-bold">{final.words}</div>
                <div className="text-xs text-ink-soft">words</div>
              </div>
              <div>
                <div className="tnum font-bold">
                  {final.fillerRate.toFixed(1)}
                </div>
                <div className="text-xs text-ink-soft">
                  fillers/min (uncalibrated)
                </div>
              </div>
              <div>
                <div className="tnum font-bold">
                  {final.longestRunSec.toFixed(0)}s
                </div>
                <div className="text-xs text-ink-soft">
                  longest run (estimate)
                </div>
              </div>
            </div>
          </div>
          {failedChunks > 0 && (
            <p className="mt-2 text-xs text-ink-soft">
              {failedChunks} audio chunk(s) did not transcribe; your number may
              read low.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={share}
              disabled={shareBusy}
              className="border-2 border-press bg-press px-5 py-2 text-sm font-bold uppercase tracking-widest text-paper hover:bg-paper hover:text-press disabled:opacity-60"
            >
              {shareBusy ? "Making your card..." : "Share on X"}
            </button>
            <button
              type="button"
              onClick={start}
              className="border-2 border-ink px-5 py-2 text-sm font-bold uppercase tracking-widest hover:border-press hover:text-press"
            >
              Go again
            </button>
          </div>
          {shareUrl && (
            <p className="mt-3 text-xs text-ink-soft">
              Permalink:{" "}
              <a href={shareUrl} className="underline underline-offset-2">
                {shareUrl}
              </a>
            </p>
          )}
          <p className="mt-3 text-xs text-ink-soft">
            Sharing stores only the numbers on the card. Never the audio, never
            the words.
          </p>
        </div>
      )}

      {phase === "error" && (
        <div className="max-w-md border border-rule p-6">
          <p className="font-display text-xl font-bold">That did not work.</p>
          <p className="mt-2 text-sm text-ink-soft">
            Could not save your card. Your numbers are still yours; try again
            in a minute.
          </p>
          <button
            type="button"
            onClick={() => setPhase("result")}
            className="mt-4 border-2 border-ink px-4 py-2 text-xs font-bold uppercase tracking-widest"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
}
