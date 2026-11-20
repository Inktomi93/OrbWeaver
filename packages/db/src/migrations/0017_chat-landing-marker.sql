ALTER TABLE `chats` ADD `landing_at` integer;--> statement-breakpoint
CREATE INDEX `chats_landing_idx` ON `chats` (`landing_at`) WHERE "chats"."landing_at" IS NOT NULL;