"use client";

import { use, useEffect, useRef, useState } from "react";
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

const REC_META: Record<
  string,
  { label: string; icon: string; tone: string }
> = {
  first_aid: { label: "First aid", icon: "✚", tone: "var(--danger)" },
  clinic_referral: { label: "Clinic referral", icon: "⌖", tone: "var(--accent)" },
  mobile_clinic: { label: "Mobile camp", icon: "⛺", tone: "var(--warning)" },
  ngo_waitlist: { label: "NGO waitlist", icon: "☂", tone: "var(--primary)" },
};

const ACTOR_META: Record<string, { label: string; color: string; pill: string }> = {
  grok: { label: "Sakhi AI", color: "var(--primary)", pill: "bg-[var(--primary-soft)] text-[var(--primary)]" },
  inngest: { label: "Workflow", color: "var(--accent)", pill: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  ngo: { label: "NGO", color: "var(--warning)", pill: "bg-amber-100 text-amber-700" },
  system: { label: "System", color: "var(--muted)", pill: "bg-[var(--background)] text-[var(--muted)]" },
};

const SEVERITY_STYLE: Record<string, string> = {
  low: "bg-[var(--accent-soft)] text-[var(--accent)]",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  emergency: "bg-red-100 text-red-700",
};

// The escalation ladder Sakhi follows, in order.
const LADDER: { type: string; label: string }[] = [
  { type: "first_aid", label: "First aid" },
  { type: "clinic_referral", label: "Clinic" },
  { type: "mobile_clinic", label: "Mobile camp" },
  { type: "ngo_waitlist", label: "Waitlist" },
];

const ACTION_LABEL: Record<string, string> = {
  call_started: "Call started",
  call_processed: "Post-call processing complete",
  tool_call: "AI tool call",
  camp_requested: "Camp requested",
  camp_status_changed: "Camp status changed",
  waitlist_notified: "Waitlist contacted",
};

function humanAction(actor: string, action: string, toolName: string | null) {
  if (action === "tool_call" && toolName) {
    const map: Record<string, string> = {
      save_symptom: "Recorded a symptom",
      assess_severity: "Assessed severity",
      recommend_first_aid: "Gave first-aid guidance",
      find_clinics: "Searched nearby care",
      create_referral: "Created a referral",
      add_to_waitlist: "Added caller to waitlist",
      end_call: "Ended the call",
    };
    return map[toolName] ?? `Tool: ${toolName}`;
  }
  return ACTION_LABEL[action] ?? action;
}

export default function TraceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<TraceData | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [ago, setAgo] = useState(0);
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await fetch(`/api/calls/${id}`);
      const d: TraceData = await res.json();
      if (!active) return;
      // Highlight audit rows that are new since the last poll.
      const newIds = new Set<string>();
      for (const a of d.audit) {
        if (!seen.current.has(a.id)) {
          if (seen.current.size > 0) newIds.add(a.id);
          seen.current.add(a.id);
        }
      }
      if (newIds.size) {
        setFresh(newIds);
        setTimeout(() => active && setFresh(new Set()), 2500);
      }
      setData(d);
      setLastUpdated(new Date());
    };
    load();
    const t = setInterval(load, 4000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => {
      if (lastUpdated) setAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-8">
        <div className="skeleton h-4 w-24 mb-4" />
        <div className="skeleton h-28 w-full rounded-2xl mb-6" />
        <div className="skeleton h-10 w-full rounded-xl mb-6" />
        <div className="space-y-2">
          <div className="skeleton h-20 w-full rounded-xl" />
          <div className="skeleton h-20 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const reached = new Set(data.recommendations.map((r) => r.type));
  const reachedCount = LADDER.filter((s) => reached.has(s.type)).length;
  const live = data.call.status !== "processed";

  return (
    <div className="mx-auto max-w-4xl px-5 py-8">
      <div className="flex items-center justify-between">
        <Link href="/trace" className="text-sm text-[var(--muted)] hover:underline">
          ← All calls
        </Link>
        <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
          {live && <span className="live-dot" />}
          {lastUpdated
            ? ago < 2
              ? "Updated just now"
              : `Updated ${ago}s ago`
            : "Loading…"}
        </span>
      </div>

      <div className="card p-6 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold capitalize">
              {(data.note?.problemCategory ?? "Intake").replace(/_/g, " ")} ·{" "}
              {data.call.region ?? "Unknown area"}
            </h1>
            <p className="text-xs text-[var(--muted)] mt-1 font-mono">
              {data.call.id}
            </p>
          </div>
          <div className="flex gap-2">
            {data.note?.severity && (
              <span className={`pill ${SEVERITY_STYLE[data.note.severity] ?? ""}`}>
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
        <div className="text-xs text-[var(--muted)] mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <span>Language: {data.call.language ?? "—"}</span>
          <span>Channel: {data.call.channel}</span>
          <span>Started {new Date(data.call.startedAt).toLocaleString()}</span>
        </div>

        {data.note?.structuredSymptoms &&
          Object.keys(data.note.structuredSymptoms).length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {Object.entries(data.note.structuredSymptoms).map(([k, v]) => (
                <span
                  key={k}
                  className="text-xs rounded-lg bg-[var(--background)] border border-[var(--border)] px-2 py-1"
                >
                  <span className="text-[var(--muted)]">{k.replace(/_/g, " ")}: </span>
                  <span className="font-medium">{String(v)}</span>
                </span>
              ))}
            </div>
          )}
      </div>

      {/* Care journey stepper */}
      <div className="card p-5 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-sm">Care journey</h2>
          <span className="text-xs text-[var(--muted)]">
            {reachedCount}/{LADDER.length} steps reached
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {LADDER.map((step) => {
            const done = reached.has(step.type);
            return (
              <div key={step.type}>
                <div className="step-bar" data-done={done} />
                <div
                  className={`mt-2 text-xs font-medium ${
                    done ? "text-[var(--foreground)]" : "text-[var(--muted)]"
                  }`}
                >
                  <span className="mr-1">{done ? "●" : "○"}</span>
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <h2 className="font-semibold mt-8 mb-3">Recommendations</h2>
      <div className="space-y-2">
        {data.recommendations.length === 0 && (
          <div className="card p-6 text-center text-sm text-[var(--muted)]">
            No recommendations recorded yet
            {live && " — processing may still be in progress."}
          </div>
        )}
        {data.recommendations.map((r) => {
          const meta = REC_META[r.type] ?? {
            label: r.type,
            icon: "•",
            tone: "var(--muted)",
          };
          return (
            <div key={r.id} className="card p-4 flex gap-3">
              <div
                className="shrink-0 w-9 h-9 rounded-xl grid place-items-center text-base"
                style={{ background: `${meta.tone}1a`, color: meta.tone }}
              >
                {meta.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">
                    Step {r.rank} · {meta.label}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {new Date(r.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                <RecBody type={r.type} payload={r.payload} />
                <details className="mt-2">
                  <summary className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
                    View raw payload
                  </summary>
                  <pre className="text-xs text-[var(--muted)] mt-1 whitespace-pre-wrap break-words font-mono bg-[var(--background)] rounded-lg p-2">
                    {JSON.stringify(r.payload, null, 2)}
                  </pre>
                </details>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="font-semibold mt-8 mb-3">Audit trail</h2>
      <div className="card p-5">
        <div className="timeline">
          {data.audit.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No audit events yet.</p>
          )}
          {data.audit.map((a) => {
            const actor = ACTOR_META[a.actor] ?? ACTOR_META.system;
            const isFresh = fresh.has(a.id);
            return (
              <div
                key={a.id}
                className="timeline-item"
                style={
                  isFresh
                    ? { background: "var(--accent-soft)", borderRadius: "0.5rem" }
                    : undefined
                }
              >
                <span
                  className="timeline-dot"
                  style={{ background: actor.color }}
                />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`pill ${actor.pill}`}>{actor.label}</span>
                  <span className="text-sm font-medium">
                    {humanAction(a.actor, a.action, a.toolName)}
                  </span>
                  <span className="text-xs text-[var(--muted)] ml-auto">
                    {new Date(a.createdAt).toLocaleTimeString()}
                  </span>
                </div>
                {(a.inputs || a.outputs) && (
                  <details className="mt-1.5">
                    <summary className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
                      Details
                    </summary>
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
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Human-readable rendering of a recommendation payload. */
function RecBody({
  type,
  payload,
}: {
  type: string;
  payload: Record<string, unknown>;
}) {
  if (type === "first_aid" && payload.guidance) {
    return (
      <p className="text-sm text-[var(--foreground)] mt-1">
        {String(payload.guidance)}
      </p>
    );
  }
  if (type === "clinic_referral" || type === "mobile_clinic") {
    return (
      <div className="text-sm mt-1">
        <span className="font-medium">
          {String(payload.clinicName ?? "Care facility")}
        </span>
        {payload.note ? (
          <span className="text-[var(--muted)]"> — {String(payload.note)}</span>
        ) : null}
      </div>
    );
  }
  if (type === "ngo_waitlist") {
    return (
      <p className="text-sm text-[var(--muted)] mt-1">
        Caller consented and was added to the NGO outreach waitlist for their area.
      </p>
    );
  }
  return null;
}
