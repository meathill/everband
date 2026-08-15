CREATE TABLE `email_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`subject` text NOT NULL,
	`cc` text,
	`html` text NOT NULL,
	`text` text NOT NULL,
	`recipients_json` text NOT NULL,
	`selection_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_email_drafts_org_member` ON `email_drafts` (`organization_id`,`membership_id`);
--> statement-breakpoint
CREATE INDEX `idx_email_drafts_org_updated` ON `email_drafts` (`organization_id`,`updated_at`);
