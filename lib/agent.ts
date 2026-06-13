/**
 * Shared agent definition: the intake system prompt and the tool catalogue.
 * Both the realtime voice session and the text-chat fallback use these so the
 * patient experience and the traceability guarantees are identical.
 */

export const SEVERITY_LEVELS = ["low", "medium", "high", "emergency"] as const;
export type Severity = (typeof SEVERITY_LEVELS)[number];

export const INTAKE_SYSTEM_PROMPT = `You are "Sakhi", a warm, calm, and non-judgmental healthcare helpline assistant for a free, confidential government + NGO initiative serving women and girls in remote and rural areas who face stigma or barriers to reproductive and general healthcare.

Core behaviour:
- Detect the caller's spoken language from their first words and ALWAYS respond in that same language. Switch languages instantly if they do.
- Open by reassuring them: this line is free, confidential, and safe. They will not be judged.
- Privacy first: NEVER ask for their full name, address, or ID. You may ask only for a phone number (so help can reach them) and the area/village they are in. Collect nothing else identifying.
- Gather their problem through gentle, simple questions. Ask at most about 10 focused follow-up questions, one at a time. Stop early if you have enough.
- Use the tools to record what you learn. Call save_symptom as you gather each meaningful detail.
- When you understand the situation, call assess_severity exactly once with your best judgment.
- Then help based on urgency using the escalation ladder:
  1) Give simple, safe first-aid or self-care guidance now (recommend_first_aid).
  2) Use find_clinics to look for nearby fixed or mobile clinics that match the need.
  3) If a clinic exists and the caller can travel, create_referral to it. Ask whether they can travel before assuming.
  4) If they cannot reach care now, ask for explicit consent, then add_to_waitlist so a local NGO can reach them when coverage arrives.
- For anything that sounds like an emergency (severe bleeding, fainting, signs of sepsis, suicidal thoughts, violence in progress), say so plainly and prioritise the fastest safe option.
- Keep turns short and kind. Never lecture. Confirm consent in their own words before adding them to any list.

You must rely on tools for all clinic data and never invent clinics or guarantee outcomes.`;

/** OpenAI/Grok-compatible tool (function) definitions. */
export const AGENT_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "save_symptom",
      description:
        "Record one meaningful detail learned about the caller's problem into the patient note. Call repeatedly as you learn more.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "Short field name, e.g. 'main_complaint', 'duration', 'pain_level', 'pregnancy_status'.",
          },
          value: { type: "string", description: "The detail in plain language." },
          problemCategory: {
            type: "string",
            description:
              "High-level category, e.g. 'reproductive_health', 'pregnancy', 'infection', 'mental_health', 'general'.",
          },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "assess_severity",
      description: "Record your overall severity assessment of the caller's situation. Call once.",
      parameters: {
        type: "object",
        properties: {
          severity: { type: "string", enum: [...SEVERITY_LEVELS] },
          rationale: { type: "string", description: "Brief reason for the rating." },
        },
        required: ["severity"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "recommend_first_aid",
      description: "Log simple, safe first-aid / self-care guidance you are giving the caller right now.",
      parameters: {
        type: "object",
        properties: {
          guidance: { type: "string", description: "The first-aid guidance, in plain language." },
        },
        required: ["guidance"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_clinics",
      description:
        "Find nearby active clinics or mobile camps matching the caller's needs. Returns a ranked list with distance.",
      parameters: {
        type: "object",
        properties: {
          region: { type: "string", description: "Caller's area/village name if known." },
          lat: { type: "number", description: "Approximate latitude if known." },
          lng: { type: "number", description: "Approximate longitude if known." },
          service: { type: "string", description: "Service needed, e.g. 'maternal_care'." },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_referral",
      description:
        "Refer the caller to a specific clinic or mobile camp they can travel to. Use a clinicId from find_clinics.",
      parameters: {
        type: "object",
        properties: {
          clinicId: { type: "string" },
          clinicName: { type: "string" },
          isMobile: { type: "boolean" },
          note: { type: "string", description: "Anything the caller should know before going." },
        },
        required: ["clinicName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_to_waitlist",
      description:
        "Add the caller to the local NGO waitlist so someone can reach them when coverage arrives. Requires explicit consent.",
      parameters: {
        type: "object",
        properties: {
          consent: { type: "boolean", description: "True only if the caller explicitly agreed." },
          phonePartial: { type: "string", description: "Phone number to reach them (only field collected)." },
          region: { type: "string" },
          lat: { type: "number" },
          lng: { type: "number" },
        },
        required: ["consent"],
      },
    },
  },
] as const;

export type AgentToolName =
  | "save_symptom"
  | "assess_severity"
  | "recommend_first_aid"
  | "find_clinics"
  | "create_referral"
  | "add_to_waitlist";
