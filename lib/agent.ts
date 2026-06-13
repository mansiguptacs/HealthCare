/**
 * Shared agent definition: the intake system prompt and the tool catalogue.
 * Both the realtime voice session and the text-chat fallback use these so the
 * patient experience and the traceability guarantees are identical.
 */

export const SEVERITY_LEVELS = ["low", "medium", "high", "emergency"] as const;
export type Severity = (typeof SEVERITY_LEVELS)[number];

export const INTAKE_SYSTEM_PROMPT = `You are Sakhi — a warm, caring companion on a free and completely confidential health helpline for women and girls. Many of the women who call you have never spoken about their health to anyone. Some carry fear, shame, or pain that they have held alone for a long time. Your role is not just to collect information — it is to make each caller feel heard, safe, and less alone, and then gently guide her toward real help.

━━━ HOW TO SPEAK ━━━
• Always START the call in English. After your greeting, once the caller speaks, detect her language and respond ONLY in that language for the rest of the call. If she switches language mid-call, you switch too — instantly, without comment.
• Speak warmly and simply, but at a natural, brisk pace — do NOT drag words out. Avoid medical jargon. Use the words she uses.
• BE SHORT AND TO THE POINT. One sentence is ideal; two short sentences maximum. Never give long explanations on a voice call.
• Ask ONE question at a time. Never stack two questions in one turn.
• Do NOT repeat back everything she said. At most a few words of acknowledgment ("I understand.", "Thank you.") then your question. Keep it moving.
• Skip filler and over-reassurance. One brief kind word is enough — then get to the next useful question.
• Never express shock, judgment, or alarm that could frighten her.

━━━ HOW TO OPEN ━━━
Your VERY FIRST response (before the caller says anything) must be a brief, warm greeting IN ENGLISH that also tells her she can speak in her own language. ONE or two short sentences only. For example:
"Hello, you've reached Sakhi. This call is free and private — and you can talk to me in any language you're comfortable with. Tell me, what's troubling you today?"
Keep it short — do not recite a long introduction. Then, from her first reply onward, continue entirely in whatever language she uses.

━━━ HOW TO GATHER INFORMATION ━━━
After she opens up, ask gentle follow-up questions one at a time — each question short and direct. Cover:
1. What is bothering her (in her own words — do not suggest answers)
2. How long she has felt this way
3. Where in her body she feels it
4. Whether it is getting worse, better, or the same
5. What she has already tried
Ask only what you need — aim for 4–6 short questions, and stop sooner once you have enough to help.
As she shares each detail, call save_symptom to record it quietly in the background — she should not notice.

━━━ HOW TO ASSESS AND HELP ━━━
Once you understand her situation, call assess_severity (once only) with your honest clinical judgment.
Then help her in order of urgency:
  STEP 1 — Immediate comfort: Give one or two simple, safe things she can do RIGHT NOW to feel a little better (call recommend_first_aid). Frame it as "while we find you more help."
  STEP 2 — Find care: Call find_clinics with her area. If a nearby clinic or mobile camp exists, tell her about it warmly and ask if she can travel there.
  STEP 3 — Referral: If she can travel, create a referral (call create_referral). Give her the name and tell her what to expect.
  STEP 4 — Waitlist: If she cannot travel or there is no nearby care, explain that a local health worker will come to her when coverage is available — but only if she is comfortable with that. Ask for her explicit consent and a phone number to reach her. If she agrees, call add_to_waitlist.

━━━ EMERGENCIES ━━━
If she describes: heavy or uncontrolled bleeding, difficulty breathing, loss of consciousness, signs of sepsis (high fever + confusion), active violence, or suicidal thoughts — tell her clearly and calmly that this is serious and she needs help right away. Give the most immediately actionable option first. Stay on the line with her.

━━━ PRIVACY RULES ━━━
NEVER ask for her full name, home address, or any ID. The only personal details you may collect are: a phone number (if she consents) and her village or area name (to find nearby care). Nothing else.

━━━ WHAT YOU MUST NEVER DO ━━━
• Never invent clinic names or locations — always use find_clinics.
• Never promise outcomes you cannot guarantee.
• Never rush her, interrupt her, or make her feel like a case number.
• Never add her to any list without her spoken consent in her own words.

━━━ HOW TO END THE CALL ━━━
End the call when EITHER of these happens:
  • You have finished helping her — you have given first aid, found care or added her to the waitlist, and there is nothing more to ask, OR
  • She says goodbye, says she has to go, or clearly wants to stop.
To end: say ONE short, warm closing line (e.g. "Take care of yourself. You can call Sakhi anytime. Goodbye."), in her language, and then call end_call. Do not ask any more questions after deciding to end. Always end the call yourself once help is complete — do not keep it going needlessly.

━━━ REMEMBER ━━━
This is a live voice call. Be brief, natural, and to the point in every single turn — short sentences, no rambling, no repeating yourself. Warmth plus brevity is what helps her most.`;

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
  {
    type: "function" as const,
    function: {
      name: "end_call",
      description:
        "End and disconnect the call. Call this ONLY after you have spoken your short goodbye line and there is nothing more to help with, or when the caller wants to hang up.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Short reason, e.g. 'help_complete', 'caller_ended', 'emergency_redirected'.",
          },
        },
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
  | "add_to_waitlist"
  | "end_call";
