CREATE TABLE `email_send_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`send_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`contact_id` text,
	`status` text NOT NULL,
	`error` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`send_id`) REFERENCES `email_sends`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_email_recipients_send_email` ON `email_send_recipients` (`send_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_email_recipients_send_status` ON `email_send_recipients` (`send_id`,`status`);--> statement-breakpoint
CREATE TABLE `email_sends` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`object_type` text NOT NULL,
	`object_id` text NOT NULL,
	`requested_by_membership_id` text NOT NULL,
	`dedup_key` text NOT NULL,
	`status` text NOT NULL,
	`recipient_count` integer DEFAULT 0 NOT NULL,
	`sent_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`suppressed_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_email_sends_dedup` ON `email_sends` (`dedup_key`);--> statement-breakpoint
CREATE INDEX `idx_email_sends_org_created` ON `email_sends` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`link_path` text,
	`object_type` text,
	`object_id` text,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_notifications_membership_read` ON `notifications` (`membership_id`,`read_at`);