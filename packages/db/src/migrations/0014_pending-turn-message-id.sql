ALTER TABLE `pending_turns` ADD `message_id` text REFERENCES messages(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `pending_turns_message_idx` ON `pending_turns` (`message_id`);