CREATE TABLE `dev_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`to_email` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL
);
