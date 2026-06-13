import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { campRequests } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { sendEvent } from "@/lib/inngest/client";

export const runtime = "nodejs";

/**
 * Update a camp request status. Moving a camp to "active" makes it count as live
 * coverage (so the patient agent can recommend it) and triggers the durable
 * waitlist-notification workflow.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  const status = body.status ?? "active";

  const [updated] = await db
    .update(campRequests)
    .set({ status })
    .where(eq(campRequests.id, id))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await recordAudit({
    actor: "ngo",
    action: "camp_status_changed",
    outputs: { campRequestId: id, status },
  });

  if (status === "active") {
    await sendEvent("camp/activated", {
      campRequestId: id,
      region: updated.region ?? undefined,
      lat: updated.lat,
      lng: updated.lng,
    });
  }

  return NextResponse.json({ campRequest: updated });
}
