CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`otp_hash` text NOT NULL,
	`purpose` text NOT NULL,
	`membership_id` text,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`request_ip` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_auth_tokens_token_hash` ON `auth_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_email_created` ON `auth_tokens` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `audit_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_membership_id` text,
	`action` text NOT NULL,
	`object_type` text NOT NULL,
	`object_id` text NOT NULL,
	`summary_json` text,
	`request_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_org_created` ON `audit_entries` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_org_object` ON `audit_entries` (`organization_id`,`object_type`,`object_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`role` text NOT NULL,
	`status` text NOT NULL,
	`invited_email` text NOT NULL,
	`invited_by_membership_id` text,
	`accepted_at` integer,
	`operational_email_opt_out` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_memberships_org_user` ON `memberships` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_memberships_user` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_memberships_org_email` ON `memberships` (`organization_id`,`invited_email`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'band' NOT NULL,
	`timezone` text NOT NULL,
	`contact_email` text,
	`public_profile_enabled` integer DEFAULT false NOT NULL,
	`public_slug` text,
	`public_display_name` text,
	`public_summary` text,
	`public_logo_attachment_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_public_slug_unique` ON `organizations` (`public_slug`);