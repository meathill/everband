CREATE TABLE `rehearsal_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`series_id` text NOT NULL,
	`local_date` text NOT NULL,
	`starts_at_utc` integer NOT NULL,
	`ends_at_utc` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`series_id`) REFERENCES `rehearsal_series`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_occurrences_series_date` ON `rehearsal_occurrences` (`series_id`,`local_date`);--> statement-breakpoint
CREATE INDEX `idx_occurrences_org_start` ON `rehearsal_occurrences` (`organization_id`,`starts_at_utc`);--> statement-breakpoint
CREATE TABLE `rehearsal_series` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`term_id` text NOT NULL,
	`group_id` text,
	`weekday` integer NOT NULL,
	`start_time_local` text NOT NULL,
	`end_time_local` text NOT NULL,
	`location` text,
	`helpers_needed` integer DEFAULT 1 NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_series_org_term` ON `rehearsal_series` (`organization_id`,`term_id`);--> statement-breakpoint
CREATE TABLE `roster_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`occurrence_id` text NOT NULL,
	`household_id` text NOT NULL,
	`source` text NOT NULL,
	`is_locked` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`occurrence_id`) REFERENCES `rehearsal_occurrences`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_roster_org_occurrence` ON `roster_assignments` (`organization_id`,`occurrence_id`);--> statement-breakpoint
CREATE TABLE `swap_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	`requested_by_membership_id` text NOT NULL,
	`note` text,
	`status` text NOT NULL,
	`decided_by_membership_id` text,
	`decided_at` integer,
	`replacement_household_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assignment_id`) REFERENCES `roster_assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_swaps_org_status` ON `swap_requests` (`organization_id`,`status`);