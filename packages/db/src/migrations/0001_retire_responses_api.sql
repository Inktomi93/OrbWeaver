-- Backfill BEFORE the rebuild, not after: the 12-step copy below re-INSERTs every row through the
-- NARROWED CHECK, so a surviving `responses` row would abort the migration. `responses` was only ever
-- reachable on the openai-compat wire, which now speaks `chat-completions` alone (owner ruling
-- 2026-09-20 — the OpenRouter Responses runner was demolished with `@openrouter/sdk` in 146f71cd5 and
-- never replaced), so that is the one landing the row can have.
UPDATE `user_connections` SET `api` = 'chat-completions' WHERE `api` = 'responses';--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`label` text NOT NULL,
	`provider_id` text NOT NULL,
	`credential_id` text,
	`base_url` text,
	`model` text NOT NULL,
	`api` text DEFAULT 'auto' NOT NULL,
	`declared` text,
	`extras` text,
	`transport` text,
	`model_listed` integer DEFAULT true NOT NULL,
	`allow_background` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`credential_id`) REFERENCES `user_credentials`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "user_connections_api_check" CHECK(api in ('chat-completions', 'agent-sdk', 'anthropic-messages', 'auto'))
);
--> statement-breakpoint
INSERT INTO `__new_user_connections`("id", "owner_id", "label", "provider_id", "credential_id", "base_url", "model", "api", "declared", "extras", "transport", "model_listed", "allow_background", "created_at", "updated_at") SELECT "id", "owner_id", "label", "provider_id", "credential_id", "base_url", "model", "api", "declared", "extras", "transport", "model_listed", "allow_background", "created_at", "updated_at" FROM `user_connections`;--> statement-breakpoint
DROP TABLE `user_connections`;--> statement-breakpoint
ALTER TABLE `__new_user_connections` RENAME TO `user_connections`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_connections_owner_label_unique` ON `user_connections` (`owner_id`,`label`);--> statement-breakpoint
CREATE INDEX `user_connections_credential_idx` ON `user_connections` (`credential_id`);