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
import {
  MIC_ERROR_HINT,
  micButtonLabel,
  shouldAutoSpeak,
  speechRecognitionCtor,
  transcriptFromResults,
  type BrowserSpeechRecognition,
  type MicPhase,
} from "@/lib/ask/speech";
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
  const [micPhase, setMicPhase] = useState<MicPhase>("idle");
  const [micSupported, setMicSupported] = useState(true);
  const idRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const questionRef = useRef("");
  const askingRef = useRef(false);
  const speakQuotaRef = useRef(speakQuota);
  const configuredRef = useRef(configured);
  const autoSpeakRef = useRef<string | null>(null);
  const speakTextRef = useRef<(text: string) => Promise<void>>(async () => {});
  const submitRef = useRef<(text: string, voiceOrigin: boolean) => Promise<void>>(
    async () => {},
  );
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const micWantedRef = useRef(false);
  const micFailedRef = useRef(false);
  const openRef = useRef(open);

  questionRef.current = question;
  speakQuotaRef.current = speakQuota;
  configuredRef.current = configured;
  openRef.current = open;

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

  function abortMic() {
    micWantedRef.current = false;
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (!rec) return;
    rec.onstart = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.abort();
    } catch {
      /* already stopped */
    }
  }

  useEffect(() => {
    setMicSupported(speechRecognitionCtor(window) !== null);
  }, []);

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
      abortMic();
      stopPlayback();
      setMicPhase("idle");
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      abortMic();
      stopPlayback();
    };
  }, [open]);

  useEffect(() => {
    if (!openRef.current) {
      autoSpeakRef.current = null;
      stopPlayback();
      setSpeakState(configuredRef.current ? "idle" : "sim");
      return;
    }
    const pending = autoSpeakRef.current;
    const capped = speakUiCapped(speakQuotaRef.current, utcDay());
    const speakNow =
      Boolean(pending) &&
      shouldAutoSpeak({
        voiceOrigin: true,
        configured: configuredRef.current,
        capped,
        answer: pending ?? "",
      });
    if (!speakNow) {
      autoSpeakRef.current = null;
      stopPlayback();
      setSpeakState(configuredRef.current ? "idle" : "sim");
      return;
    }
    stopPlayback();
    const text = pending ?? "";
    // Defer so a Strict Mode effect replay can cancel the first timer
    // without dropping the voice-origin clip.
    const timer = window.setTimeout(() => {
      if (autoSpeakRef.current !== text || !openRef.current) return;
      autoSpeakRef.current = null;
      void speakTextRef.current(text);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [configured, turns.length, open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [turns, asking]);

  const atAskLimit = !canConsumeAsk(askCount);
  const speakCapped = speakUiCapped(speakQuota, utcDay());
  const latest = turns[turns.length - 1];
  const latestReply = latest?.role === "ops" ? latest : null;
  const listening = micPhase === "listening";
  const micLabel = micButtonLabel(micPhase, micSupported);

  async function speakText(text: string) {
    if (!configuredRef.current) {
      setSpeakState("sim");
      return;
    }
    if (speakUiCapped(speakQuotaRef.current, utcDay())) {
      setSpeakState("idle");
      return;
    }
    setSpeakState("speaking");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(opsAskSpeakUrl(), {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
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
          setSpeakState(configuredRef.current ? "idle" : "sim");
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
        setSpeakState(configuredRef.current ? "idle" : "sim");
      };
      audio.onerror = () => {
        stopPlayback();
        setSpeakState("sim");
      };
      const day = utcDay();
      const spokenChars = clipSpeakText(text).length;
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
  speakTextRef.current = speakText;

  async function submitQuestion(raw: string, voiceOrigin: boolean) {
    const q = raw.trim().slice(0, ASK_QUESTION_MAX);
    if (!q || askingRef.current) return;
    if (!canConsumeAsk(askCount)) {
      setHint(ASK_LIMIT_HINT);
      return;
    }
    setHint(null);
    askingRef.current = true;
    setAsking(true);
    const userTurn: Turn = { id: `u${++idRef.current}`, role: "user", text: q };
    setTurns((prev) => [...prev, userTurn]);
    questionRef.current = "";
    setQuestion("");
    try {
      const res = await fetch(opsAskUrl(), {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: q,
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
      const answer = data.answer;
      if (
        openRef.current &&
        shouldAutoSpeak({
          voiceOrigin,
          configured,
          capped: speakUiCapped(speakQuotaRef.current, utcDay()),
          answer,
        })
      ) {
        autoSpeakRef.current = answer;
        setSpeakState("speaking");
      }
      setTurns((prev) => [
        ...prev,
        {
          id: `a${++idRef.current}`,
          role: "ops",
          text: answer,
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
      askingRef.current = false;
      setAsking(false);
    }
  }
  submitRef.current = submitQuestion;

  function onAsk(event: FormEvent) {
    event.preventDefault();
    const voiceOrigin = listening;
    abortMic();
    setMicPhase("idle");
    void submitRef.current(questionRef.current, voiceOrigin);
  }

  function onMic() {
    if (listening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        abortMic();
        setMicPhase("idle");
      }
      return;
    }
    if (askingRef.current || atAskLimit) return;
    const Ctor = speechRecognitionCtor(window);
    if (!Ctor) {
      setMicSupported(false);
      setMicPhase("error");
      setHint(MIC_ERROR_HINT);
      return;
    }

    abortMic();
    stopPlayback();
    setSpeakState(configured ? "idle" : "sim");

    const prior = questionRef.current;
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    recognitionRef.current = rec;
    micWantedRef.current = true;
    micFailedRef.current = false;

    rec.onstart = () => setMicPhase("listening");
    rec.onresult = (event) => {
      const text = transcriptFromResults(event.results).slice(0, ASK_QUESTION_MAX);
      questionRef.current = text;
      setQuestion(text);
    };
    rec.onerror = (event) => {
      const code = event.error ?? "";
      if (code === "aborted") return;
      micFailedRef.current = true;
    };
    rec.onend = () => {
      const heard = questionRef.current.trim();
      const wanted = micWantedRef.current;
      const failed = micFailedRef.current;
      recognitionRef.current = null;
      micWantedRef.current = false;
      if (!wanted) return;
      if (failed || !heard) {
        questionRef.current = prior;
        setQuestion(prior);
        setMicPhase("error");
        setHint(MIC_ERROR_HINT);
        return;
      }
      setMicPhase("idle");
      void submitRef.current(heard, true);
    };

    try {
      rec.start();
      setMicPhase("listening");
    } catch {
      abortMic();
      setMicPhase("error");
      setHint(MIC_ERROR_HINT);
    }
  }

  async function onSpeak() {
    if (speakState === "speaking") {
      stopPlayback();
      setSpeakState(configured ? "idle" : "sim");
      return;
    }
    if (!latestReply || speakState === "sim" || speakCapped) return;
    await speakText(latestReply.text);
  }

  const speakMuted = speakState === "sim" || !configured;
  const speaking = speakState === "speaking";

  if (!open) return null;

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
              onChange={(event) => {
                questionRef.current = event.target.value;
                setQuestion(event.target.value);
                if (micPhase === "error") {
                  setMicPhase("idle");
                  setHint((prev) => (prev === MIC_ERROR_HINT ? null : prev));
                }
              }}
              maxLength={ASK_QUESTION_MAX}
              disabled={asking || atAskLimit}
              readOnly={listening}
              placeholder="Layers, lineage, roles, region, feeds…"
              aria-label="Ask Ops"
              className="min-w-0 flex-1 rounded border border-[#1E2A40] bg-[#0B1220] px-2 py-1 text-[12px] text-[#E8EEF9] outline-none placeholder:text-[#8B9BB8] disabled:opacity-60"
            />
            <button
              type="button"
              onClick={onMic}
              disabled={(!listening && (asking || atAskLimit)) || !micSupported}
              aria-pressed={listening}
              aria-label={
                !micSupported
                  ? MIC_ERROR_HINT
                  : listening
                    ? "Stop listening"
                    : micPhase === "error"
                      ? MIC_ERROR_HINT
                      : "Mic"
              }
              title={!micSupported || micPhase === "error" ? MIC_ERROR_HINT : listening ? "Listening…" : "Mic"}
              className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${
                !micSupported
                  ? "cursor-not-allowed border-[#1E2A40] text-[#8B9BB8]"
                  : listening
                    ? "border-[#3DB9FF] text-[#3DB9FF]"
                    : micPhase === "error"
                      ? "border-[#FF4D2E]/70 text-[#FF4D2E]"
                      : "border-[#3DB9FF]/45 text-[#3DB9FF] hover:bg-[#3DB9FF]/10 disabled:cursor-not-allowed disabled:opacity-50"
              }`}
            >
              {listening ? (
                <span
                  className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#3DB9FF]"
                  aria-hidden="true"
                />
              ) : null}
              <span aria-live="polite">{micLabel}</span>
              {!micSupported ? <SimBadge /> : null}
            </button>
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
