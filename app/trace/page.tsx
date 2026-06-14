"use client";

import { useEffect, useMemo, useState } from "react";
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

const SEVERITY_ORDER: Record<string, number> = {
  emergency: 4,
  high: 3,
  medium: 2,
  low: 1,
};

type SortKey = "recent" | "severity";

export default function TracePage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("recent");

  useEffect(() => {
    let active = true;
    const load = async () => {
      const d = await fetch("/api/calls").then((r) => r.json());
      if (active) {
        setCalls(d.calls ?? []);
        setLoading(false);
      }
    };
    load();
    const t = setInterval(load, 6000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  const severities = useMemo(
    () =>
      [...new Set(calls.map((c) => c.note?.severity).filter(Boolean))] as string[],
    [calls],
  );
  const statuses = useMemo(
    () => [...new Set(calls.map((c) => c.status).filter(Boolean))],
    [calls],
  );

  const filtered = useMemo(() => {
    let rows = calls;
    if (query.trim()) {
      const q = query.toLowerCase();
      rows = rows.filter(
        (c) =>
          (c.region ?? "").toLowerCase().includes(q) ||
          (c.note?.problemCategory ?? "").toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q),
      );
    }
    if (severity) rows = rows.filter((c) => c.note?.severity === severity);
    if (status) rows = rows.filter((c) => c.status === status);
    rows = [...rows].sort((a, b) => {
      if (sort === "severity") {
        const d =
          (SEVERITY_ORDER[b.note?.severity ?? ""] ?? 0) -
          (SEVERITY_ORDER[a.note?.severity ?? ""] ?? 0);
        if (d !== 0) return d;
      }
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
    });
    return rows;
  }, [calls, query, severity, status, sort]);

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Traceability</h1>
          <p className="text-[var(--muted)] mt-1 text-sm">
            Every call, the note Sakhi built, and a full audit trail of what the
            AI recommended and why.
          </p>
        </div>
        <span className="flex items-center gap-2 text-xs text-[var(--muted)] whitespace-nowrap mt-1">
          <span className="live-dot" />
          Live
        </span>
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search area, category, or ID…"
          className="flex-1 min-w-[200px] rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-[var(--surface)]"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-[var(--surface)]"
        >
          <option value="recent">Most recent</option>
          <option value="severity">Highest severity</option>
        </select>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="chip"
          data-active={!severity && !status}
          onClick={() => {
            setSeverity(null);
            setStatus(null);
          }}
        >
          All
        </button>
        {severities
          .sort((a, b) => (SEVERITY_ORDER[b] ?? 0) - (SEVERITY_ORDER[a] ?? 0))
          .map((s) => (
            <button
              key={s}
              className="chip capitalize"
              data-active={severity === s}
              onClick={() => setSeverity((cur) => (cur === s ? null : s))}
            >
              {s}
            </button>
          ))}
        {statuses.length > 0 && <span className="mx-1 h-4 w-px bg-[var(--border)]" />}
        {statuses.map((s) => (
          <button
            key={s}
            className="chip capitalize"
            data-active={status === s}
            onClick={() => setStatus((cur) => (cur === s ? null : s))}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="text-xs text-[var(--muted)] mt-3 mb-2">
        {loading
          ? "Loading…"
          : `${filtered.length} of ${calls.length} call${calls.length === 1 ? "" : "s"}`}
      </div>

      <div className="card divide-y divide-[var(--border)]">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 flex items-center justify-between">
              <div className="flex-1">
                <div className="skeleton h-4 w-1/2 mb-2" />
                <div className="skeleton h-3 w-1/3" />
              </div>
              <div className="skeleton h-5 w-16 rounded-full" />
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--muted)]">
            {calls.length === 0
              ? "No calls yet. Try the helpline first."
              : "No calls match your filters."}
          </div>
        ) : (
          filtered.map((c) => (
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
                  <div className="text-sm font-medium truncate capitalize">
                    {(c.note?.problemCategory ?? "Intake").replace(/_/g, " ")} ·{" "}
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
          ))
        )}
      </div>
    </div>
  );
}
