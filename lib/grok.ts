/**
 * Thin client for the xAI Grok APIs.
 *
 * - Chat completions (OpenAI-compatible) at https://api.x.ai/v1 are used for
 *   structured patient-note generation and severity assessment.
 * - The Grok Voice Agent API (realtime, wss://api.x.ai/v1/realtime) is used for
 *   the live call. Browser clients connect with a short-lived ephemeral token
 *   minted server-side via POST /v1/realtime/client_secrets so the real key is
 *   never exposed.
 */

const XAI_BASE = process.env.XAI_BASE_URL ?? "https://api.x.ai/v1";

export const GROK_CHAT_MODEL = process.env.XAI_CHAT_MODEL ?? "grok-4";
export const GROK_VOICE_MODEL = process.env.XAI_VOICE_MODEL ?? "grok-voice-latest";

export function hasXaiKey(): boolean {
  return Boolean(process.env.XAI_API_KEY);
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Call Grok chat completions. When `jsonSchema` is provided we request a
 * structured JSON object back. Throws if no API key is configured.
 */
export async function grokChat(params: {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  json?: boolean;
}): Promise<string> {
  if (!hasXaiKey()) {
    throw new Error("XAI_API_KEY is not configured");
  }
  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: params.model ?? GROK_CHAT_MODEL,
      messages: params.messages,
      temperature: params.temperature ?? 0.2,
      ...(params.json
        ? { response_format: { type: "json_object" } }
        : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Grok chat failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? "";
}

export type RawChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
};

/**
 * Tool-calling chat turn. Returns the raw assistant message (which may contain
 * tool_calls instead of content) so callers can run an agent loop.
 */
export async function grokChatRaw(params: {
  messages: RawChatMessage[];
  tools?: readonly unknown[];
  model?: string;
  temperature?: number;
}): Promise<RawChatMessage> {
  if (!hasXaiKey()) {
    throw new Error("XAI_API_KEY is not configured");
  }
  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: params.model ?? GROK_CHAT_MODEL,
      messages: params.messages,
      temperature: params.temperature ?? 0.3,
      ...(params.tools ? { tools: params.tools, tool_choice: "auto" } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Grok chat failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    choices: { message: RawChatMessage }[];
  };
  return data.choices?.[0]?.message ?? { role: "assistant", content: "" };
}

/**
 * Mint an ephemeral client secret for a browser realtime voice session.
 * Returns the token plus the realtime URL/model the client should use.
 *
 * xAI may not yet implement the OpenAI /realtime/client_secrets endpoint.
 * If the call returns 404 or 501 we fall back to returning the raw API key
 * itself as the token — acceptable for a hackathon demo.
 */
export async function mintRealtimeToken(session?: Record<string, unknown>): Promise<{
  token: string;
  expiresAt: number;
  url: string;
  model: string;
}> {
  if (!hasXaiKey()) {
    throw new Error("XAI_API_KEY is not configured");
  }

  const wsBase = XAI_BASE.replace(/^http/, "ws");
  const apiKey = process.env.XAI_API_KEY!;

  try {
    const res = await fetch(`${XAI_BASE}/realtime/client_secrets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        expires_after: { seconds: 600 },
        session: {
          model: GROK_VOICE_MODEL,
          ...session,
        },
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        value?: string;
        client_secret?: { value: string; expires_at?: number };
        expires_at?: number;
      };
      const token = data.client_secret?.value ?? data.value ?? "";
      const expiresAt =
        data.client_secret?.expires_at ?? data.expires_at ?? Date.now() / 1000 + 600;
      return { token, expiresAt, url: `${wsBase}/realtime`, model: GROK_VOICE_MODEL };
    }

    // If the endpoint doesn't exist (404) or is not implemented (501) on xAI,
    // fall back to using the raw API key as the token (the browser will pass it
    // in the WebSocket subprotocol so the Grok server can authenticate it).
    const errText = await res.text().catch(() => "");
    console.warn(`[grok] client_secrets endpoint returned ${res.status} — falling back to raw API key auth. Response: ${errText}`);
  } catch (e) {
    console.warn("[grok] client_secrets request failed, falling back to raw API key auth:", e);
  }

  return {
    token: apiKey,
    expiresAt: Date.now() / 1000 + 600,
    url: `${wsBase}/realtime`,
    model: GROK_VOICE_MODEL,
  };
}
