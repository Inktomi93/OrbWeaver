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
	`model_check` text DEFAULT 'unchecked' NOT NULL,
	`allow_background` integer DEFAULT false NOT NULL,
	`prompt_cache` text,
	`seed_slot` text,
	`seed_model` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`credential_id`) REFERENCES `user_credentials`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "user_connections_seed_slot_check" CHECK(seed_slot is null or seed_slot in ('embed', 'rerank')),
	CONSTRAINT "user_connections_api_check" CHECK(api in ('chat-completions', 'responses', 'agent-sdk', 'anthropic-messages', 'google-generative-ai', 'auto')),
	CONSTRAINT "user_connections_model_check_check" CHECK(model_check in ('listed', 'unlisted', 'unchecked'))
);
--> statement-breakpoint
INSERT INTO `__new_user_connections`("id", "owner_id", "label", "provider_id", "credential_id", "base_url", "model", "api", "declared", "extras", "transport", "model_check", "allow_background", "prompt_cache", "seed_slot", "seed_model", "created_at", "updated_at") SELECT "id", "owner_id", "label", "provider_id", "credential_id", "base_url", "model", "api", "declared", "extras", "transport", "model_check", "allow_background", "prompt_cache", "seed_slot", "seed_model", "created_at", "updated_at" FROM `user_connections`;--> statement-breakpoint
DROP TABLE `user_connections`;--> statement-breakpoint
ALTER TABLE `__new_user_connections` RENAME TO `user_connections`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_connections_owner_label_unique` ON `user_connections` (`owner_id`,`label`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_connections_owner_seed_slot_unique` ON `user_connections` (`owner_id`,`seed_slot`);--> statement-breakpoint
CREATE INDEX `user_connections_credential_idx` ON `user_connections` (`credential_id`);