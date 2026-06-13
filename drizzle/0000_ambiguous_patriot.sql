CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"tool_name" text,
	"inputs" jsonb,
	"outputs" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_partial" text,
	"language" text,
	"region" text,
	"lat" double precision,
	"lng" double precision,
	"channel" text DEFAULT 'voice',
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "camp_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ngo_id" uuid,
	"region" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"services" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'requested' NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'fixed' NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"region" text,
	"services" jsonb DEFAULT '[]'::jsonb,
	"availability" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ngos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"coverage_regions" jsonb DEFAULT '[]'::jsonb,
	"contact_email" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"problem_category" text,
	"summary" text,
	"structured_symptoms" jsonb,
	"severity" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid NOT NULL,
	"type" text NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"payload" jsonb,
	"model_version" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" uuid,
	"region" text,
	"lat" double precision,
	"lng" double precision,
	"problem_category" text,
	"severity" text,
	"phone_partial" text,
	"consent" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "camp_requests" ADD CONSTRAINT "camp_requests_ngo_id_ngos_id_fk" FOREIGN KEY ("ngo_id") REFERENCES "public"."ngos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_notes" ADD CONSTRAINT "patient_notes_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;