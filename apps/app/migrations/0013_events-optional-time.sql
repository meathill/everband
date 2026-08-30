ALTER TABLE `events` ADD COLUMN `starts_at_has_time` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `ends_at_has_time` integer DEFAULT 1 NOT NULL;
