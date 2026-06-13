"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { DemandCell } from "./MapView";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="h-full grid place-items-center text-sm text-[var(--muted)]">
      Loading map...
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
  totals: { waitlist: number; calls: number; uncoveredCells: number };
};

type CampRequest = {
  id: string;
  region: string | null;
  lat: number;
  lng: number;
  status: string;
  services: string[] | null;
};

type Ngo = { id: string; name: string };

export default function DashboardPage() {
  const [demand, setDemand] = useState<DemandResponse | null>(null);
  const [camps, setCamps] = useState<CampRequest[]>([]);
  const [ngos, setNgos] = useState<Ngo[]>([]);
  const [selectedNgo, setSelectedNgo] = useState<string>("");
  const [toast, setToast] = useState<string>("");

  const load = useCallback(async () => {
    const [d, c, n] = await Promise.all([
      fetch("/api/dashboard/demand").then((r) => r.json()),
      fetch("/api/camps").then((r) => r.json()),
      fetch("/api/ngos").then((r) => r.json()),
    ]);
    setDemand(d);
    setCamps(c.campRequests ?? []);
    setNgos(n.ngos ?? []);
    if (!selectedNgo && n.ngos?.[0]) setSelectedNgo(n.ngos[0].id);
  }, [selectedNgo]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  async function requestCamp(target: DemandCell) {
    await fetch("/api/camps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ngoId: selectedNgo || null,
        region: target.region,
        lat: target.lat,
        lng: target.lng,
        services: target.topCategory ? [target.topCategory] : [],
      }),
    });
    flash(`Camp requested for ${target.region ?? "selected area"}.`);
    await load();
  }

  async function activateCamp(id: string) {
    await fetch(`/api/camps/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    flash("Camp activated. Coverage updated; matching callers are being notified.");
    await load();
  }

  const clinics = useMemo(
    () => demand?.coverage.clinics ?? [],
    [demand],
  );
  const activeCamps = useMemo(() => demand?.coverage.camps ?? [], [demand]);

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

      {demand && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Stat label="Callers waiting" value={demand.totals.waitlist} />
          <Stat label="Total calls" value={demand.totals.calls} />
          <Stat
            label="Under-served areas"
            value={demand.totals.uncoveredCells}
            tone="danger"
          />
        </div>
      )}

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6">
        <div className="card overflow-hidden h-[520px]">
          {demand && (
            <MapView
              cells={demand.cells}
              clinics={clinics}
              camps={activeCamps}
              targets={demand.campTargets}
            />
          )}
        </div>

        <div className="space-y-6">
          <div className="card p-5">
            <h2 className="font-semibold mb-1">Recommended camp locations</h2>
            <p className="text-xs text-[var(--muted)] mb-4">
              Highest demand with no nearby coverage.
            </p>
            <div className="space-y-3">
              {demand?.campTargets.length ? (
                demand.campTargets.map((t, i) => (
                  <div
                    key={t.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3"
                  >
                    <div>
                      <div className="font-medium text-sm">
                        #{i + 1} {t.region ?? `${t.lat.toFixed(2)}, ${t.lng.toFixed(2)}`}
                      </div>
                      <div className="text-xs text-[var(--muted)]">
                        Demand {t.demandWeight} · {t.waitlistCount} waiting
                        {t.topCategory ? ` · ${t.topCategory}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => requestCamp(t)}
                      className="text-xs font-semibold px-3 py-2 rounded-lg bg-[var(--primary)] text-white hover:opacity-90 whitespace-nowrap"
                    >
                      Request camp
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  All areas covered. Great work.
                </p>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold mb-4">Camp requests</h2>
            <div className="space-y-2">
              {camps.length ? (
                camps.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] p-3"
                  >
                    <div>
                      <div className="text-sm font-medium">
                        {c.region ?? `${c.lat.toFixed(2)}, ${c.lng.toFixed(2)}`}
                      </div>
                      <span
                        className={`pill mt-1 ${
                          c.status === "active"
                            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                    {c.status !== "active" && (
                      <button
                        onClick={() => activateCamp(c.id)}
                        className="text-xs font-semibold px-3 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 whitespace-nowrap"
                      >
                        Activate
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">No requests yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[var(--foreground)] text-white text-sm px-5 py-3 rounded-xl shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "danger";
}) {
  return (
    <div className="card p-4">
      <div
        className={`text-3xl font-bold ${
          tone === "danger" ? "text-[var(--danger)]" : ""
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-[var(--muted)] mt-1">{label}</div>
    </div>
  );
}
