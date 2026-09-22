ALTER TABLE `chat_stream_events` ADD `generation_id` text;--> statement-breakpoint
ALTER TABLE `chats` ADD `stream_seq` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `chats`
SET `stream_seq` = COALESCE(
  (SELECT MAX(`seq`) FROM `chat_stream_events` WHERE `chat_stream_events`.`chat_id` = `chats`.`id`),
  0
);
