CREATE TABLE `google_drive_integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`account_email` text NOT NULL,
	`encrypted_refresh_token` text NOT NULL,
	`root_folder_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
