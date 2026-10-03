DROP TABLE `daily_stats`;--> statement-breakpoint
CREATE TABLE `daily_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`bucket_start` integer NOT NULL,
	`chats_created` integer DEFAULT 0 NOT NULL,
	`user_turns` integer DEFAULT 0 NOT NULL,
	`assistant_turns` integer DEFAULT 0 NOT NULL,
	`system_turns` integer DEFAULT 0 NOT NULL,
	`swipes` integer DEFAULT 0 NOT NULL,
	`user_words` integer DEFAULT 0 NOT NULL,
	`assistant_words` integer DEFAULT 0 NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`tokens_in_measured_samples` integer DEFAULT 0 NOT NULL,
	`tokens_in_estimated_samples` integer DEFAULT 0 NOT NULL,
	`tokens_out_measured_samples` integer DEFAULT 0 NOT NULL,
	`tokens_out_estimated_samples` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`cost_samples` integer DEFAULT 0 NOT NULL,
	`gen_time_ms` integer DEFAULT 0 NOT NULL,
	`message_dates_approx` integer DEFAULT false NOT NULL,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_stats_owner_bucket_unique` ON `daily_stats` (`owner_id`,`bucket_start`);