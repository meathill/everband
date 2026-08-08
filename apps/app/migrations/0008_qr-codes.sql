CREATE TABLE `qr_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_object_id` text NOT NULL,
	`dyqr_alias` text NOT NULL,
	`short_url` text NOT NULL,
	`current_target_url` text NOT NULL,
	`status` text NOT NULL,
	`scan_count` integer,
	`last_stats_sync_at` integer,
	`created_by_membership_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_qr_codes_alias` ON `qr_codes` (`dyqr_alias`);--> statement-breakpoint
CREATE INDEX `idx_qr_codes_org` ON `qr_codes` (`organization_id`,`target_type`);