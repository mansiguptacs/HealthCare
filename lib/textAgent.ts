import {
  grokChatRaw,
  hasXaiKey,
  type RawChatMessage,
} from "./grok";
import { AGENT_TOOLS, INTAKE_SYSTEM_PROMPT } from "./agent";
import { executeTool, findCareOptions } from "./tools";

export type TurnResult = {
  /** Messages to append to the conversation (assistant + any tool messages). */
  appended: RawChatMessage[];
  /** The user-visible assistant reply for this turn. */
  reply: string;
  mode: "grok" | "scripted";
};

/**
 * Run one conversational turn. Uses real Grok tool-calling when a key is
 * present; otherwise falls back to a scripted triage so the full pipeline
 * (notes, recommendations, waitlist, dashboard) is testable offline.
 */
export async function runTurn(
  callId: string,
  history: RawChatMessage[],
): Promise<TurnResult> {
  if (hasXaiKey()) {
    return runGrokTurn(callId, history);
  }
  return runScriptedTurn(callId, history);
}

async function runGrokTurn(
  callId: string,
  history: RawChatMessage[],
): Promise<TurnResult> {
  const messages: RawChatMessage[] = [
    { role: "system", content: INTAKE_SYSTEM_PROMPT },
    ...history,
  ];
  const appended: RawChatMessage[] = [];

  for (let i = 0; i < 6; i++) {
    const msg = await grokChatRaw({ messages, tools: AGENT_TOOLS });
    messages.push(msg);
    appended.push(msg);

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      for (const tc of msg.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          args = {};
        }
        const result = await executeTool(callId, tc.function.name, args);
        const toolMsg: RawChatMessage = {
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        };
        messages.push(toolMsg);
        appended.push(toolMsg);
      }
      continue;
    }
    return { appended, reply: msg.content ?? "", mode: "grok" };
  }
  return {
    appended,
    reply: appended[appended.length - 1]?.content ?? "",
    mode: "grok",
  };
}

/**
 * Deterministic offline triage. Advances based on how many user turns have
 * happened, calling the same real tools as the live agent.
 */
async function runScriptedTurn(
  callId: string,
  history: RawChatMessage[],
): Promise<TurnResult> {
  const userTurns = history.filter((m) => m.role === "user");
  const lastUser = userTurns[userTurns.length - 1]?.content ?? "";
  const turn = userTurns.length;
  const appended: RawChatMessage[] = [];
  let reply = "";

  if (turn <= 1) {
    await executeTool(callId, "save_symptom", {
      key: "main_complaint",
      value: lastUser,
      problemCategory: "reproductive_health",
    });
    reply =
      "Thank you for trusting me. This line is free and completely confidential. I'm here to help. How long have you been feeling this way, and is the pain or discomfort mild, moderate, or severe?";
  } else if (turn === 2) {
    await executeTool(callId, "save_symptom", {
      key: "duration_and_severity",
      value: lastUser,
    });
    reply =
      "I understand, thank you. What is the name of your village or area, and would you be able to travel a short distance to a clinic if one is nearby?";
  } else if (turn === 3) {
    await executeTool(callId, "save_symptom", {
      key: "location_and_travel",
      value: lastUser,
    });
    await executeTool(callId, "assess_severity", {
      severity: "medium",
      rationale: "Scripted offline assessment based on reported symptoms.",
    });
    await executeTool(callId, "recommend_first_aid", {
      guidance:
        "Rest, stay hydrated, and keep the area clean. Avoid heavy work until you are seen by a health worker.",
    });
    const options = await findCareOptions({ limit: 3 });
    await executeTool(callId, "find_clinics", {});
    if (options.length > 0) {
      const nearest = options[0];
      await executeTool(callId, "create_referral", {
        clinicId: nearest.id,
        clinicName: nearest.name,
        isMobile: nearest.type === "mobile",
        note: "Please carry any previous medical papers if you have them.",
      });
      reply = `For now: rest, stay hydrated, and keep clean. There is care available at "${nearest.name}". If you can travel there, please do. If you cannot reach it, tell me and I can add you to our local list so a health worker reaches out to you - is that okay?`;
    } else {
      reply =
        "For now: rest, stay hydrated, and keep clean. There is no clinic active near you right now. With your permission, I can add you to our local list so a health worker contacts you as soon as a camp opens nearby. Is that okay? (yes/no)";
    }
  } else {
    const said = lastUser.toLowerCase();
    const consent = /yes|okay|ok|sure|please|haan|si|theek/.test(said);
    const res = await executeTool(callId, "add_to_waitlist", { consent });
    if (consent && (res as { ok?: boolean }).ok) {
      reply =
        "Done. You're on our local list and a health worker will reach out as soon as there's coverage near you. You are not alone - please call back any time. Take care.";
    } else {
      reply =
        "That's completely okay. You can call this free line any time, day or night. Please reach out if anything changes. Take care of yourself.";
    }
  }

  const assistantMsg: RawChatMessage = { role: "assistant", content: reply };
  appended.push(assistantMsg);
  return { appended, reply, mode: "scripted" };
}
