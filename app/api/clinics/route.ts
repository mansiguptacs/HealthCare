import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { clinics } from "@/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db.select().from(clinics);
  return NextResponse.json({ clinics: rows });
}
