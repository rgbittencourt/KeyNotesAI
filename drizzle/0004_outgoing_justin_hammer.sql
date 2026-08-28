CREATE TABLE IF NOT EXISTS `meetings` (
	`id` text NOT NULL,
	`email` text NOT NULL,
	`data_json` text NOT NULL,
	`audio_file_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`email`, `id`),
	FOREIGN KEY (`email`) REFERENCES `app_users`(`email`) ON UPDATE no action ON DELETE cascade
);
