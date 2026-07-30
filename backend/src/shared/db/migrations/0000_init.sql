CREATE TYPE "public"."account_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."bug_layer" AS ENUM('frontend', 'backend', 'integration', 'mobile', 'infrastructure');--> statement-breakpoint
CREATE TYPE "public"."bug_priority" AS ENUM('p1', 'p2', 'p3', 'p4');--> statement-breakpoint
CREATE TYPE "public"."bug_severity" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."bug_status" AS ENUM('open', 'assigned', 'in_progress', 'fixed', 'ready_for_qa', 'verified', 'closed', 'reopened');--> statement-breakpoint
CREATE TYPE "public"."content_source" AS ENUM('ai', 'manual', 'imported', 'seeded');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."input_method" AS ENUM('description', 'structured', 'log');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."project_type" AS ENUM('web_application', 'mobile_application', 'api', 'microservices', 'other');--> statement-breakpoint
CREATE TYPE "public"."testcase_priority" AS ENUM('critical', 'high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."testcase_status" AS ENUM('not_executed', 'passed', 'failed', 'blocked', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."testcase_type" AS ENUM('functional', 'negative', 'edge', 'security', 'boundary', 'scenario');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'qa_lead', 'qa_engineer');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"project_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bug_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bug_id" uuid NOT NULL,
	"changed_field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bugs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bug_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"module" text DEFAULT '' NOT NULL,
	"layer" "bug_layer" NOT NULL,
	"severity" "bug_severity" NOT NULL,
	"priority" "bug_priority" NOT NULL,
	"status" "bug_status" DEFAULT 'open' NOT NULL,
	"environment" text DEFAULT '' NOT NULL,
	"precondition" text DEFAULT '' NOT NULL,
	"current_behavior" text[] DEFAULT '{}' NOT NULL,
	"steps_to_reproduce" text[] DEFAULT '{}' NOT NULL,
	"expected_result" text DEFAULT '' NOT NULL,
	"actual_result" text DEFAULT '' NOT NULL,
	"impact" text DEFAULT '' NOT NULL,
	"reporter_id" uuid,
	"assignee_id" uuid,
	"possible_root_cause" text,
	"suggested_fix" text,
	"similar_bugs" text[] DEFAULT '{}' NOT NULL,
	"missing_info" text[] DEFAULT '{}' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"ai_confidence" numeric(5, 2),
	"source" "content_source" DEFAULT 'manual' NOT NULL,
	"generation_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "bugs_bug_id_uk" UNIQUE("bug_id"),
	CONSTRAINT "bugs_version_check" CHECK ("bugs"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"module" text,
	"sub_module" text,
	"feature" text,
	"input_hash" text,
	"provider" text,
	"model" text,
	"agents" text[] DEFAULT '{}' NOT NULL,
	"raw_case_count" integer,
	"merged_case_count" integer,
	"duplicates_removed" integer,
	"coverage_score" numeric(5, 2),
	"status" "generation_status" DEFAULT 'running' NOT NULL,
	"error" text,
	"duration_ms" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"changed_field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" "project_type" DEFAULT 'web_application' NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "projects_code_uk" UNIQUE("code"),
	CONSTRAINT "projects_version_check" CHECK ("projects"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "reports_version_check" CHECK ("reports"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "test_case_bugs" (
	"test_case_id" uuid NOT NULL,
	"bug_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_case_bugs_test_case_id_bug_id_pk" PRIMARY KEY("test_case_id","bug_id")
);
--> statement-breakpoint
CREATE TABLE "test_case_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_case_id" uuid NOT NULL,
	"changed_field" text NOT NULL,
	"old_value" text,
	"new_value" text,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tc_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	"module" text NOT NULL,
	"sub_module" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" "testcase_type" DEFAULT 'functional' NOT NULL,
	"priority" "testcase_priority" DEFAULT 'medium' NOT NULL,
	"test_steps" text[] DEFAULT '{}' NOT NULL,
	"expected_result" text DEFAULT '' NOT NULL,
	"test_status" "testcase_status" DEFAULT 'not_executed' NOT NULL,
	"actual_result" text DEFAULT '' NOT NULL,
	"assigned_to_id" uuid,
	"execution_date" date,
	"comments" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"source" "content_source" DEFAULT 'manual' NOT NULL,
	"generation_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "test_cases_tc_id_uk" UNIQUE("tc_id"),
	CONSTRAINT "test_cases_version_check" CHECK ("test_cases"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_project_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"project_role" "user_role" NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "upa_user_project_uk" UNIQUE("user_id","project_id"),
	CONSTRAINT "upa_version_check" CHECK ("user_project_assignments"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'qa_engineer' NOT NULL,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"password_hash" text NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_version_check" CHECK ("users"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_history" ADD CONSTRAINT "bug_history_bug_id_bugs_id_fk" FOREIGN KEY ("bug_id") REFERENCES "public"."bugs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bug_history" ADD CONSTRAINT "bug_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bugs" ADD CONSTRAINT "bugs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generations" ADD CONSTRAINT "generations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_history" ADD CONSTRAINT "project_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_history" ADD CONSTRAINT "project_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_bugs" ADD CONSTRAINT "test_case_bugs_test_case_id_test_cases_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_bugs" ADD CONSTRAINT "test_case_bugs_bug_id_bugs_id_fk" FOREIGN KEY ("bug_id") REFERENCES "public"."bugs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_history" ADD CONSTRAINT "test_case_history_test_case_id_test_cases_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_history" ADD CONSTRAINT "test_case_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_project_assignments" ADD CONSTRAINT "user_project_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_project_assignments" ADD CONSTRAINT "user_project_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_project_assignments" ADD CONSTRAINT "user_project_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_project_assignments" ADD CONSTRAINT "user_project_assignments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_created_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activity_log_project_idx" ON "activity_log" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_log_actor_idx" ON "activity_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_log_entity_idx" ON "activity_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "bug_history_bug_idx" ON "bug_history" USING btree ("bug_id","changed_at");--> statement-breakpoint
CREATE INDEX "bugs_project_idx" ON "bugs" USING btree ("project_id") WHERE "bugs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "bugs_project_status_idx" ON "bugs" USING btree ("project_id","status") WHERE "bugs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "bugs_severity_idx" ON "bugs" USING btree ("severity") WHERE "bugs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "bugs_priority_idx" ON "bugs" USING btree ("priority") WHERE "bugs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "bugs_layer_idx" ON "bugs" USING btree ("layer") WHERE "bugs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "bugs_created_idx" ON "bugs" USING btree ("created_at") WHERE "bugs"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "generations_input_hash_uidx" ON "generations" USING btree ("input_hash") WHERE "generations"."input_hash" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "generations_project_idx" ON "generations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_history_project_idx" ON "project_history" USING btree ("project_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_name_lower_uidx" ON "projects" USING btree (lower("name")) WHERE "projects"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status") WHERE "projects"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_token_hash_uidx" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "test_case_bugs_bug_idx" ON "test_case_bugs" USING btree ("bug_id");--> statement-breakpoint
CREATE INDEX "test_case_history_tc_idx" ON "test_case_history" USING btree ("test_case_id","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "test_cases_dedup_uidx" ON "test_cases" USING btree ("project_id","module","name") WHERE "test_cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "test_cases_project_idx" ON "test_cases" USING btree ("project_id") WHERE "test_cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "test_cases_project_status_idx" ON "test_cases" USING btree ("project_id","test_status") WHERE "test_cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "test_cases_priority_idx" ON "test_cases" USING btree ("priority") WHERE "test_cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "test_cases_type_idx" ON "test_cases" USING btree ("type") WHERE "test_cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "test_cases_created_idx" ON "test_cases" USING btree ("created_at") WHERE "test_cases"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "upa_user_idx" ON "user_project_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "upa_project_idx" ON "user_project_assignments" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_uidx" ON "users" USING btree (lower("email")) WHERE "users"."deleted_at" IS NULL;