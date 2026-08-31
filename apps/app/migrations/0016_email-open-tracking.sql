ALTER TABLE `email_send_recipients` ADD `open_token` text;--> statement-breakpoint
ALTER TABLE `email_send_recipients` ADD `opened_at` integer;--> statement-breakpoint
ALTER TABLE `email_send_recipients` ADD `open_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `email_send_recipients` ADD `last_opened_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_email_recipients_open_token` ON `email_send_recipients` (`open_token`);--> statement-breakpoint
CREATE TABLE `email_open_events` (
	`id` text PRIMARY KEY NOT NULL,
	`send_id` text NOT NULL,
	`recipient_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`opened_at` integer NOT NULL,
	`user_agent` text,
	`ip_hash` text,
	FOREIGN KEY (`send_id`) REFERENCES `email_sends`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_id`) REFERENCES `email_send_recipients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE INDEX `idx_open_events_recipient` ON `email_open_events` (`recipient_id`,`opened_at`);--> statement-breakpoint
CREATE INDEX `idx_open_events_send` ON `email_open_events` (`send_id`,`opened_at`);
