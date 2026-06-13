import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { campRequests } from "@/db/schema";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db
    .select()
    .from(campRequests)
    .orderBy(desc(campRequests.createdAt));
  return NextResponse.json({ campRequests: rows });
}

/** An NGO submits a request to set up a camp at a location. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    ngoId?: string;
    region?: string;
    lat?: number;
    lng?: number;
    services?: string[];
    note?: string;
  };

  if (body.lat == null || body.lng == null) {
    return NextResponse.json(
      { error: "lat and lng are required" },
      { status: 400 },
    );
  }

  const [camp] = await db
    .insert(campRequests)
    .values({
      ngoId: body.ngoId ?? null,
      region: body.region ?? null,
      lat: body.lat,
      lng: body.lng,
      services: body.services ?? [],
      note: body.note ?? null,
      status: "requested",
    })
    .returning();

  await recordAudit({
    actor: "ngo",
    action: "camp_requested",
    outputs: { campRequestId: camp.id, region: camp.region },
  });

  return NextResponse.json({ campRequest: camp });
}
