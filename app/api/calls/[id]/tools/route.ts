import { NextResponse } from "next/server";
import { executeTool } from "@/lib/tools";

export const runtime = "nodejs";

/**
 * Execute an agent tool call for a given call. The realtime voice client posts
 * here when Grok requests a tool, and the text-chat loop uses the same path, so
 * traceability and behaviour are identical across channels.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    arguments?: Record<string, unknown>;
  };

  if (!body.name) {
    return NextResponse.json({ error: "missing_tool_name" }, { status: 400 });
  }

  const result = await executeTool(id, body.name, body.arguments ?? {});
  return NextResponse.json({ result });
}
