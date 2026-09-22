PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_session_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`sdk_session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`seeded_through_seq` integer NOT NULL,
	`canon_hash` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`connection_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `user_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_session_entries`("id", "chat_id", "sdk_session_id", "seq", "seeded_through_seq", "canon_hash", "is_primary", "connection_id", "created_at") SELECT "id", "chat_id", "sdk_session_id", "seq", "seeded_through_seq", "canon_hash", "is_primary", "connection_id", "created_at" FROM `session_entries` WHERE `connection_id` IS NOT NULL;--> statement-breakpoint
DROP TABLE `session_entries`;--> statement-breakpoint
ALTER TABLE `__new_session_entries` RENAME TO `session_entries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `session_entries_chat_seq_unique` ON `session_entries` (`chat_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_entries_sdk_session_unique` ON `session_entries` (`sdk_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_entries_primary_unique` ON `session_entries` (`chat_id`,`connection_id`) WHERE "session_entries"."is_primary" = 1;--> statement-breakpoint
CREATE INDEX `session_entries_connection_idx` ON `session_entries` (`connection_id`);
