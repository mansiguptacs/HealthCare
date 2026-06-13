# Sakhi - Women's Healthcare Helpline

A free, confidential, **voice-first** healthcare helpline for women and girls in
remote and rural areas who face stigma or barriers to reproductive and general
care. Callers speak to a Grok Voice agent in their own language; it triages with
care and connects them to the nearest help. On the other side, NGOs and
providers see exactly where need is concentrated and deploy camps - which then
feed back into what the helpline can offer.

Built with **xAI Grok / Grok Voice**, **Next.js on Vercel**, and **Inngest**
durable workflows. Every AI recommendation is fully traceable.

## What's inside

| Area | Path |
| --- | --- |
| Landing page | `app/page.tsx` |
| Patient helpline (voice + text intake) | `app/call/page.tsx` |
| NGO impact dashboard (demand heatmap) | `app/dashboard/` |
| Traceability views | `app/trace/` |
| Grok client (chat + realtime token) | `lib/grok.ts` |
| Browser voice client (realtime audio) | `lib/voice/realtimeClient.ts` |
| Agent prompt + tool catalogue | `lib/agent.ts` |
| Tool execution + escalation ladder | `lib/tools.ts` |
| Durable workflows | `lib/inngest/functions.ts` |
| Database schema (Drizzle) | `db/schema.ts` |

## Architecture

- **Patient side**: the browser mints a short-lived ephemeral token from
  `/api/voice/token` (the real `XAI_API_KEY` never leaves the server), then
  connects directly to the Grok Voice Agent API over WebSocket. Grok calls
  backend tools mid-call to save notes and look up clinics.
- **Traceability**: every tool call and automated action writes an append-only
  row to `audit_events`; every recommendation shown is an append-only
  `recommendations` row. Nothing the system does is invisible afterwards.
- **Durable processing**: when a call ends, an Inngest function distils a clean
  structured note + severity. When an NGO camp goes active, another function
  notifies matching waitlisted callers.
- **Privacy**: only a partial phone number, coarse region, and high-level
  problem are stored. The dashboard aggregates demand into ~11km cells.

## Prerequisites

- Node 20+ (`nvm use 20`)
- That's it. The database is **embedded** (PGlite), so no Postgres server needed.

## Setup

```bash
npm install
cp .env.example .env.local   # optional: add XAI_API_KEY for live voice + real LLM notes
npm run db:push              # create tables in the local embedded DB
npm run db:seed              # load demo NGOs, clinics, and demand
```

### Run it (two terminals)

```bash
# Terminal 1 - the app
npm run dev

# Terminal 2 - Inngest dev server (durable workflows)
npm run inngest
```

Open http://localhost:3000.

> Important: PGlite is single-process and file-backed. Stop `npm run dev`
> before running any `db:*` script, and shut the dev server down cleanly
> (Ctrl+C). If a hard kill ever corrupts the local DB, just run
> `npm run db:reset` to wipe and re-seed it.

## Offline vs. live mode

- **Without `XAI_API_KEY`** (default): the helpline runs a built-in **text
  intake** that drives the exact same tools, notes, recommendations, and
  dashboard - so the whole product is demoable with zero credentials. Live
  voice is disabled and post-call summaries use a deterministic fallback.
- **With `XAI_API_KEY`**: the "Start voice call" button opens a real Grok Voice
  session, and Grok writes the structured notes.

## 3-minute demo script

1. **Landing** (`/`): one free, confidential number for women's health.
2. **Helpline** (`/call`): click **Use text intake**. Type a problem
   (e.g. "I have severe pain and bleeding", then a duration, then your village
   and whether you can travel, then "yes" to consent). Watch the right-hand
   panel fill in: severity, captured notes, and a **ranked, traceable**
   recommendation ladder (first aid -> clinic referral -> NGO waitlist).
3. **End call** -> **View trace** (`/trace/[id]`): show the full audit trail -
   every tool Grok called, with inputs/outputs, plus the durable "call
   processed" summary from Inngest.
4. **Dashboard** (`/dashboard`): the map shows anonymous demand. Under-served
   areas glow red as **recommended camp locations**. Click **Request camp** on
   the top target, then **Activate** it.
5. Back on the dashboard, that area turns to **coverage** (teal) and waitlisted
   callers there are auto-notified - closing the loop from need to deployment.

## Deploying to Vercel

- Swap `db/client.ts` for a Neon / Vercel Postgres client
  (`drizzle-orm/neon-http`) reading `DATABASE_URL`, then run `db:push` against it.
- Add the Inngest Vercel integration; set `INNGEST_SIGNING_KEY` /
  `INNGEST_EVENT_KEY` and `XAI_API_KEY` as environment variables.

## Sponsor tech

- **xAI Grok Voice Agent API** - realtime multilingual speech-to-speech intake
  with tool calling (`wss://api.x.ai/v1/realtime`).
- **xAI Grok** - structured note + severity generation (OpenAI-compatible chat).
- **Vercel** - Next.js hosting.
- **Inngest** - durable, retryable post-call and notification workflows.
