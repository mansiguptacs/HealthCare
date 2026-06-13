import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";

type AuditActor = "grok" | "inngest" | "ngo" | "system";

/**
 * Write a single append-only audit row. Every AI tool call and automated
 * action MUST go through here so the system's behaviour is fully traceable.
 */
export async function recordAudit(params: {
  callId?: string | null;
  actor: AuditActor;
  action: string;
  toolName?: string | null;
  inputs?: Record<string, unknown> | null;
  outputs?: Record<string, unknown> | null;
}): Promise<void> {
  await db.insert(auditEvents).values({
    callId: params.callId ?? null,
    actor: params.actor,
    action: params.action,
    toolName: params.toolName ?? null,
    inputs: params.inputs ?? null,
    outputs: params.outputs ?? null,
  });
}
