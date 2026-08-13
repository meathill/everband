ALTER TABLE `memberships` ADD `staff_access` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `households` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `contacts` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `students` ADD `deleted_at` integer;
