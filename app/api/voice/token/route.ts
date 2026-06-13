import { NextResponse } from "next/server";
import { mintRealtimeToken, hasXaiKey, GROK_VOICE_MODEL } from "@/lib/grok";
import { AGENT_TOOLS, INTAKE_SYSTEM_PROMPT } from "@/lib/agent";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";

/**
 * Mint a short-lived ephemeral token so the browser can open a realtime voice
 * session with Grok directly, without ever seeing the real XAI_API_KEY.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { callId?: string };

  if (!hasXaiKey()) {
    return NextResponse.json(
      {
        error: "voice_unavailable",
        message:
          "XAI_API_KEY is not configured. Use the text intake mode to test the full flow, or set the key to enable live voice.",
      },
      { status: 503 },
    );
  }

  try {
    const session = {
      instructions: INTAKE_SYSTEM_PROMPT,
      voice: "eve",
      turn_detection: { type: "server_vad" },
      tools: AGENT_TOOLS,
    };
    const minted = await mintRealtimeToken(session);
    await recordAudit({
      callId: body.callId ?? null,
      actor: "system",
      action: "voice_token_minted",
      outputs: { model: minted.model },
    });
    return NextResponse.json(minted);
  } catch (err) {
    return NextResponse.json(
      { error: "mint_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
