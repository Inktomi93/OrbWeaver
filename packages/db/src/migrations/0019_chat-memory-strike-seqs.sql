PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chat_memory_strikes` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`scoped_character_id` text,
	`tier` integer NOT NULL,
	`message_start_id` text NOT NULL,
	`message_end_id` text NOT NULL,
	`seq_start` integer NOT NULL,
	`seq_end` integer NOT NULL,
	`content_hash` text NOT NULL,
	`topic_anchor` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scoped_character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chat_memory_strikes_tier_check" CHECK(tier >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_chat_memory_strikes`("id", "chat_id", "scoped_character_id", "tier", "message_start_id", "message_end_id", "seq_start", "seq_end", "content_hash", "topic_anchor", "created_at")
SELECT "id", "chat_id", "scoped_character_id", "tier", "message_start_id", "message_end_id", "seq_start", "seq_end", "content_hash", "topic_anchor", "created_at"
FROM (
  SELECT s.*,
    COALESCE(
      (SELECT m.`seq` FROM `messages` m WHERE m.`id` = s.`message_start_id` AND m.`chat_id` = s.`chat_id`),
      CASE WHEN s.`tier` = 0 THEN (SELECT MIN(g.`seq_start`) FROM `chat_digests` d JOIN `chat_segments` g ON g.`chat_id` = d.`chat_id` AND g.`block_idx` = d.`block_idx` WHERE d.`chat_id` = s.`chat_id` AND d.`tier` = 0 AND d.`content_hash` = s.`content_hash`) END,
      (SELECT m.`seq` FROM `messages` m WHERE m.`id` = s.`message_end_id` AND m.`chat_id` = s.`chat_id`)
    ) AS "seq_start",
    COALESCE(
      (SELECT m.`seq` FROM `messages` m WHERE m.`id` = s.`message_end_id` AND m.`chat_id` = s.`chat_id`),
      CASE WHEN s.`tier` = 0 THEN (SELECT MAX(g.`seq_end`) FROM `chat_digests` d JOIN `chat_segments` g ON g.`chat_id` = d.`chat_id` AND g.`block_idx` = d.`block_idx` WHERE d.`chat_id` = s.`chat_id` AND d.`tier` = 0 AND d.`content_hash` = s.`content_hash`) END,
      (SELECT m.`seq` FROM `messages` m WHERE m.`id` = s.`message_start_id` AND m.`chat_id` = s.`chat_id`)
    ) AS "seq_end"
  FROM `chat_memory_strikes` s
)
WHERE "seq_start" IS NOT NULL AND "seq_end" IS NOT NULL;--> statement-breakpoint
DROP TABLE `chat_memory_strikes`;--> statement-breakpoint
ALTER TABLE `__new_chat_memory_strikes` RENAME TO `chat_memory_strikes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `chat_memory_strikes_span_unique` ON `chat_memory_strikes` (`chat_id`,`tier`,`message_start_id`,`message_end_id`);--> statement-breakpoint
CREATE INDEX `chat_memory_strikes_scoped_character_idx` ON `chat_memory_strikes` (`scoped_character_id`);