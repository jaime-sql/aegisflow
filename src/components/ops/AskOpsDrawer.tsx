"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { IncidentEvent } from "@/lib/schema";
import { opsAskSpeakUrl, opsAskUrl } from "@/lib/base-path";
import { ASK_QUESTION_MAX } from "@/lib/ask/help";
import {
  ASK_LIMIT_HINT,
  ASK_SESSION_LIMIT,
  SPEAK_DAILY_CHAR_LIMIT,
  SPEAK_DAILY_LIMIT,
  SPEAK_LIMIT_HINT,
  canConsumeAsk,
  clipSpeakText,
  consumeSpeak,
  readAskCount,
  readSpeakQuota,
  speakUiCapped,
  stricterSpeakQuota,
  utcDay,
  type SpeakQuota,
} from "@/lib/ask/limits";
import { loadAskCount, loadSpeakQuota, saveAskCount, saveSpeakQuota } from "@/lib/ask/storage";
import { SimBadge } from "./SimBadge";

type Turn = {
  id: string;
  role: "user" | "ops";
  text: string;
  sim?: boolean;
  model?: string | null;
};

type AskPayload = {
  ok?: boolean;
  sim?: boolean;
  limited?: boolean;
  model?: string | null;
  answer?: string;
  hint?: string;
};

export function AskOpsDrawer({
  open,
  incident,
  configured,
  onClose,
}: {
  open: boolean;
  incident: Pick<IncidentEvent, "name" | "region" | "agents">;
  configured: boolean;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const [askCount, setAskCount] = useState(0);
  const [speakQuota, setSpeakQuota] = useState<SpeakQuota>(() => emptyDay());
  const [hint, setHint] = useState<string | null>(null);
  const [speakState, setSpeakState] = useState<"idle" | "speaking" | "sim">(
    configured ? "idle" : "sim",
  );
  const idRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

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
    if (!open) return;
    const day = utcDay();
    const asks = Math.max(loadAskCount(), readAskCount(document.cookie));
    const spoken = stricterSpeakQuota(
      loadSpeakQuota(day),
      readSpeakQuota(document.cookie, day),
      day,
    );
    setAskCount(asks);
    setSpeakQuota(spoken);
    saveAskCount(asks);
    saveSpeakQuota(spoken);
  }, [open]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      stopPlayback();
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stopPlayback();
    };
  }, [open]);

  useEffect(() => {
    setSpeakState(configured ? "idle" : "sim");
    stopPlayback();
  }, [configured, turns.length]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, asking]);

  if (!open) return null;

  const atAskLimit = !canConsumeAsk(askCount);
  const speakCapped = speakUiCapped(speakQuota, utcDay());
  const latest = turns[turns.length - 1];
  const latestReply = latest?.role === "ops" ? latest : null;

  async function onAsk(event: FormEvent) {
    event.preventDefault();
    const q = question.trim();
    if (!q || asking) return;
    if (atAskLimit) {
      setHint(ASK_LIMIT_HINT);
      return;
    }
    setHint(null);
    setAsking(true);
    const userTurn: Turn = { id: `u${++idRef.current}`, role: "user", text: q };
    setTurns((prev) => [...prev, userTurn]);
    setQuestion("");
    try {
      const res = await fetch(opsAskUrl(), {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: q.slice(0, ASK_QUESTION_MAX),
          regionId: incident.region.id,
          agents: incident.agents.slice(0, 3).map((agent) => ({
            title: agent.title,
            summary: agent.summary,
          })),
        }),
      });
      const data = (await res.json()) as AskPayload;
      if (data.limited) {
        setAskCount(ASK_SESSION_LIMIT);
        saveAskCount(ASK_SESSION_LIMIT);
        setHint(data.hint || ASK_LIMIT_HINT);
        return;
      }
      if (!data.ok || !data.answer) {
        setHint(data.answer || data.hint || "Ask unavailable — try again.");
        return;
      }
      setTurns((prev) => [
        ...prev,
        {
          id: `a${++idRef.current}`,
          role: "ops",
          text: data.answer!,
          sim: Boolean(data.sim),
          model: data.model ?? null,
        },
      ]);
      setAskCount((prev) => {
        const next = Math.min(ASK_SESSION_LIMIT, prev + 1);
        saveAskCount(next);
        return next;
      });
    } catch {
      setHint("Ask unavailable — try again.");
    } finally {
      setAsking(false);
    }
  }

  async function onSpeak() {
    if (speakState === "speaking") {
      stopPlayback();
      setSpeakState(configured ? "idle" : "sim");
      return;
    }
    if (!latestReply || speakState === "sim" || speakCapped) return;
    setSpeakState("speaking");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(opsAskSpeakUrl(), {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: latestReply.text }),
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
        let limited = false;
        if (type.includes("application/json")) {
          const data = (await res.json()) as { limited?: boolean };
          limited = Boolean(data.limited);
        }
        if (limited) {
          const capped: SpeakQuota = {
            day: utcDay(),
            speaks: SPEAK_DAILY_LIMIT,
            chars: SPEAK_DAILY_CHAR_LIMIT,
          };
          setSpeakQuota(capped);
          saveSpeakQuota(capped);
          setSpeakState(configured ? "idle" : "sim");
          return;
        }
        setSpeakState("sim");
        return;
      }
      const blob = await res.blob();
      if (ac.signal.aborted) return;
      if (!blob.size) {
        stopPlayback();
        setSpeakState("sim");
        return;
      }
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        stopPlayback();
        setSpeakState(configured ? "idle" : "sim");
      };
      audio.onerror = () => {
        stopPlayback();
        setSpeakState("sim");
      };
      const day = utcDay();
      const spokenChars = clipSpeakText(latestReply.text).length;
      setSpeakQuota((prev) => {
        const next = consumeSpeak(prev, spokenChars, day);
        saveSpeakQuota(next);
        return next;
      });
      await audio.play();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      stopPlayback();
      setSpeakState("sim");
    }
  }

  const speakMuted = speakState === "sim" || !configured;
  const speaking = speakState === "speaking";

  return (
    <div className="absolute inset-0 z-[800]">
      <button
        type="button"
        aria-label="Close Ask Ops"
        className="absolute inset-0 cursor-default bg-transparent"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="ask-ops-title"
        className="absolute inset-y-0 right-0 flex w-[min(92vw,400px)] flex-col border-l border-[#1E2A40] bg-[#121A2B] shadow-2xl lg:w-[35%] lg:min-w-[340px] lg:max-w-[520px]"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#1E2A40] px-3 py-2">
          <div className="min-w-0">
            <h2 id="ask-ops-title" className="text-sm font-semibold text-[#E8EEF9]">
              Ask Ops
            </h2>
            <p className="truncate font-mono text-[10px] text-[#8B9BB8]">{incident.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="font-mono text-[11px] text-[#8B9BB8] hover:text-[#E8EEF9]"
          >
            X
          </button>
        </div>

        <div ref={listRef} className="ops-scroll flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {turns.length === 0 ? (
            <p className="text-[12px] leading-relaxed text-[#8B9BB8]">
              This incident, plus how to use Ops — layers, lineage, roles, region, and feeds.
            </p>
          ) : null}
          {turns.map((turn, index) => {
            const isLatestReply = turn.role === "ops" && index === turns.length - 1;
            return (
              <div key={turn.id} className={turn.role === "user" ? "text-right" : ""}>
                <p
                  className={`inline-block max-w-full rounded px-2 py-1.5 text-left text-[12px] leading-relaxed ${
                    turn.role === "user"
                      ? "bg-[#0B1220] text-[#E8EEF9]"
                      : "text-[#E8EEF9]"
                  }`}
                >
                  {turn.text}
                </p>
                {turn.role === "ops" ? (
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {turn.sim ? <SimBadge /> : null}
                    {!turn.sim && turn.model ? (
                      <span className="font-mono text-[9px] text-[#8B9BB8]">{turn.model}</span>
                    ) : null}
                    {isLatestReply ? (
                      <button
                        type="button"
                        onClick={onSpeak}
                        disabled={(speakMuted || speakCapped) && !speaking}
                        aria-label={
                          speakCapped
                            ? SPEAK_LIMIT_HINT
                            : speakMuted
                              ? "Speak answer unavailable"
                              : speaking
                                ? "Stop speak"
                                : "Speak answer"
                        }
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                          speakMuted || speakCapped
                            ? "cursor-not-allowed border-[#1E2A40] text-[#8B9BB8]"
                            : speaking
                              ? "border-[#3DB9FF]/50 text-[#3DB9FF]"
                              : "border-[#3DB9FF]/40 text-[#3DB9FF] hover:bg-[#3DB9FF]/10"
                        }`}
                      >
                        {speakMuted ? (
                          <>
                            Speak answer
                            <SimBadge />
                          </>
                        ) : speaking ? (
                          <span aria-live="polite">Speaking…</span>
                        ) : (
                          "Speak answer"
                        )}
                      </button>
                    ) : null}
                    {isLatestReply && speakCapped ? (
                      <span className="font-mono text-[10px] text-[#8B9BB8]">{SPEAK_LIMIT_HINT}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          {asking ? (
            <p className="font-mono text-[10px] text-[#8B9BB8]" aria-live="polite">
              Asking…
            </p>
          ) : null}
        </div>

        <form onSubmit={onAsk} className="shrink-0 border-t border-[#1E2A40] px-3 py-2">
          {atAskLimit ? (
            <p className="mb-1 font-mono text-[10px] text-[#8B9BB8]" aria-live="polite">
              {ASK_LIMIT_HINT}
            </p>
          ) : hint ? (
            <p className="mb-1 font-mono text-[10px] text-[#8B9BB8]" aria-live="polite">
              {hint}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={ASK_QUESTION_MAX}
              disabled={asking || atAskLimit}
              placeholder="Layers, lineage, roles, region, feeds…"
              aria-label="Ask Ops"
              className="min-w-0 flex-1 rounded border border-[#1E2A40] bg-[#0B1220] px-2 py-1 text-[12px] text-[#E8EEF9] outline-none placeholder:text-[#8B9BB8] disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={asking || atAskLimit || !question.trim()}
              className="shrink-0 rounded border border-[#3DB9FF]/45 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#3DB9FF] hover:bg-[#3DB9FF]/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Ask
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function emptyDay(): SpeakQuota {
  return { day: utcDay(), speaks: 0, chars: 0 };
}
