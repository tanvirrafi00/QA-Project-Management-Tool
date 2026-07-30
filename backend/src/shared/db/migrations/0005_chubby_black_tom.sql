CREATE TYPE "public"."complexity_level" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."estimation_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'revision_requested', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."project_version_status" AS ENUM('draft', 'active', 'locked');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TABLE "estimation_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimation_id" uuid NOT NULL,
	"changed_field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estimation_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "estimation_modules_version_check" CHECK ("estimation_modules"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "estimation_review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"estimation_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text,
	"action" text NOT NULL,
	"actor_id" uuid,
	"actor_name" text,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"engineer_id" uuid NOT NULL,
	"engineer_name" text DEFAULT '' NOT NULL,
	"project_id" uuid NOT NULL,
	"daily_capacity_hours" numeric(5, 2) DEFAULT '8' NOT NULL,
	"role" "user_role" DEFAULT 'qa_engineer' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "module_assignments_version_check" CHECK ("module_assignments"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "module_estimations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid,
	"module_id" uuid NOT NULL,
	"engineer_id" uuid NOT NULL,
	"engineer_name" text DEFAULT '' NOT NULL,
	"project_id" uuid NOT NULL,
	"test_case_count" integer,
	"estimated_hours" numeric(6, 2),
	"complexity" "complexity_level",
	"risk_level" "risk_level",
	"assumptions" text DEFAULT '' NOT NULL,
	"dependencies" text[] DEFAULT '{}' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" "estimation_status" DEFAULT 'draft' NOT NULL,
	"reviewer_id" uuid,
	"review_comment" text,
	"reviewed_at" timestamp with time zone,
	"is_final_approved" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "module_estimations_version_check" CHECK ("module_estimations"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"status" "project_version_status" DEFAULT 'draft' NOT NULL,
	"target_date" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "project_versions_version_check" CHECK ("project_versions"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "estimation_history" ADD CONSTRAINT "estimation_history_estimation_id_module_estimations_id_fk" FOREIGN KEY ("estimation_id") REFERENCES "public"."module_estimations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimation_history" ADD CONSTRAINT "estimation_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimation_modules" ADD CONSTRAINT "estimation_modules_version_id_project_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."project_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimation_modules" ADD CONSTRAINT "estimation_modules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimation_modules" ADD CONSTRAINT "estimation_modules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimation_modules" ADD CONSTRAINT "estimation_modules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimation_review_events" ADD CONSTRAINT "estimation_review_events_estimation_id_module_estimations_id_fk" FOREIGN KEY ("estimation_id") REFERENCES "public"."module_estimations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estimation_review_events" ADD CONSTRAINT "estimation_review_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_assignments" ADD CONSTRAINT "module_assignments_module_id_estimation_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."estimation_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_assignments" ADD CONSTRAINT "module_assignments_engineer_id_users_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_assignments" ADD CONSTRAINT "module_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_assignments" ADD CONSTRAINT "module_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_assignments" ADD CONSTRAINT "module_assignments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_estimations" ADD CONSTRAINT "module_estimations_assignment_id_module_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."module_assignments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_estimations" ADD CONSTRAINT "module_estimations_module_id_estimation_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."estimation_modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_estimations" ADD CONSTRAINT "module_estimations_engineer_id_users_id_fk" FOREIGN KEY ("engineer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_estimations" ADD CONSTRAINT "module_estimations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_estimations" ADD CONSTRAINT "module_estimations_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_estimations" ADD CONSTRAINT "module_estimations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_estimations" ADD CONSTRAINT "module_estimations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_versions" ADD CONSTRAINT "project_versions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "estimation_history_estimation_idx" ON "estimation_history" USING btree ("estimation_id","changed_at");--> statement-breakpoint
CREATE INDEX "estimation_modules_project_idx" ON "estimation_modules" USING btree ("project_id") WHERE "estimation_modules"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "estimation_modules_version_idx" ON "estimation_modules" USING btree ("version_id") WHERE "estimation_modules"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "estimation_review_events_estimation_idx" ON "estimation_review_events" USING btree ("estimation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "module_assignments_module_engineer_uidx" ON "module_assignments" USING btree ("module_id","engineer_id") WHERE "module_assignments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "module_assignments_engineer_idx" ON "module_assignments" USING btree ("engineer_id") WHERE "module_assignments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "module_assignments_module_idx" ON "module_assignments" USING btree ("module_id") WHERE "module_assignments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "module_assignments_project_idx" ON "module_assignments" USING btree ("project_id") WHERE "module_assignments"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "module_estimations_project_status_idx" ON "module_estimations" USING btree ("project_id","status") WHERE "module_estimations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "module_estimations_module_idx" ON "module_estimations" USING btree ("module_id") WHERE "module_estimations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "module_estimations_engineer_status_idx" ON "module_estimations" USING btree ("engineer_id","status") WHERE "module_estimations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "module_estimations_final_idx" ON "module_estimations" USING btree ("module_id") WHERE "module_estimations"."is_final_approved" AND "module_estimations"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "project_versions_name_lower_uidx" ON "project_versions" USING btree ("project_id",lower("name")) WHERE "project_versions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "project_versions_project_idx" ON "project_versions" USING btree ("project_id") WHERE "project_versions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "test_cases_sort_order_idx" ON "test_cases" USING btree ("sort_order") WHERE "test_cases"."deleted_at" IS NULL;