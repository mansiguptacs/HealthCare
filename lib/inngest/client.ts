import { Inngest } from "inngest";

export type Events = {
  "call/ended": { data: { callId: string; transcript?: string } };
  "camp/activated": {
    data: { campRequestId: string; region?: string; lat?: number; lng?: number };
  };
};

export const inngest = new Inngest({
  id: "sakhi-helpline",
  schemas: undefined,
  // Run in dev mode locally (talks to the Inngest Dev Server, no signing key
  // required). In production, INNGEST_SIGNING_KEY / INNGEST_EVENT_KEY take over.
  isDev: process.env.NODE_ENV !== "production" || process.env.INNGEST_DEV === "1",
});

/**
 * Fire an Inngest event without ever failing the request. When the Inngest dev
 * server (npm run inngest) or Inngest Cloud is configured, the durable function
 * runs; otherwise we log and continue so the user-facing flow is unaffected.
 */
export async function sendEvent(
  name: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    await inngest.send({ name, data });
    return true;
  } catch (err) {
    console.warn(
      `[inngest] event "${name}" not delivered (is the dev server running?):`,
      (err as Error).message,
    );
    return false;
  }
}
