import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db/client";
import {
  calls,
  patientNotes,
  recommendations,
  auditEvents,
} from "@/db/schema";
import { sendEvent } from "@/lib/inngest/client";

export const runtime = "nodejs";

/** Full traceable view of a single call: note, recommendations, audit trail. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [call] = await db.select().from(calls).where(eq(calls.id, id)).limit(1);
  if (!call) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const [note] = await db
    .select()
    .from(patientNotes)
    .where(eq(patientNotes.callId, id))
    .limit(1);
  const recs = await db
    .select()
    .from(recommendations)
    .where(eq(recommendations.callId, id))
    .orderBy(asc(recommendations.rank));
  const audit = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.callId, id))
    .orderBy(asc(auditEvents.createdAt));

  return NextResponse.json({ call, note: note ?? null, recommendations: recs, audit });
}

/** End a call, which kicks off durable post-call processing via Inngest. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    transcript?: string;
    status?: string;
  };

  const [updated] = await db
    .update(calls)
    .set({ status: body.status ?? "ended", endedAt: new Date() })
    .where(eq(calls.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const queued = await sendEvent("call/ended", {
    callId: id,
    transcript: body.transcript ?? "",
  });

  return NextResponse.json({ call: updated, queued });
}
