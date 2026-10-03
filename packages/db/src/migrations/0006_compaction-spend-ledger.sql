CREATE TABLE `compaction_spend` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`cost_usd` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `compaction_spend_owner_idx` ON `compaction_spend` (`owner_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `imagery_generations` ADD `call_id` text;