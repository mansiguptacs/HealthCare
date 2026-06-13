import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { calls, patientNotes } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

/** Recent calls with their distilled note, for the traceability view. */
export async function GET() {
  const rows = await db
    .select()
    .from(calls)
    .orderBy(desc(calls.startedAt))
    .limit(50);
  const withNotes = await Promise.all(
    rows.map(async (call) => {
      const [note] = await db
        .select()
        .from(patientNotes)
        .where(eq(patientNotes.callId, call.id))
        .limit(1);
      return { ...call, note: note ?? null };
    }),
  );
  return NextResponse.json({ calls: withNotes });
}

/** Start a new helpline interaction. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    phonePartial?: string;
    language?: string;
    region?: string;
    lat?: number;
    lng?: number;
    channel?: string;
  };

  const [call] = await db
    .insert(calls)
    .values({
      phonePartial: body.phonePartial ?? null,
      language: body.language ?? null,
      region: body.region ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      channel: body.channel ?? "voice",
    })
    .returning();

  await recordAudit({
    callId: call.id,
    actor: "system",
    action: "call_started",
    outputs: { channel: call.channel, region: call.region },
  });

  return NextResponse.json({ call });
}
