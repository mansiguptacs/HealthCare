import { NextResponse } from "next/server";
import { runTurn } from "@/lib/textAgent";
import type { RawChatMessage } from "@/lib/grok";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Text-mode intake turn. The client sends the full message history (including
 * tool messages); we run one agent turn and return the messages to append.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    messages?: RawChatMessage[];
  };
  const history = body.messages ?? [];

  try {
    const result = await runTurn(id, history);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "turn_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
