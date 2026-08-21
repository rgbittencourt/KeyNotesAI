CREATE TABLE `drive_exports` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`local_meeting_id` text NOT NULL,
	`meeting_title` text NOT NULL,
	`folder_id` text NOT NULL,
	`folder_url` text NOT NULL,
	`files_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`email`) REFERENCES `app_users`(`email`) ON UPDATE no action ON DELETE cascade
);
