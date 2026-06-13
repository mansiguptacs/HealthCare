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
  const voiceRef = useRef<RealtimeVoiceClient | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const display = history.filter(
    (m) => (m.role === "user" || m.role === "assistant") && m.content,
  );

  const refreshDetails = useCallback(async (id: string) => {
    const res = await fetch(`/api/calls/${id}`);
    if (res.ok) setDetails(await res.json());
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [history, voiceStatus]);

  async function beginCall(selectedMode: "text" | "voice") {
    setBusy(true);
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
      onStatus: (s) => setVoiceStatus(s),
      onError: (e) => setVoiceStatus(`Voice unavailable: ${e}. Switch to text mode below.`),
      onUserTranscript: (t) =>
        setHistory((h) => [...h, { role: "user", content: t }]),
      onAgentTranscript: (t) =>
        setHistory((h) => {
          const last = h[h.length - 1];
          if (last?.role === "assistant") {
            return [...h.slice(0, -1), { ...last, content: (last.content ?? "") + t }];
          }
          return [...h, { role: "assistant", content: t }];
        }),
      onToolCall: () => refreshDetails(id),
    });
    voiceRef.current = client;
    try {
      await client.start();
    } catch (e) {
      setVoiceStatus(
        `${(e as Error).message} Use text mode below to test the full flow.`,
      );
    }
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
    await fetch(`/api/calls/${callId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "ended",
        transcript: display.map((m) => `${m.role}: ${m.content}`).join("\n"),
      }),
    });
    setEnded(true);
    setTimeout(() => refreshDetails(callId), 1500);
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

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 grid lg:grid-cols-[1.4fr_1fr] gap-6">
      <div className="card flex flex-col h-[70vh]">
        <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
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

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {mode === "voice" && (
            <div className="text-center text-xs text-[var(--muted)] py-2">
              {voiceStatus || "Connecting..."}
            </div>
          )}
          {display.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-[var(--primary)] text-white rounded-br-sm"
                    : "bg-[var(--background)] border border-[var(--border)] rounded-bl-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="text-xs text-[var(--muted)]">Sakhi is thinking...</div>
          )}
        </div>

        {mode === "text" && !ended && (
          <div className="border-t border-[var(--border)] p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSend()}
              placeholder="Type what you'd tell the helpline..."
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
        {mode === "voice" && voiceStatus.includes("text mode") && !ended && (
          <div className="border-t border-[var(--border)] p-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSend()}
              placeholder="Type instead..."
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
