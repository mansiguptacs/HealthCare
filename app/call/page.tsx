"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RealtimeVoiceClient } from "@/lib/voice/realtimeClient";

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: unknown[];
  tool_call_id?: string;
};

type CallDetails = {
  call: { id: string; status: string; channel: string };
  note: {
    problemCategory: string | null;
    summary: string | null;
    severity: string | null;
    structuredSymptoms: Record<string, unknown> | null;
  } | null;
  recommendations: { id: string; type: string; rank: number; payload: Record<string, unknown> }[];
  audit: { action: string; toolName: string | null; createdAt: string }[];
};

const REC_LABEL: Record<string, string> = {
  first_aid: "First aid",
  clinic_referral: "Clinic referral",
  mobile_clinic: "Mobile camp",
  ngo_waitlist: "NGO waitlist",
};

const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-[var(--accent-soft)] text-[var(--accent)]",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  emergency: "bg-red-100 text-red-700",
};

export default function CallPage() {
  const [callId, setCallId] = useState<string | null>(null);
  const [mode, setMode] = useState<"text" | "voice">("text");
  const [started, setStarted] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<CallDetails | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string>("");
  const [ended, setEnded] = useState(false);
  // Tracks the sentence Sakhi is currently speaking (cleared on turn boundary)
  const [liveCaption, setLiveCaption] = useState<string>("");
  const voiceRef = useRef<RealtimeVoiceClient | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // True right after a turn boundary — the next text begins a fresh caption.
  const newTurnRef = useRef(true);
  // Latest history, kept in a ref so teardown callbacks never read stale state.
  const historyRef = useRef<ChatMessage[]>([]);
  // Guards against finalizing/persisting the call more than once.
  const endedRef = useRef(false);

  const display = history.filter(
    (m) => m.role === "user" || m.role === "assistant",
  );

  const refreshDetails = useCallback(async (id: string) => {
    const res = await fetch(`/api/calls/${id}`);
    if (res.ok) setDetails(await res.json());
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [history, voiceStatus]);

  useEffect(() => {
    historyRef.current = history;
  }, [history]);

  /** Persist the call as ended and flip the UI to the post-call state. Idempotent. */
  const finalizeCall = useCallback(
    async (id: string) => {
      if (endedRef.current) return;
      endedRef.current = true;
      setEnded(true);
      const transcript = historyRef.current
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");
      await fetch(`/api/calls/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ended", transcript }),
      }).catch(() => {});
      setTimeout(() => refreshDetails(id), 1200);
    },
    [refreshDetails],
  );

  async function beginCall(selectedMode: "text" | "voice") {
    setBusy(true);
    endedRef.current = false;
    newTurnRef.current = true;
    const res = await fetch("/api/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: selectedMode }),
    });
    const data = await res.json();
    const id = data.call.id as string;
    setCallId(id);
    setMode(selectedMode);
    setStarted(true);
    setBusy(false);

    if (selectedMode === "text") {
      await sendTurn(id, [
        { role: "user", content: "(call connected)" },
      ]);
    } else {
      startVoice(id);
    }
  }

  async function startVoice(id: string) {
    const client = new RealtimeVoiceClient(id, {
      onStatus: (s) => {
        setVoiceStatus(s);
        if (s.startsWith("Speaking") || s.startsWith("Connected")) {
          ensureAssistantBubble();
        }
        // When user starts speaking (Thinking = speech detected), clear the
        // previous caption so the card is ready for the next Sakhi turn.
        if (s.toLowerCase().includes("thinking")) {
          setLiveCaption("");
        }
      },
      onError: (e) => {
        setVoiceStatus(`Voice error: ${e}`);
      },
      onUserTranscript: (t) => {
        const text = t.trim();
        if (!text) return;
        setHistory((h) => {
          const last = h[h.length - 1];
          // xAI can emit several transcription.completed events for one utterance,
          // each with growing cumulative text and a fresh item_id. Rather than
          // appending each chunk as a new line, update the current user bubble
          // in place whenever the new text continues (or duplicates) it.
          if (last?.role === "user" && last.content) {
            const prev = last.content.trim();
            if (text === prev || text.startsWith(prev) || prev.startsWith(text)) {
              const merged = text.length >= prev.length ? text : prev;
              if (merged === prev) return h;
              return [...h.slice(0, -1), { ...last, content: merged }];
            }
          }
          return [...h, { role: "user", content: text }];
        });
        refreshDetails(id);
      },
      onAgentTranscript: (t) => {
        // "\n" = turn boundary — freeze the current bubble, mark next as new turn.
        if (t === "\n") {
          newTurnRef.current = true;
          setHistory((h) => {
            const last = h[h.length - 1];
            if (last?.role === "assistant" && last.content?.trim()) {
              return [...h, { role: "assistant", content: "" }];
            }
            return h;
          });
          if (callId) refreshDetails(callId);
          return;
        }

        // "__FULL__..." = complete text for this turn (single emit from the client).
        if (t.startsWith("__FULL__")) {
          const text = t.slice(8);
          newTurnRef.current = false;
          setLiveCaption(text);
          setHistory((h) => {
            const last = h[h.length - 1];
            if (last?.role === "assistant") {
              return [...h.slice(0, -1), { ...last, content: text }];
            }
            return [...h, { role: "assistant", content: text }];
          });
          if (callId) refreshDetails(callId);
          return;
        }

        // Streaming delta. If this is the first text of a new turn, start a
        // fresh caption (don't append to the previous turn's text).
        const isNewTurn = newTurnRef.current;
        newTurnRef.current = false;
        setLiveCaption((prev) => (isNewTurn ? t : prev + t));
        setHistory((h) => {
          const last = h[h.length - 1];
          // Append to the current (empty or in-progress) assistant bubble.
          if (last?.role === "assistant") {
            const base = isNewTurn && last.content?.trim() ? "" : (last.content ?? "");
            return [...h.slice(0, -1), { ...last, content: base + t }];
          }
          return [...h, { role: "assistant", content: t }];
        });
        if (callId) refreshDetails(callId);
      },
      onToolCall: () => refreshDetails(id),
      onEnd: (reason) => {
        console.log("[voice] call ended:", reason);
        setVoiceStatus("Call ended.");
        setLiveCaption("");
        void finalizeCall(id);
      },
    });
    voiceRef.current = client;
    try {
      await client.start();
    } catch (e) {
      setVoiceStatus(
        `Could not start voice: ${(e as Error).message}. Use text intake below.`,
      );
    }
  }

  /** Pre-seed an empty assistant bubble so text streams in visibly from the start. */
  function ensureAssistantBubble() {
    setHistory((h) => {
      const last = h[h.length - 1];
      if (last?.role === "assistant") return h;
      return [...h, { role: "assistant", content: "" }];
    });
  }

  async function sendTurn(id: string, newHistory: ChatMessage[]) {
    setBusy(true);
    setHistory(newHistory);
    const res = await fetch(`/api/calls/${id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: newHistory }),
    });
    if (res.ok) {
      const data = (await res.json()) as { appended: ChatMessage[] };
      setHistory([...newHistory, ...data.appended]);
    }
    await refreshDetails(id);
    setBusy(false);
  }

  async function onSend() {
    if (!callId || !input.trim() || busy) return;
    const next: ChatMessage[] = [...history, { role: "user", content: input.trim() }];
    setInput("");
    await sendTurn(callId, next);
  }

  async function endCall() {
    if (!callId) return;
    voiceRef.current?.stop();
    await finalizeCall(callId);
  }

  if (!started) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <div className="card p-8 sm:p-12 text-center">
          <div className="mx-auto grid place-items-center w-16 h-16 rounded-full bg-[var(--primary-soft)] text-[var(--primary)] text-2xl font-bold">
            ☎
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight">
            You&apos;ve reached Sakhi
          </h1>
          <p className="mt-3 text-[var(--muted)] max-w-md mx-auto">
            This line is free and completely confidential. Speak in your own
            language. We&apos;re here to listen and help - without judgment.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => beginCall("voice")}
              disabled={busy}
              className="px-6 py-3 rounded-xl bg-[var(--primary)] text-white font-semibold hover:opacity-90 transition disabled:opacity-50"
            >
              Start voice call
            </button>
            <button
              onClick={() => beginCall("text")}
              disabled={busy}
              className="px-6 py-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] font-semibold hover:bg-[var(--background)] transition disabled:opacity-50"
            >
              Use text intake
            </button>
          </div>
          <p className="mt-4 text-xs text-[var(--muted)]">
            Voice uses Grok Voice (needs an xAI key). Text intake works
            everywhere and exercises the same triage and tools.
          </p>
        </div>
      </div>
    );
  }

  const isSpeaking =
    voiceStatus.toLowerCase().includes("speak") ||
    voiceStatus.toLowerCase().includes("greeting") ||
    voiceStatus.toLowerCase().includes("chunk");

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 grid lg:grid-cols-[1.4fr_1fr] gap-6">
      <div className="card flex flex-col h-[85vh]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-60" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--primary)]" />
            </span>
            <span className="font-semibold text-sm">
              {mode === "voice" ? "Voice call with Sakhi" : "Talking to Sakhi"}
            </span>
          </div>
          {!ended ? (
            <button
              onClick={endCall}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--danger)] text-white hover:opacity-90"
            >
              End call
            </button>
          ) : (
            <Link
              href={`/trace/${callId}`}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white hover:opacity-90"
            >
              View trace
            </Link>
          )}
        </div>

        {/* ── Live caption card (voice mode) ─────────────────────────────── */}
        {mode === "voice" && (
          <div className={`shrink-0 mx-4 mt-4 rounded-2xl px-5 py-4 border transition-all duration-300 ${
            isSpeaking
              ? "bg-[var(--primary-soft)] border-[var(--primary)]/30 shadow-sm"
              : liveCaption
              ? "bg-[var(--surface)] border-[var(--border)]"
              : "bg-[var(--surface)] border-[var(--border)]"
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {isSpeaking ? (
                <span className="flex gap-[3px] items-end h-4">
                  {[0, 80, 160, 80, 0].map((delay, i) => (
                    <span
                      key={i}
                      className="w-[3px] rounded-full bg-[var(--primary)] animate-bounce"
                      style={{ animationDelay: `${delay}ms`, height: i % 2 === 0 ? "8px" : "14px" }}
                    />
                  ))}
                </span>
              ) : (
                <span className={`w-2 h-2 rounded-full ${liveCaption ? "bg-[var(--primary)]" : "bg-[var(--muted)]"}`} />
              )}
              <span className={`text-[11px] font-bold uppercase tracking-widest ${
                isSpeaking || liveCaption ? "text-[var(--primary)]" : "text-[var(--muted)]"
              }`}>
                {isSpeaking ? "Sakhi is speaking" : liveCaption ? "Sakhi said" : voiceStatus || "Connecting…"}
              </span>
            </div>

            {/* Text content: show liveCaption if available, else show animated
                dots while audio plays (transcript arrives after audio on xAI) */}
            {liveCaption ? (
              <p className="text-base leading-relaxed font-medium text-[var(--foreground)]">
                {liveCaption}
              </p>
            ) : isSpeaking ? (
              <span className="flex gap-1.5 items-center mt-1">
                <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-[var(--primary)] animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            ) : (
              <p className="text-sm text-[var(--muted)] italic min-h-[1.5rem]">
                {voiceStatus || "Waiting for Sakhi…"}
              </p>
            )}
          </div>
        )}

        {/* ── Scrolling transcript ────────────────────────────────────────── */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {mode === "voice" && <VoiceStatusBar status={voiceStatus} />}

          {display.map((m, i) => {
            const isSakhi = m.role === "assistant";
            return (
              <div key={i} className="space-y-0.5">
                <div className={`text-[10px] font-bold uppercase tracking-widest ${
                  isSakhi ? "text-[var(--primary)]" : "text-[var(--accent)]"
                }`}>
                  {isSakhi ? "Sakhi" : "You"}
                </div>
                <div className={`text-sm leading-relaxed ${
                  isSakhi ? "text-[var(--foreground)]" : "text-[var(--muted)]"
                }`}>
                  {m.content ? m.content : (
                    <span className="flex gap-1 items-center text-[var(--muted)]">
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {busy && (
            <div className="space-y-0.5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[var(--primary)]">Sakhi</div>
              <span className="flex gap-1 items-center text-[var(--muted)]">
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          )}
        </div>

        {/* Text input (text mode, or voice fallback on error) */}
        {(mode === "text" || (mode === "voice" && voiceStatus.toLowerCase().includes("error"))) && !ended && (
          <div className="border-t border-[var(--border)] p-3 flex gap-2 shrink-0">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSend()}
              placeholder={mode === "text" ? "Type what you'd tell the helpline…" : "Type instead…"}
              className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            />
            <button
              onClick={onSend}
              disabled={busy}
              className="px-5 py-2.5 rounded-xl bg-[var(--primary)] text-white font-semibold text-sm disabled:opacity-50"
            >
              Send
            </button>
          </div>
        )}
      </div>

      <LivePanel details={details} />
    </div>
  );
}

function VoiceStatusBar({ status }: { status: string }) {
  const isListening = status.toLowerCase().includes("listening");
  const isSpeaking = status.toLowerCase().includes("speak") || status.toLowerCase().includes("greeting") || status.toLowerCase().includes("chunk");
  const isThinking = status.toLowerCase().includes("think") || status.toLowerCase().includes("running") || status.toLowerCase().includes("config");
  const isError = status.toLowerCase().includes("error") || status.toLowerCase().includes("disconnected");

  const dot = isListening
    ? "bg-[var(--primary)]"
    : isSpeaking
    ? "bg-[var(--accent)]"
    : isThinking
    ? "bg-amber-500"
    : isError
    ? "bg-[var(--danger)]"
    : "bg-[var(--muted)]";

  return (
    <div className="flex items-center gap-2 text-xs text-[var(--muted)] pb-2 border-b border-[var(--border)] mb-1">
      <span className={`relative flex h-2 w-2 shrink-0`}>
        {(isListening || isSpeaking) && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dot} opacity-60`} />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${dot}`} />
      </span>
      <span>{status || "Connecting..."}</span>
    </div>
  );
}

function LivePanel({ details }: { details: CallDetails | null }) {
  const note = details?.note;
  return (
    <div className="card p-5 h-[70vh] overflow-y-auto">
      <h2 className="font-semibold text-sm text-[var(--muted)] uppercase tracking-wide">
        What Sakhi captured
      </h2>

      <div className="mt-4">
        <div className="text-xs text-[var(--muted)] mb-1">Severity</div>
        {note?.severity ? (
          <span className={`pill ${SEVERITY_STYLE[note.severity] ?? ""}`}>
            {note.severity}
          </span>
        ) : (
          <span className="text-sm text-[var(--muted)]">Assessing...</span>
        )}
      </div>

      <div className="mt-4">
        <div className="text-xs text-[var(--muted)] mb-1">Problem</div>
        <div className="text-sm">{note?.problemCategory ?? "—"}</div>
        {note?.summary && (
          <p className="text-sm text-[var(--muted)] mt-1">{note.summary}</p>
        )}
      </div>

      {note?.structuredSymptoms &&
        Object.keys(note.structuredSymptoms).length > 0 && (
          <div className="mt-4">
            <div className="text-xs text-[var(--muted)] mb-1">Notes</div>
            <ul className="space-y-1 text-sm">
              {Object.entries(note.structuredSymptoms).map(([k, v]) => (
                <li key={k} className="flex gap-2">
                  <span className="text-[var(--muted)]">{k}:</span>
                  <span>{String(v)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

      <div className="mt-5">
        <div className="text-xs text-[var(--muted)] mb-2">
          Recommendations (traceable)
        </div>
        {details?.recommendations.length ? (
          <ol className="space-y-2">
            {details.recommendations.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-[var(--border)] p-2.5 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {r.rank}. {REC_LABEL[r.type] ?? r.type}
                  </span>
                </div>
                <p className="text-[var(--muted)] text-xs mt-1">
                  {String(
                    r.payload.guidance ??
                      r.payload.clinicName ??
                      (r.payload.waitlistEntryId ? "Added to NGO waitlist" : ""),
                  )}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-[var(--muted)]">No recommendations yet.</p>
        )}
      </div>
    </div>
  );
}
