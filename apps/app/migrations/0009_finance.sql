CREATE TABLE `ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`direction` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'posted' NOT NULL,
	`created_by_membership_id` text NOT NULL,
	`updated_by_membership_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`voided_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_org_date` ON `ledger_entries` (`organization_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `idx_ledger_entries_org_status` ON `ledger_entries` (`organization_id`,`status`);--> statement-breakpoint
ALTER TABLE `organizations` ADD `currency_code` text DEFAULT 'AUD' NOT NULL;