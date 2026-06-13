"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";

type TraceData = {
  call: {
    id: string;
    region: string | null;
    language: string | null;
    channel: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
  };
  note: {
    problemCategory: string | null;
    summary: string | null;
    severity: string | null;
    structuredSymptoms: Record<string, unknown> | null;
  } | null;
  recommendations: {
    id: string;
    type: string;
    rank: number;
    payload: Record<string, unknown>;
    modelVersion: string | null;
    createdAt: string;
  }[];
  audit: {
    id: string;
    actor: string;
    action: string;
    toolName: string | null;
    inputs: Record<string, unknown> | null;
    outputs: Record<string, unknown> | null;
    createdAt: string;
  }[];
};

const REC_LABEL: Record<string, string> = {
  first_aid: "First aid",
  clinic_referral: "Clinic referral",
  mobile_clinic: "Mobile camp",
  ngo_waitlist: "NGO waitlist",
};

const ACTOR_STYLE: Record<string, string> = {
  grok: "bg-[var(--primary-soft)] text-[var(--primary)]",
  inngest: "bg-[var(--accent-soft)] text-[var(--accent)]",
  ngo: "bg-amber-100 text-amber-700",
  system: "bg-[var(--background)] text-[var(--muted)]",
};

export default function TraceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<TraceData | null>(null);

  useEffect(() => {
    const load = () =>
      fetch(`/api/calls/${id}`)
        .then((r) => r.json())
        .then(setData);
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [id]);

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-8 text-sm text-[var(--muted)]">
        Loading...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <Link href="/trace" className="text-sm text-[var(--muted)] hover:underline">
        ← All calls
      </Link>

      <div className="card p-6 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">
              {data.note?.problemCategory ?? "Intake"} ·{" "}
              {data.call.region ?? "Unknown area"}
            </h1>
            <p className="text-xs text-[var(--muted)] mt-1 font-mono">
              {data.call.id}
            </p>
          </div>
          <div className="flex gap-2">
            {data.note?.severity && (
              <span className="pill bg-red-100 text-red-700">
                {data.note.severity}
              </span>
            )}
            <span className="pill bg-[var(--background)] text-[var(--muted)] border border-[var(--border)]">
              {data.call.status}
            </span>
          </div>
        </div>
        {data.note?.summary && (
          <p className="text-sm mt-3 text-[var(--foreground)]">
            {data.note.summary}
          </p>
        )}
        <div className="text-xs text-[var(--muted)] mt-2">
          Language: {data.call.language ?? "—"} · Channel: {data.call.channel} ·
          Started {new Date(data.call.startedAt).toLocaleString()}
        </div>
      </div>

      <h2 className="font-semibold mt-8 mb-3">Recommendations (ordered)</h2>
      <div className="space-y-2">
        {data.recommendations.length === 0 && (
          <p className="text-sm text-[var(--muted)]">None recorded.</p>
        )}
        {data.recommendations.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">
                {r.rank}. {REC_LABEL[r.type] ?? r.type}
              </span>
              <span className="text-xs text-[var(--muted)] font-mono">
                {r.modelVersion ?? ""}
              </span>
            </div>
            <pre className="text-xs text-[var(--muted)] mt-2 whitespace-pre-wrap break-words font-mono">
              {JSON.stringify(r.payload, null, 2)}
            </pre>
          </div>
        ))}
      </div>

      <h2 className="font-semibold mt-8 mb-3">Audit trail</h2>
      <div className="space-y-2">
        {data.audit.map((a) => (
          <div key={a.id} className="card p-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`pill ${ACTOR_STYLE[a.actor] ?? ""}`}>
                {a.actor}
              </span>
              <span className="text-sm font-medium">{a.action}</span>
              {a.toolName && (
                <span className="text-xs font-mono text-[var(--muted)]">
                  {a.toolName}
                </span>
              )}
              <span className="text-xs text-[var(--muted)] ml-auto">
                {new Date(a.createdAt).toLocaleTimeString()}
              </span>
            </div>
            {(a.inputs || a.outputs) && (
              <div className="grid sm:grid-cols-2 gap-3 mt-2">
                {a.inputs && (
                  <div>
                    <div className="text-xs text-[var(--muted)] mb-1">Inputs</div>
                    <pre className="text-xs bg-[var(--background)] rounded-lg p-2 whitespace-pre-wrap break-words font-mono">
                      {JSON.stringify(a.inputs, null, 2)}
                    </pre>
                  </div>
                )}
                {a.outputs && (
                  <div>
                    <div className="text-xs text-[var(--muted)] mb-1">Outputs</div>
                    <pre className="text-xs bg-[var(--background)] rounded-lg p-2 whitespace-pre-wrap break-words font-mono">
                      {JSON.stringify(a.outputs, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
