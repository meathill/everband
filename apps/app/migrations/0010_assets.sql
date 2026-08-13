CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`serial_number` text,
	`current_holder_student_id` text,
	`notes` text,
	`qr_code_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by_membership_id` text NOT NULL,
	`updated_by_membership_id` text NOT NULL,
	`retired_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_holder_student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`qr_code_id`) REFERENCES `qr_codes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_assets_org_status` ON `assets` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_assets_org_holder` ON `assets` (`organization_id`,`current_holder_student_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_assets_qr_code` ON `assets` (`qr_code_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_qr_codes_current_asset` ON `qr_codes` (`organization_id`,`target_type`,`target_object_id`) WHERE "qr_codes"."target_type" = 'asset' AND "qr_codes"."status" != 'broken';
