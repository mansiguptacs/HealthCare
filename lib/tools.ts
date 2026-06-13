import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  calls,
  campRequests,
  clinics,
  patientNotes,
  recommendations,
  waitlistEntries,
} from "@/db/schema";
import { recordAudit } from "./audit";
import { haversineKm } from "./geo";
import { GROK_CHAT_MODEL } from "./grok";
import type { AgentToolName } from "./agent";

type ToolArgs = Record<string, unknown>;

/** Get the patient note for a call, creating an empty one if needed. */
async function getOrCreateNote(callId: string) {
  const existing = await db
    .select()
    .from(patientNotes)
    .where(eq(patientNotes.callId, callId))
    .limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(patientNotes)
    .values({ callId, structuredSymptoms: {} })
    .returning();
  return created;
}

async function nextRank(callId: string): Promise<number> {
  const rows = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.callId, callId));
  return rows.length + 1;
}

/** Add a recommendation row (append-only) plus a matching audit entry. */
async function addRecommendation(
  callId: string,
  type: string,
  payload: Record<string, unknown>,
) {
  const rank = await nextRank(callId);
  const [rec] = await db
    .insert(recommendations)
    .values({ callId, type, rank, payload, modelVersion: GROK_CHAT_MODEL })
    .returning();
  return rec;
}

/**
 * Returns ranked nearby care options. Fixed clinics come from the `clinics`
 * table; live NGO coverage comes from approved/active `camp_requests`, so what
 * the agent can offer always reflects current on-the-ground coverage.
 */
export async function findCareOptions(opts: {
  lat?: number;
  lng?: number;
  region?: string;
  service?: string;
  limit?: number;
}) {
  const limit = opts.limit ?? 5;
  const activeClinics = await db
    .select()
    .from(clinics)
    .where(eq(clinics.active, true));

  const activeCamps = await db
    .select()
    .from(campRequests)
    .where(inArray(campRequests.status, ["approved", "active"]));

  type Option = {
    id: string;
    name: string;
    type: "fixed" | "mobile";
    lat: number;
    lng: number;
    region: string | null;
    services: string[];
    availability: string | null;
    distanceKm: number | null;
  };

  const options: Option[] = [
    ...activeClinics.map((c) => ({
      id: c.id,
      name: c.name,
      type: (c.type === "mobile" ? "mobile" : "fixed") as "fixed" | "mobile",
      lat: c.lat,
      lng: c.lng,
      region: c.region,
      services: c.services ?? [],
      availability: c.availability,
      distanceKm:
        opts.lat != null && opts.lng != null
          ? haversineKm({ lat: opts.lat, lng: opts.lng }, { lat: c.lat, lng: c.lng })
          : null,
    })),
    ...activeCamps.map((c) => ({
      id: c.id,
      name: `Mobile camp (${c.region ?? "area"})`,
      type: "mobile" as const,
      lat: c.lat,
      lng: c.lng,
      region: c.region,
      services: c.services ?? [],
      availability: "Active NGO camp",
      distanceKm:
        opts.lat != null && opts.lng != null
          ? haversineKm({ lat: opts.lat, lng: opts.lng }, { lat: c.lat, lng: c.lng })
          : null,
    })),
  ];

  const filtered = opts.service
    ? options.filter(
        (o) =>
          o.services.length === 0 ||
          o.services.some((s) =>
            s.toLowerCase().includes(opts.service!.toLowerCase()),
          ),
      )
    : options;

  filtered.sort((a, b) => {
    if (a.distanceKm == null && b.distanceKm == null) return 0;
    if (a.distanceKm == null) return 1;
    if (b.distanceKm == null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  return filtered.slice(0, limit);
}

/**
 * Execute a single agent tool call against the database, writing an audit row
 * for every invocation. Returns a plain-object result to feed back to the model.
 */
export async function executeTool(
  callId: string,
  name: AgentToolName | string,
  rawArgs: ToolArgs,
): Promise<Record<string, unknown>> {
  let result: Record<string, unknown> = { ok: false, error: "unknown_tool" };

  try {
    switch (name) {
      case "save_symptom": {
        const note = await getOrCreateNote(callId);
        const merged = {
          ...(note.structuredSymptoms ?? {}),
          [String(rawArgs.key ?? "detail")]: rawArgs.value,
        };
        await db
          .update(patientNotes)
          .set({
            structuredSymptoms: merged,
            problemCategory:
              (rawArgs.problemCategory as string) ?? note.problemCategory,
          })
          .where(eq(patientNotes.id, note.id));
        result = { ok: true, saved: rawArgs.key };
        break;
      }

      case "assess_severity": {
        const note = await getOrCreateNote(callId);
        await db
          .update(patientNotes)
          .set({ severity: String(rawArgs.severity) })
          .where(eq(patientNotes.id, note.id));
        result = { ok: true, severity: rawArgs.severity };
        break;
      }

      case "recommend_first_aid": {
        const rec = await addRecommendation(callId, "first_aid", {
          guidance: rawArgs.guidance,
        });
        result = { ok: true, recommendationId: rec.id };
        break;
      }

      case "find_clinics": {
        const options = await findCareOptions({
          lat: rawArgs.lat as number | undefined,
          lng: rawArgs.lng as number | undefined,
          region: rawArgs.region as string | undefined,
          service: rawArgs.service as string | undefined,
        });
        result = {
          ok: true,
          count: options.length,
          options: options.map((o) => ({
            id: o.id,
            name: o.name,
            type: o.type,
            region: o.region,
            services: o.services,
            availability: o.availability,
            distanceKm: o.distanceKm != null ? Math.round(o.distanceKm * 10) / 10 : null,
          })),
        };
        break;
      }

      case "create_referral": {
        const type = rawArgs.isMobile ? "mobile_clinic" : "clinic_referral";
        const rec = await addRecommendation(callId, type, {
          clinicId: rawArgs.clinicId ?? null,
          clinicName: rawArgs.clinicName,
          note: rawArgs.note ?? null,
        });
        result = { ok: true, recommendationId: rec.id };
        break;
      }

      case "add_to_waitlist": {
        if (!rawArgs.consent) {
          result = { ok: false, error: "consent_required" };
          break;
        }
        const note = await getOrCreateNote(callId);
        const callRow = (
          await db.select().from(calls).where(eq(calls.id, callId)).limit(1)
        )[0];
        const [entry] = await db
          .insert(waitlistEntries)
          .values({
            callId,
            region: (rawArgs.region as string) ?? callRow?.region ?? null,
            lat: (rawArgs.lat as number) ?? callRow?.lat ?? null,
            lng: (rawArgs.lng as number) ?? callRow?.lng ?? null,
            problemCategory: note.problemCategory,
            severity: note.severity,
            phonePartial:
              (rawArgs.phonePartial as string) ?? callRow?.phonePartial ?? null,
            consent: true,
            status: "waiting",
          })
          .returning();
        const rec = await addRecommendation(callId, "ngo_waitlist", {
          waitlistEntryId: entry.id,
        });
        result = { ok: true, waitlistEntryId: entry.id, recommendationId: rec.id };
        break;
      }

      default:
        result = { ok: false, error: `unknown_tool:${name}` };
    }
  } catch (err) {
    result = { ok: false, error: (err as Error).message };
  }

  await recordAudit({
    callId,
    actor: "grok",
    action: "tool_call",
    toolName: name,
    inputs: rawArgs,
    outputs: result,
  });

  return result;
}
