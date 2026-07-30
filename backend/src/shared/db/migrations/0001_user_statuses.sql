ALTER TYPE "public"."account_status" ADD VALUE 'pending_approval';--> statement-breakpoint
ALTER TYPE "public"."account_status" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."account_status" ADD VALUE 'suspended';