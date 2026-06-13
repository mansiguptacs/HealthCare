"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CallRow = {
  id: string;
  region: string | null;
  language: string | null;
  channel: string;
  status: string;
  startedAt: string;
  note: { problemCategory: string | null; severity: string | null } | null;
};

const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-[var(--accent-soft)] text-[var(--accent)]",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  emergency: "bg-red-100 text-red-700",
};

export default function TracePage() {
  const [calls, setCalls] = useState<CallRow[]>([]);

  useEffect(() => {
    fetch("/api/calls")
      .then((r) => r.json())
      .then((d) => setCalls(d.calls ?? []));
  }, []);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Traceability</h1>
      <p className="text-[var(--muted)] mt-1 text-sm mb-6">
        Every call, the note Sakhi built, and a full audit trail of what the AI
        recommended and why.
      </p>

      <div className="card divide-y divide-[var(--border)]">
        {calls.length === 0 && (
          <div className="p-6 text-sm text-[var(--muted)]">
            No calls yet. Try the helpline first.
          </div>
        )}
        {calls.map((c) => (
          <Link
            key={c.id}
            href={`/trace/${c.id}`}
            className="flex items-center justify-between gap-4 p-4 hover:bg-[var(--background)] transition"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-mono text-[var(--muted)]">
                {c.id.slice(0, 8)}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {c.note?.problemCategory ?? "Intake"} ·{" "}
                  {c.region ?? "Unknown area"}
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {c.channel} · {new Date(c.startedAt).toLocaleString()}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {c.note?.severity && (
                <span className={`pill ${SEVERITY_STYLE[c.note.severity] ?? ""}`}>
                  {c.note.severity}
                </span>
              )}
              <span className="pill bg-[var(--background)] text-[var(--muted)] border border-[var(--border)]">
                {c.status}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
