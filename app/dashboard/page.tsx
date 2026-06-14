"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { DemandCell, Layers } from "./MapView";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full skeleton rounded-2xl grid place-items-center text-sm text-[var(--muted)]">
      Loading map…
    </div>
  ),
});

type DemandResponse = {
  cells: DemandCell[];
  campTargets: DemandCell[];
  coverage: {
    clinics: { id: string; name: string; lat: number; lng: number }[];
    camps: { id: string; region: string | null; lat: number; lng: number }[];
  };
  totals: {
    waitlist: number;
    calls: number;
    uncoveredCells: number;
    reachableTop3: number;
  };
  categories: { category: string; count: number }[];
  severities: { severity: string; count: number }[];
  timeline: { date: string; label: string; count: number }[];
  trends: { callsLast7: number; callsPrev7: number; waitlistLast7: number };
};

type CampRequest = {
  id: string;
  region: string | null;
  lat: number;
  lng: number;
  status: string;
  services: string[] | null;
  scheduledFor: string | null;
  expectedReach: number | null;
  createdAt: string;
};

type Ngo = { id: string; name: string };

type Toast = { msg: string; tone: "success" | "info" } | null;

const CATEGORY_COLORS: Record<string, string> = {
  pregnancy: "#b5436b",
  reproductive_health: "#2f7d7b",
  infection: "#c8761b",
  general: "#7a6f68",
  vaccination: "#5b7db1",
  checkup: "#8a6db1",
};
const colorFor = (cat: string) => CATEGORY_COLORS[cat] ?? "#9a8d85";
const prettyCat = (c: string) => c.replace(/_/g, " ");

const COMMON_SERVICES = [
  "pregnancy",
  "reproductive_health",
  "infection",
  "general",
  "vaccination",
  "checkup",
];

export default function DashboardPage() {
  const [demand, setDemand] = useState<DemandResponse | null>(null);
  const [camps, setCamps] = useState<CampRequest[]>([]);
  const [ngos, setNgos] = useState<Ngo[]>([]);
  const [selectedNgo, setSelectedNgo] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Interactivity state
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>({
    demand: true,
    clinics: true,
    camps: true,
  });
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [coverageFilter, setCoverageFilter] = useState<"all" | "uncovered">("all");
  const [campForm, setCampForm] = useState<DemandCell | null>(null);

  const refresh = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    let active = true;
    (async () => {
      const [d, c, n] = await Promise.all([
        fetch("/api/dashboard/demand").then((r) => r.json()),
        fetch("/api/camps").then((r) => r.json()),
        fetch("/api/ngos").then((r) => r.json()),
      ]);
      if (!active) return;
      setDemand(d);
      setCamps(c.campRequests ?? []);
      setNgos(n.ngos ?? []);
      setSelectedNgo((prev) => prev || n.ngos?.[0]?.id || "");
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const flash = (msg: string, tone: "success" | "info" = "success") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3500);
  };

  async function submitCamp(form: {
    target: DemandCell;
    services: string[];
    scheduledFor: string;
    expectedReach: number;
    note: string;
  }) {
    await fetch("/api/camps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ngoId: selectedNgo || null,
        region: form.target.region,
        lat: form.target.lat,
        lng: form.target.lng,
        services: form.services,
        scheduledFor: form.scheduledFor || null,
        expectedReach: form.expectedReach,
        note: form.note || null,
      }),
    });
    setCampForm(null);
    flash(`Camp requested for ${form.target.region ?? "selected area"}.`);
    refresh();
  }

  async function activateCamp(id: string) {
    await fetch(`/api/camps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    flash("Camp activated. Coverage updated; matching callers are being notified.");
    refresh();
  }

  const clinics = useMemo(() => demand?.coverage.clinics ?? [], [demand]);
  const activeCamps = useMemo(() => demand?.coverage.camps ?? [], [demand]);

  const filteredCells = useMemo(() => {
    let cells = demand?.cells ?? [];
    if (categoryFilter)
      cells = cells.filter((c) => c.topCategory === categoryFilter);
    if (coverageFilter === "uncovered") cells = cells.filter((c) => !c.covered);
    return cells;
  }, [demand, categoryFilter, coverageFilter]);

  const filteredTargets = useMemo(() => {
    let targets = demand?.campTargets ?? [];
    if (categoryFilter)
      targets = targets.filter((c) => c.topCategory === categoryFilter);
    return targets;
  }, [demand, categoryFilter]);

  const selectedCell = useMemo(
    () => demand?.cells.find((c) => c.key === selectedKey) ?? null,
    [demand, selectedKey],
  );

  const callsDelta = demand
    ? demand.trends.callsLast7 - demand.trends.callsPrev7
    : 0;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">NGO Impact Dashboard</h1>
          <p className="text-[var(--muted)] mt-1 text-sm">
            Anonymous, aggregated demand. Find where to set up camp for maximum
            impact, then deploy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-[var(--muted)]">Acting as</label>
          <select
            value={selectedNgo}
            onChange={(e) => setSelectedNgo(e.target.value)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-[var(--surface)]"
          >
            {ngos.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Stat cards */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        demand && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Stat
              label="Callers waiting"
              value={demand.totals.waitlist}
              hint={
                demand.trends.waitlistLast7 > 0
                  ? `+${demand.trends.waitlistLast7} this week`
                  : "no new this week"
              }
            />
            <Stat
              label="Total calls"
              value={demand.totals.calls}
              hint={
                callsDelta === 0
                  ? "flat vs last week"
                  : `${callsDelta > 0 ? "+" : ""}${callsDelta} vs last week`
              }
              hintTone={callsDelta >= 0 ? "up" : "down"}
              spark={demand.timeline.map((t) => t.count)}
            />
            <Stat
              label="Under-served areas"
              value={demand.totals.uncoveredCells}
              tone="danger"
              hint="no nearby coverage"
              onClick={() =>
                setCoverageFilter((c) => (c === "uncovered" ? "all" : "uncovered"))
              }
              active={coverageFilter === "uncovered"}
            />
            <Stat
              label="Reachable now"
              value={demand.totals.reachableTop3}
              tone="accent"
              hint="if top 3 camps activate"
            />
          </div>
        )
      )}

      {/* Filter bar */}
      {demand && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <span className="text-xs font-semibold text-[var(--muted)] mr-1">
            Filter
          </span>
          <button
            className="chip"
            data-active={categoryFilter === null}
            onClick={() => setCategoryFilter(null)}
          >
            All needs
          </button>
          {demand.categories.map((c) => (
            <button
              key={c.category}
              className="chip"
              data-active={categoryFilter === c.category}
              onClick={() =>
                setCategoryFilter((cur) =>
                  cur === c.category ? null : c.category,
                )
              }
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: colorFor(c.category) }}
              />
              {prettyCat(c.category)} ({c.count})
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-[var(--border)]" />
          <button
            className="chip"
            data-active={coverageFilter === "uncovered"}
            onClick={() =>
              setCoverageFilter((c) => (c === "uncovered" ? "all" : "uncovered"))
            }
          >
            Uncovered only
          </button>
          <span className="mx-1 h-4 w-px bg-[var(--border)]" />
          <LayerToggle layers={layers} setLayers={setLayers} />
        </div>
      )}

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
        <div className="space-y-4">
          <div className="card overflow-hidden h-[520px]">
            {loading ? (
              <div className="h-full w-full skeleton" />
            ) : (
              demand && (
                <MapView
                  cells={filteredCells}
                  clinics={clinics}
                  camps={activeCamps}
                  targets={filteredTargets}
                  layers={layers}
                  selectedKey={selectedKey}
                  onSelect={(cell) => setSelectedKey(cell.key)}
                />
              )
            )}
          </div>

          {/* Selected area detail */}
          {selectedCell && (
            <div className="card p-5 card-hover">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-[var(--muted)] uppercase tracking-wide">
                    Selected area
                  </div>
                  <h3 className="font-semibold text-lg">
                    {selectedCell.region ??
                      `${selectedCell.lat.toFixed(2)}, ${selectedCell.lng.toFixed(2)}`}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedKey(null)}
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Clear ✕
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <MiniStat label="Demand" value={selectedCell.demandWeight} />
                <MiniStat label="Waiting" value={selectedCell.waitlistCount} />
                <MiniStat label="Calls" value={selectedCell.callCount} />
              </div>
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm">
                  {selectedCell.topCategory && (
                    <span className="pill bg-[var(--background)] border border-[var(--border)] text-[var(--muted)] mr-2">
                      {prettyCat(selectedCell.topCategory)}
                    </span>
                  )}
                  <span
                    className={`text-xs ${
                      selectedCell.covered
                        ? "text-[var(--accent)]"
                        : "text-[var(--danger)]"
                    }`}
                  >
                    {selectedCell.covered ? "Covered" : "No nearby coverage"}
                  </span>
                </div>
                {!selectedCell.covered && (
                  <button
                    onClick={() => setCampForm(selectedCell)}
                    className="text-xs font-semibold px-3 py-2 rounded-lg bg-[var(--primary)] text-white hover:opacity-90"
                  >
                    Request camp here
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Demand by category chart */}
          {demand && demand.categories.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold mb-1">Demand by need</h2>
              <p className="text-xs text-[var(--muted)] mb-4">
                Click a bar to filter the map.
              </p>
              <div className="space-y-2.5">
                {demand.categories.map((c) => {
                  const max = Math.max(...demand.categories.map((x) => x.count));
                  const pct = (c.count / max) * 100;
                  const active = categoryFilter === c.category;
                  return (
                    <button
                      key={c.category}
                      onClick={() =>
                        setCategoryFilter((cur) =>
                          cur === c.category ? null : c.category,
                        )
                      }
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span
                          className={`capitalize ${
                            active ? "font-semibold" : "text-[var(--muted)]"
                          }`}
                        >
                          {prettyCat(c.category)}
                        </span>
                        <span className="text-[var(--muted)]">{c.count}</span>
                      </div>
                      <div className="minibar-track h-2.5">
                        <div
                          className="minibar-fill"
                          style={{
                            width: `${pct}%`,
                            background: colorFor(c.category),
                            opacity: active || !categoryFilter ? 1 : 0.4,
                          }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {/* Recommended camp locations */}
          <div className="card p-5">
            <h2 className="font-semibold mb-1">Recommended camp locations</h2>
            <p className="text-xs text-[var(--muted)] mb-4">
              Highest demand with no nearby coverage. Click to focus on map.
            </p>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton h-16 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredTargets.length ? (
                  filteredTargets.map((t, i) => {
                    const active = t.key === selectedKey;
                    return (
                      <div
                        key={t.key}
                        onClick={() => setSelectedKey(t.key)}
                        className="flex items-center justify-between gap-3 rounded-lg border p-3 cursor-pointer card-hover"
                        style={{
                          borderColor: active
                            ? "var(--primary)"
                            : "var(--border)",
                          background: active ? "var(--primary-soft)" : undefined,
                        }}
                      >
                        <div>
                          <div className="font-medium text-sm">
                            #{i + 1}{" "}
                            {t.region ??
                              `${t.lat.toFixed(2)}, ${t.lng.toFixed(2)}`}
                          </div>
                          <div className="text-xs text-[var(--muted)]">
                            Demand {t.demandWeight} · {t.waitlistCount} waiting
                            {t.topCategory ? ` · ${prettyCat(t.topCategory)}` : ""}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCampForm(t);
                          }}
                          className="text-xs font-semibold px-3 py-2 rounded-lg bg-[var(--primary)] text-white hover:opacity-90 whitespace-nowrap"
                        >
                          Request camp
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-6">
                    <div className="text-2xl mb-1">✓</div>
                    <p className="text-sm text-[var(--muted)]">
                      {categoryFilter
                        ? "No uncovered demand for this need."
                        : "All areas covered. Great work."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Camp requests */}
          <div className="card p-5">
            <h2 className="font-semibold mb-4">Camp requests</h2>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="skeleton h-16 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {camps.length ? (
                  camps.map((c) => (
                    <CampRequestRow
                      key={c.id}
                      camp={c}
                      onActivate={() => activateCamp(c.id)}
                    />
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted)]">No requests yet.</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {campForm && (
        <CampFormModal
          target={campForm}
          onClose={() => setCampForm(null)}
          onSubmit={submitCamp}
        />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 text-white text-sm px-5 py-3 rounded-xl shadow-lg z-[1000] flex items-center gap-2 ${
            toast.tone === "success"
              ? "bg-[var(--accent)]"
              : "bg-[var(--foreground)]"
          }`}
        >
          <span>{toast.tone === "success" ? "✓" : "ℹ"}</span>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
  hintTone,
  spark,
  onClick,
  active,
}: {
  label: string;
  value: number;
  tone?: "danger" | "accent";
  hint?: string;
  hintTone?: "up" | "down";
  spark?: number[];
  onClick?: () => void;
  active?: boolean;
}) {
  const valueColor =
    tone === "danger"
      ? "text-[var(--danger)]"
      : tone === "accent"
        ? "text-[var(--accent)]"
        : "";
  return (
    <div
      onClick={onClick}
      className={`card p-4 ${onClick ? "cursor-pointer card-hover" : ""}`}
      style={active ? { borderColor: "var(--danger)" } : undefined}
    >
      <div className="flex items-start justify-between">
        <div className={`text-3xl font-bold ${valueColor}`}>{value}</div>
        {spark && spark.length > 1 && <Sparkline data={spark} />}
      </div>
      <div className="text-xs text-[var(--muted)] mt-1">{label}</div>
      {hint && (
        <div
          className={`text-xs mt-0.5 ${
            hintTone === "up"
              ? "text-[var(--accent)]"
              : hintTone === "down"
                ? "text-[var(--danger)]"
                : "text-[var(--muted)]"
          }`}
        >
          {hintTone === "up" ? "↑ " : hintTone === "down" ? "↓ " : ""}
          {hint}
        </div>
      )}
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const w = 64;
  const h = 24;
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data
    .map((d, i) => `${i * step},${h - (d / max) * (h - 2) - 1}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--background)] p-2.5 text-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-[var(--muted)]">{label}</div>
    </div>
  );
}

function LayerToggle({
  layers,
  setLayers,
}: {
  layers: Layers;
  setLayers: (l: Layers) => void;
}) {
  const items: { key: keyof Layers; label: string }[] = [
    { key: "demand", label: "Demand" },
    { key: "clinics", label: "Clinics" },
    { key: "camps", label: "Camps" },
  ];
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-[var(--muted)]">Layers</span>
      {items.map((it) => (
        <button
          key={it.key}
          className="chip"
          data-active={layers[it.key]}
          onClick={() => setLayers({ ...layers, [it.key]: !layers[it.key] })}
        >
          {layers[it.key] ? "◉" : "○"} {it.label}
        </button>
      ))}
    </div>
  );
}

function CampRequestRow({
  camp,
  onActivate,
}: {
  camp: CampRequest;
  onActivate: () => void;
}) {
  const steps = ["requested", "approved", "active"];
  const currentIdx = Math.max(0, steps.indexOf(camp.status));
  return (
    <div className="rounded-lg border border-[var(--border)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">
            {camp.region ?? `${camp.lat.toFixed(2)}, ${camp.lng.toFixed(2)}`}
          </div>
          <div className="text-xs text-[var(--muted)]">
            {camp.scheduledFor
              ? `Scheduled ${new Date(camp.scheduledFor).toLocaleDateString()}`
              : "No date set"}
            {camp.expectedReach != null
              ? ` · ~${camp.expectedReach} reachable`
              : ""}
          </div>
        </div>
        {camp.status !== "active" && (
          <button
            onClick={onActivate}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 whitespace-nowrap"
          >
            Activate
          </button>
        )}
      </div>
      {camp.services && camp.services.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {camp.services.map((s) => (
            <span
              key={s}
              className="text-xs rounded bg-[var(--background)] px-1.5 py-0.5 text-[var(--muted)] capitalize"
            >
              {prettyCat(s)}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1 mt-3">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div
              className={`flex items-center gap-1 text-xs ${
                i <= currentIdx
                  ? "text-[var(--accent)] font-medium"
                  : "text-[var(--muted)]"
              }`}
            >
              <span>{i <= currentIdx ? "●" : "○"}</span>
              <span className="capitalize">{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="flex-1 h-px mx-1"
                style={{
                  background:
                    i < currentIdx ? "var(--accent)" : "var(--border)",
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CampFormModal({
  target,
  onClose,
  onSubmit,
}: {
  target: DemandCell;
  onClose: () => void;
  onSubmit: (form: {
    target: DemandCell;
    services: string[];
    scheduledFor: string;
    expectedReach: number;
    note: string;
  }) => void;
}) {
  const [services, setServices] = useState<string[]>(
    target.topCategory ? [target.topCategory] : [],
  );
  const [scheduledFor, setScheduledFor] = useState("");
  const [note, setNote] = useState("");
  const toggle = (s: string) =>
    setServices((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    );

  return (
    <div
      className="fixed inset-0 bg-black/40 z-[1000] grid place-items-center p-4"
      onClick={onClose}
    >
      <div
        className="card p-6 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-lg">Request a camp</h3>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-[var(--muted)] mb-4">
          {target.region ??
            `${target.lat.toFixed(2)}, ${target.lng.toFixed(2)}`}{" "}
          · {target.waitlistCount} callers waiting
        </p>

        <label className="text-sm font-medium">Services offered</label>
        <div className="flex flex-wrap gap-2 mt-2 mb-4">
          {COMMON_SERVICES.map((s) => (
            <button
              key={s}
              type="button"
              className="chip"
              data-active={services.includes(s)}
              onClick={() => toggle(s)}
            >
              {prettyCat(s)}
            </button>
          ))}
        </div>

        <label className="text-sm font-medium">Proposed date</label>
        <input
          type="date"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
          className="w-full mt-1 mb-4 rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-[var(--surface)]"
        />

        <label className="text-sm font-medium">
          Expected reach{" "}
          <span className="text-[var(--muted)] font-normal">
            (≈ callers waiting)
          </span>
        </label>
        <div className="text-2xl font-bold mt-1 mb-4">
          {target.waitlistCount}
        </div>

        <label className="text-sm font-medium">Note (optional)</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Any logistics or specialties…"
          className="w-full mt-1 mb-5 rounded-lg border border-[var(--border)] px-3 py-2 text-sm bg-[var(--surface)] resize-none"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--background)]"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onSubmit({
                target,
                services,
                scheduledFor,
                expectedReach: target.waitlistCount,
                note,
              })
            }
            className="text-sm font-semibold px-4 py-2 rounded-lg bg-[var(--primary)] text-white hover:opacity-90"
          >
            Submit request
          </button>
        </div>
      </div>
    </div>
  );
}
