CREATE TABLE `trello_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`local_meeting_id` text NOT NULL,
	`card_id` text NOT NULL,
	`card_url` text NOT NULL,
	`checklist_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`email`) REFERENCES `app_users`(`email`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trello_exports_meeting` ON `trello_exports` (`email`,`local_meeting_id`);
--> statement-breakpoint
CREATE TABLE `trello_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`board_name` text NOT NULL,
	`list_id` text NOT NULL,
	`list_name` text NOT NULL,
	`updated_at` text NOT NULL
);
