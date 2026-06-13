import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  calls,
  campRequests,
  patientNotes,
  recommendations,
  waitlistEntries,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { grokChat, hasXaiKey, GROK_CHAT_MODEL } from "@/lib/grok";
import { haversineKm } from "@/lib/geo";
import { inngest } from "./client";

/**
 * When a call ends, durably (1) distil a clean structured note + severity from
 * everything captured during the call, and (2) mark the call processed. Each
 * step is checkpointed so a failure never loses the work already done.
 */
export const processCall = inngest.createFunction(
  {
    id: "process-call",
    name: "Process ended call",
    triggers: [{ event: "call/ended" }],
  },
  async ({ event, step }) => {
    const { callId, transcript } = event.data as {
      callId: string;
      transcript?: string;
    };

    const note = await step.run("load-note", async () => {
      const rows = await db
        .select()
        .from(patientNotes)
        .where(eq(patientNotes.callId, callId))
        .limit(1);
      return rows[0] ?? null;
    });

    const summary = await step.run("summarise", async () => {
      const symptoms = JSON.stringify(note?.structuredSymptoms ?? {});
      if (!hasXaiKey()) {
        // Deterministic fallback so the pipeline works without an API key.
        const keys = Object.values(note?.structuredSymptoms ?? {});
        return {
          summary:
            keys.length > 0
              ? `Caller reported: ${keys.join("; ")}.`
              : "Caller contacted the helpline; details were limited.",
          severity: note?.severity ?? "medium",
          problemCategory: note?.problemCategory ?? "general",
        };
      }
      const content = await grokChat({
        json: true,
        messages: [
          {
            role: "system",
            content:
              "You convert helpline intake data into a concise clinical note. Output JSON with keys: summary (2-3 sentences, no PII), severity (low|medium|high|emergency), problemCategory.",
          },
          {
            role: "user",
            content: `Captured symptoms: ${symptoms}\nTranscript (may be empty): ${transcript ?? ""}`,
          },
        ],
      });
      try {
        return JSON.parse(content) as {
          summary: string;
          severity: string;
          problemCategory: string;
        };
      } catch {
        return {
          summary: content.slice(0, 500),
          severity: note?.severity ?? "medium",
          problemCategory: note?.problemCategory ?? "general",
        };
      }
    });

    await step.run("persist-note", async () => {
      if (!note) {
        await db.insert(patientNotes).values({
          callId,
          summary: summary.summary,
          severity: summary.severity,
          problemCategory: summary.problemCategory,
          structuredSymptoms: {},
        });
      } else {
        await db
          .update(patientNotes)
          .set({
            summary: summary.summary,
            severity: summary.severity ?? note.severity,
            problemCategory: summary.problemCategory ?? note.problemCategory,
          })
          .where(eq(patientNotes.id, note.id));
      }
      await db
        .update(calls)
        .set({ status: "processed" })
        .where(eq(calls.id, callId));
      await recordAudit({
        callId,
        actor: "inngest",
        action: "call_processed",
        outputs: summary as unknown as Record<string, unknown>,
      });
    });

    return { callId, ...summary };
  },
);

/**
 * When an NGO camp becomes active, find waitlisted callers in range and mark
 * them as notified (in a real deployment this would also send SMS/voice).
 */
export const notifyWaitlistOnCamp = inngest.createFunction(
  {
    id: "notify-waitlist-on-camp",
    name: "Notify waitlist on new camp",
    triggers: [{ event: "camp/activated" }],
  },
  async ({ event, step }) => {
    const { campRequestId } = event.data as { campRequestId: string };

    const camp = await step.run("load-camp", async () => {
      const rows = await db
        .select()
        .from(campRequests)
        .where(eq(campRequests.id, campRequestId))
        .limit(1);
      return rows[0] ?? null;
    });
    if (!camp) return { notified: 0 };

    const matched = await step.run("match-waitlist", async () => {
      const waiting = await db
        .select()
        .from(waitlistEntries)
        .where(eq(waitlistEntries.status, "waiting"));
      return waiting.filter((w) => {
        if (camp.region && w.region && w.region === camp.region) return true;
        if (w.lat != null && w.lng != null) {
          return (
            haversineKm(
              { lat: w.lat, lng: w.lng },
              { lat: camp.lat, lng: camp.lng },
            ) <= 50
          );
        }
        return false;
      });
    });

    await step.run("notify", async () => {
      for (const w of matched) {
        await db
          .update(waitlistEntries)
          .set({ status: "notified" })
          .where(eq(waitlistEntries.id, w.id));
        await recordAudit({
          callId: w.callId,
          actor: "inngest",
          action: "waitlist_notified",
          outputs: { campRequestId, region: camp.region },
        });
      }
    });

    return { notified: matched.length };
  },
);

export const functions = [processCall, notifyWaitlistOnCamp];
