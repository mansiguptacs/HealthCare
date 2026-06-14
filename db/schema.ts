import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  doublePrecision,
} from "drizzle-orm/pg-core";

/**
 * A single inbound helpline interaction. We intentionally keep PII minimal:
 * only a partial/masked phone number and a coarse region are stored.
 */
export const calls = pgTable("calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  phonePartial: text("phone_partial"),
  language: text("language"),
  region: text("region"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  channel: text("channel").default("voice"), // voice | text
  status: text("status").notNull().default("active"), // active | ended | processed
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
});

/** Structured clinical note distilled from the conversation. */
export const patientNotes = pgTable("patient_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  callId: uuid("call_id")
    .notNull()
    .references(() => calls.id, { onDelete: "cascade" }),
  problemCategory: text("problem_category"),
  summary: text("summary"),
  structuredSymptoms: jsonb("structured_symptoms").$type<Record<string, unknown>>(),
  severity: text("severity"), // low | medium | high | emergency
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Append-only record of every recommendation surfaced to a patient.
 * This table is never updated or deleted: it is the traceability backbone.
 */
export const recommendations = pgTable("recommendations", {
  id: uuid("id").primaryKey().defaultRandom(),
  callId: uuid("call_id")
    .notNull()
    .references(() => calls.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // first_aid | clinic_referral | mobile_clinic | ngo_waitlist
  rank: integer("rank").notNull().default(0),
  payload: jsonb("payload").$type<Record<string, unknown>>(),
  modelVersion: text("model_version"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Append-only audit log. Every AI tool call and automated action writes a row
 * here so that nothing the system did is invisible after the fact.
 */
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  callId: uuid("call_id"),
  actor: text("actor").notNull(), // grok | inngest | ngo | system
  action: text("action").notNull(),
  toolName: text("tool_name"),
  inputs: jsonb("inputs").$type<Record<string, unknown>>(),
  outputs: jsonb("outputs").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Fixed and mobile healthcare delivery points. */
export const clinics = pgTable("clinics", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull().default("fixed"), // fixed | mobile
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  region: text("region"),
  services: jsonb("services").$type<string[]>().default([]),
  availability: text("availability"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Partner NGOs / providers that can deploy camps. */
export const ngos = pgTable("ngos", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  coverageRegions: jsonb("coverage_regions").$type<string[]>().default([]),
  contactEmail: text("contact_email"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** An NGO's request to set up a camp at a given location. */
export const campRequests = pgTable("camp_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  ngoId: uuid("ngo_id").references(() => ngos.id, { onDelete: "set null" }),
  region: text("region"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  services: jsonb("services").$type<string[]>().default([]),
  status: text("status").notNull().default("requested"), // requested | approved | active
  note: text("note"),
  scheduledFor: timestamp("scheduled_for"),
  expectedReach: integer("expected_reach"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Patients who could not reach care now and consented to be contacted when
 * coverage becomes available in their region.
 */
export const waitlistEntries = pgTable("waitlist_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  callId: uuid("call_id").references(() => calls.id, { onDelete: "cascade" }),
  region: text("region"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  problemCategory: text("problem_category"),
  severity: text("severity"),
  phonePartial: text("phone_partial"),
  consent: boolean("consent").notNull().default(false),
  status: text("status").notNull().default("waiting"), // waiting | notified | served
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Call = typeof calls.$inferSelect;
export type PatientNote = typeof patientNotes.$inferSelect;
export type Recommendation = typeof recommendations.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type Clinic = typeof clinics.$inferSelect;
export type Ngo = typeof ngos.$inferSelect;
export type CampRequest = typeof campRequests.$inferSelect;
export type WaitlistEntry = typeof waitlistEntries.$inferSelect;
