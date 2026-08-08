CREATE TABLE `import_job_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`row_number` integer NOT NULL,
	`outcome` text NOT NULL,
	`error` text,
	`result_student_id` text,
	FOREIGN KEY (`job_id`) REFERENCES `import_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_import_rows_job_row` ON `import_job_rows` (`job_id`,`row_number`);--> statement-breakpoint
CREATE INDEX `idx_import_rows_org_job` ON `import_job_rows` (`organization_id`,`job_id`);--> statement-breakpoint
CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`dedup_key` text NOT NULL,
	`status` text NOT NULL,
	`total_rows` integer DEFAULT 0 NOT NULL,
	`created_count` integer DEFAULT 0 NOT NULL,
	`updated_count` integer DEFAULT 0 NOT NULL,
	`skipped_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`requested_by_membership_id` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_import_jobs_dedup` ON `import_jobs` (`dedup_key`);--> statement-breakpoint
CREATE INDEX `idx_import_jobs_org_created` ON `import_jobs` (`organization_id`,`created_at`);