CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete', 'status_change', 'role_change', 'link', 'login', 'logout', 'register');--> statement-breakpoint
CREATE TYPE "public"."event_entity_type" AS ENUM('project', 'member', 'deployment', 'change', 'incident', 'incident_update', 'incident_link');--> statement-breakpoint
CREATE TYPE "public"."event_source" AS ENUM('api', 'github', 'system');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('project.created', 'project.updated', 'project.deleted', 'member.added', 'member.role_changed', 'member.removed', 'deployment.recorded', 'deployment.enriched', 'change.recorded', 'incident.created', 'incident.status_changed', 'incident.severity_changed', 'incident.assignee_added', 'incident.assignee_removed', 'incident.update_added', 'incident.resolved', 'incident.reopened', 'incident.link_added', 'incident.link_confirmed', 'incident.link_rejected', 'correlation.suggested', 'fingerprint.grouped');--> statement-breakpoint
CREATE TYPE "public"."incident_link_entity_type" AS ENUM('deployment', 'change');--> statement-breakpoint
CREATE TYPE "public"."incident_link_source" AS ENUM('manual', 'suggested');--> statement-breakpoint
CREATE TYPE "public"."incident_link_status" AS ENUM('suggested', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."webhook_delivery_status" AS ENUM('received', 'processed', 'duplicate', 'failed');--> statement-breakpoint
CREATE TYPE "public"."webhook_provider" AS ENUM('github');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incident_assignees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'responder' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incident_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"entity_type" "incident_link_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"source" "incident_link_source" DEFAULT 'manual' NOT NULL,
	"status" "incident_link_status" DEFAULT 'suggested' NOT NULL,
	"score" numeric(5, 4),
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"algorithm_version" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incident_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"author_id" uuid,
	"kind" text DEFAULT 'comment' NOT NULL,
	"body" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"sequence" bigserial NOT NULL,
	"type" "event_type" NOT NULL,
	"entity_type" "event_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"actor_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_late" boolean DEFAULT false NOT NULL,
	"idempotency_key" text NOT NULL,
	"source" "event_source" DEFAULT 'api' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"actor_id" uuid,
	"actor_email" text,
	"action" "audit_action" NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"diff" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"delivery_id" text NOT NULL,
	"event" text NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'received' NOT NULL,
	"payload" jsonb,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" "webhook_provider" DEFAULT 'github' NOT NULL,
	"name" text NOT NULL,
	"secret" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incident_assignees" ADD CONSTRAINT "incident_assignees_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incident_assignees" ADD CONSTRAINT "incident_assignees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incident_links" ADD CONSTRAINT "incident_links_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incident_links" ADD CONSTRAINT "incident_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incident_updates" ADD CONSTRAINT "incident_updates_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "incident_assignees_incident_user_idx" ON "incident_assignees" USING btree ("incident_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_assignees_user_idx" ON "incident_assignees" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "incident_links_incident_entity_idx" ON "incident_links" USING btree ("incident_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_links_entity_idx" ON "incident_links" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_links_status_idx" ON "incident_links" USING btree ("incident_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incident_updates_incident_created_idx" ON "incident_updates" USING btree ("incident_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "events_project_idempotency_idx" ON "events" USING btree ("project_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_project_occurred_sequence_idx" ON "events" USING btree ("project_id","occurred_at","sequence");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_project_received_idx" ON "events" USING btree ("project_id","received_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_entity_idx" ON "events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_project_type_idx" ON "events" USING btree ("project_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_late_idx" ON "events" USING btree ("project_id","is_late");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_project_created_idx" ON "audit_logs" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_deliveries_endpoint_delivery_idx" ON "webhook_deliveries" USING btree ("endpoint_id","delivery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_project_received_idx" ON "webhook_deliveries" USING btree ("project_id","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_endpoints_project_idx" ON "webhook_endpoints" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_expires_idx" ON "refresh_tokens" USING btree ("expires_at");