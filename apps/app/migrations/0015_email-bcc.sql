ALTER TABLE `email_sends` ADD `bcc` text;--> statement-breakpoint
ALTER TABLE `dev_outbox` ADD `bcc` text;--> statement-breakpoint
ALTER TABLE `email_drafts` ADD `bcc` text;
