"use client";

import { useEffect, useRef, useState } from "react";
import { opsBriefAloudUrl } from "@/lib/base-path";
import { SimBadge } from "./SimBadge";

type PlayState = "idle" | "speaking" | "sim";

export function BriefAloudButton({
  eventId,
  regionId,
  configured,
}: {
  eventId: string;
  regionId: string;
  configured: boolean;
}) {
  const [state, setState] = useState<PlayState>(configured ? "idle" : "sim");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  function stopPlayback() {
    abortRef.current?.abort();
    abortRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }

  useEffect(() => {
    setState(configured ? "idle" : "sim");
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
      const audio = audioRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        audioRef.current = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [eventId, regionId, configured]);

  async function onBrief() {
    if (state === "sim") return;
    if (state === "speaking") {
      stopPlayback();
      setState("idle");
      return;
    }

    setState("speaking");
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch(opsBriefAloudUrl(eventId, regionId), {
        cache: "no-store",
        credentials: "same-origin",
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;

      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      const ttsHeader = (res.headers.get("x-aegisflow-tts") ?? "").toLowerCase();
      if (
        !res.ok ||
        ttsHeader === "sim" ||
        type.includes("application/json") ||
        !type.includes("audio")
      ) {
        stopPlayback();
        setState("sim");
        return;
      }

      const blob = await res.blob();
      if (ac.signal.aborted) return;
      if (!blob.size) {
        stopPlayback();
        setState("sim");
        return;
      }

      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        stopPlayback();
        setState("idle");
      };
      audio.onerror = () => {
        stopPlayback();
        setState("sim");
      };
      await audio.play();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      stopPlayback();
      setState("sim");
    }
  }

  const muted = state === "sim";
  const speaking = state === "speaking";

  return (
    <button
      type="button"
      data-ops-tour="brief-aloud"
      onClick={onBrief}
      disabled={muted}
      aria-label={
        muted ? "Brief aloud unavailable" : speaking ? "Stop brief" : "Brief aloud"
      }
      aria-pressed={speaking}
      title={
        muted
          ? "TTS muted"
          : speaking
            ? "Speaking… click to stop"
            : "Brief aloud"
      }
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
        muted
          ? "cursor-not-allowed border-[#1E2A40] text-[#8B9BB8]"
          : speaking
            ? "border-[#3DB9FF]/50 text-[#3DB9FF]"
            : "border-[#3DB9FF]/40 text-[#3DB9FF] hover:bg-[#3DB9FF]/10"
      }`}
    >
      {muted ? (
        <>
          Brief aloud
          <SimBadge />
        </>
      ) : speaking ? (
        <span aria-live="polite">Speaking…</span>
      ) : (
        "Brief aloud"
      )}
    </button>
  );
}
