ALTER TABLE `chat_invites` ADD `allow_signup` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_invites` ADD `created_by_user_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `chat_invites` ADD `mint_mode` text;