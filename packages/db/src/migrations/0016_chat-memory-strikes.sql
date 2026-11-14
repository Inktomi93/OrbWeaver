CREATE TABLE `chat_memory_strikes` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`scoped_character_id` text,
	`tier` integer NOT NULL,
	`message_start_id` text NOT NULL,
	`message_end_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`topic_anchor` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scoped_character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chat_memory_strikes_tier_check" CHECK(tier >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_memory_strikes_shared_unique` ON `chat_memory_strikes` (`chat_id`,`tier`,`message_start_id`,`message_end_id`) WHERE scoped_character_id is null;--> statement-breakpoint
CREATE UNIQUE INDEX `chat_memory_strikes_scoped_unique` ON `chat_memory_strikes` (`chat_id`,`scoped_character_id`,`tier`,`message_start_id`,`message_end_id`) WHERE scoped_character_id is not null;--> statement-breakpoint
CREATE INDEX `chat_memory_strikes_scoped_character_idx` ON `chat_memory_strikes` (`scoped_character_id`);