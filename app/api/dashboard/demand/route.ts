import { NextResponse } from "next/server";
import { inArray, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  calls,
  campRequests,
  clinics,
  patientNotes,
  waitlistEntries,
} from "@/db/schema";
import { coarseCell, haversineKm } from "@/lib/geo";

export const runtime = "nodejs";

const SEVERITY_WEIGHT: Record<string, number> = {
  emergency: 4,
  high: 3,
  medium: 2,
  low: 1,
};

type Cell = {
  key: string;
  lat: number;
  lng: number;
  region: string | null;
  demandWeight: number;
  waitlistCount: number;
  callCount: number;
  topCategory: string | null;
  covered: boolean;
};

/**
 * Privacy-preserving demand heatmap. Patient demand is aggregated into coarse
 * grid cells (~11km). Each cell is flagged covered if an active clinic/camp is
 * within ~25km, and uncovered high-demand cells are surfaced as camp targets.
 */
export async function GET() {
  const waiting = await db
    .select()
    .from(waitlistEntries)
    .where(eq(waitlistEntries.status, "waiting"));
  const allCalls = await db.select().from(calls);
  const activeClinics = await db
    .select()
    .from(clinics)
    .where(eq(clinics.active, true));
  const activeCamps = await db
    .select()
    .from(campRequests)
    .where(inArray(campRequests.status, ["approved", "active"]));

  const coverage = [
    ...activeClinics.map((c) => ({ lat: c.lat, lng: c.lng })),
    ...activeCamps.map((c) => ({ lat: c.lat, lng: c.lng })),
  ];

  const cells = new Map<string, Cell>();
  const categoryCount = new Map<string, Map<string, number>>();

  const bump = (
    lat: number | null,
    lng: number | null,
    region: string | null,
    weight: number,
    kind: "waitlist" | "call",
    category?: string | null,
  ) => {
    if (lat == null || lng == null) return;
    const cell = coarseCell(lat, lng);
    const existing =
      cells.get(cell.key) ??
      ({
        key: cell.key,
        lat: cell.lat,
        lng: cell.lng,
        region,
        demandWeight: 0,
        waitlistCount: 0,
        callCount: 0,
        topCategory: null,
        covered: false,
      } satisfies Cell);
    existing.demandWeight += weight;
    if (kind === "waitlist") existing.waitlistCount += 1;
    else existing.callCount += 1;
    if (!existing.region && region) existing.region = region;
    cells.set(cell.key, existing);

    if (category) {
      const cat = categoryCount.get(cell.key) ?? new Map();
      cat.set(category, (cat.get(category) ?? 0) + 1);
      categoryCount.set(cell.key, cat);
    }
  };

  for (const w of waiting) {
    bump(
      w.lat,
      w.lng,
      w.region,
      (SEVERITY_WEIGHT[w.severity ?? "medium"] ?? 2) + 1,
      "waitlist",
      w.problemCategory,
    );
  }
  for (const c of allCalls) {
    bump(c.lat, c.lng, c.region, 1, "call");
  }

  const result: Cell[] = [];
  for (const cell of cells.values()) {
    cell.covered = coverage.some(
      (cov) =>
        haversineKm({ lat: cell.lat, lng: cell.lng }, cov) <= 25,
    );
    const cats = categoryCount.get(cell.key);
    if (cats) {
      cell.topCategory = [...cats.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }
    result.push(cell);
  }

  result.sort((a, b) => b.demandWeight - a.demandWeight);

  // Ranked camp targets: highest-demand cells that are not yet covered.
  const campTargets = result
    .filter((c) => !c.covered && c.demandWeight > 0)
    .slice(0, 5);

  // ── Breakdowns for charts ──────────────────────────────────────────────────
  const allNotes = await db.select().from(patientNotes);

  const catCounts = new Map<string, number>();
  const sevCounts = new Map<string, number>();
  const tally = (
    map: Map<string, number>,
    key: string | null | undefined,
  ) => {
    if (!key) return;
    map.set(key, (map.get(key) ?? 0) + 1);
  };
  for (const w of waiting) {
    tally(catCounts, w.problemCategory);
    tally(sevCounts, w.severity);
  }
  for (const n of allNotes) {
    tally(catCounts, n.problemCategory);
    tally(sevCounts, n.severity);
  }
  const categories = [...catCounts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
  const severities = [...sevCounts.entries()]
    .map(([severity, count]) => ({ severity, count }))
    .sort((a, b) => b.count - a.count);

  // ── Call volume timeline (last 14 days) ────────────────────────────────────
  const DAY = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const timeline: { date: string; label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(today.getTime() - i * DAY);
    const next = new Date(day.getTime() + DAY);
    const count = allCalls.filter((c) => {
      const t = c.startedAt ? new Date(c.startedAt).getTime() : 0;
      return t >= day.getTime() && t < next.getTime();
    }).length;
    timeline.push({
      date: day.toISOString().slice(0, 10),
      label: `${day.getMonth() + 1}/${day.getDate()}`,
      count,
    });
  }

  // ── Period-over-period trend (last 7 days vs previous 7) ────────────────────
  const now = Date.now();
  const inWindow = (t: number, startDaysAgo: number, endDaysAgo: number) =>
    t >= now - startDaysAgo * DAY && t < now - endDaysAgo * DAY;
  const callsLast7 = allCalls.filter(
    (c) => c.startedAt && inWindow(new Date(c.startedAt).getTime(), 7, 0),
  ).length;
  const callsPrev7 = allCalls.filter(
    (c) => c.startedAt && inWindow(new Date(c.startedAt).getTime(), 14, 7),
  ).length;
  const waitlistLast7 = waiting.filter(
    (w) => w.createdAt && inWindow(new Date(w.createdAt).getTime(), 7, 0),
  ).length;

  // Estimated people reachable by activating the top camp targets.
  const reachableTop3 = campTargets
    .slice(0, 3)
    .reduce((sum, c) => sum + c.waitlistCount, 0);

  return NextResponse.json({
    cells: result,
    campTargets,
    coverage: {
      clinics: activeClinics,
      camps: activeCamps,
    },
    totals: {
      waitlist: waiting.length,
      calls: allCalls.length,
      uncoveredCells: result.filter((c) => !c.covered).length,
      reachableTop3,
    },
    categories,
    severities,
    timeline,
    trends: { callsLast7, callsPrev7, waitlistLast7 },
  });
}
