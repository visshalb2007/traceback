CREATE TYPE "public"."change_type" AS ENUM('commit', 'pull_request', 'merge');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('queued', 'in_progress', 'success', 'failed', 'rolled_back', 'cancelled', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."environment" AS ENUM('production', 'staging', 'development', 'preview', 'test');--> statement-breakpoint
CREATE TYPE "public"."incident_severity" AS ENUM('sev1', 'sev2', 'sev3', 'sev4');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('open', 'investigating', 'mitigated', 'resolved', 'closed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"service" text NOT NULL,
	"environment" "environment" NOT NULL,
	"status" "deployment_status" DEFAULT 'unknown' NOT NULL,
	"version" text,
	"commit_sha" text,
	"commit_message" text,
	"branch" text,
	"author_email" text,
	"author_name" text,
	"url" text,
	"external_id" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"deployment_id" uuid,
	"type" "change_type" DEFAULT 'commit' NOT NULL,
	"sha" text NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"author_email" text,
	"author_name" text,
	"branch" text,
	"url" text,
	"files_changed" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"services" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"severity" "incident_severity" DEFAULT 'sev3' NOT NULL,
	"status" "incident_status" DEFAULT 'open' NOT NULL,
	"service" text,
	"error_signature" text,
	"affected_components" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"environment" text,
	"fingerprint" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"detected_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution" text,
	"row_version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "changes" ADD CONSTRAINT "changes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "changes" ADD CONSTRAINT "changes_deployment_id_deployments_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_project_started_idx" ON "deployments" USING btree ("project_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_project_service_idx" ON "deployments" USING btree ("project_id","service","environment");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_commit_sha_idx" ON "deployments" USING btree ("project_id","commit_sha");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_external_id_idx" ON "deployments" USING btree ("project_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "changes_project_sha_idx" ON "changes" USING btree ("project_id","sha");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "changes_project_created_idx" ON "changes" USING btree ("project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "changes_project_author_idx" ON "changes" USING btree ("project_id","author_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "changes_files_changed_gin" ON "changes" USING gin ("files_changed");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "changes_services_gin" ON "changes" USING gin ("services");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_project_fingerprint_idx" ON "incidents" USING btree ("project_id","fingerprint");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_project_started_idx" ON "incidents" USING btree ("project_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_project_status_idx" ON "incidents" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "incidents_project_severity_idx" ON "incidents" USING btree ("project_id","severity");