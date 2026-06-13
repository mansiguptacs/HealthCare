import { NextResponse } from "next/server";
import { db } from "@/db/client";
import { ngos } from "@/db/schema";

export const runtime = "nodejs";

export async function GET() {
  const rows = await db.select().from(ngos);
  return NextResponse.json({ ngos: rows });
}
