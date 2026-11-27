PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chat_generation_observations` (
	`chat_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`source_message_id` text,
	`source_variant_id` text,
	`funder_user_id` text NOT NULL,
	`connection_id` text,
	`model` text NOT NULL,
	`served_model` text,
	`provider` text NOT NULL,
	`wire` text NOT NULL,
	`tokens_in` integer,
	`tokens_out` integer,
	`reasoning_tokens` integer,
	`cache_read_tokens` integer,
	`cache_write_tokens` integer,
	`token_details` text,
	`response_cache` text,
	`cost_usd` real,
	`cost_provenance` text NOT NULL,
	`cost_details` text,
	`context_window` integer,
	`max_output_tokens` integer,
	`model_calls` integer,
	`duration_api_ms` real,
	`ttft_ms` real,
	`finish_reason` text,
	`stop_reason` text,
	`terminal_reason` text,
	`generation_id` text,
	`observed_at` integer NOT NULL,
	PRIMARY KEY(`chat_id`, `turn_id`, `ordinal`),
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_variant_id`) REFERENCES `message_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`funder_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`connection_id`) REFERENCES `user_connections`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chat_generation_observations_ordinal_check" CHECK(ordinal >= 0),
	CONSTRAINT "chat_generation_observations_source_shape" CHECK(source_variant_id is null or source_message_id is not null),
	CONSTRAINT "chat_generation_observations_wire_check" CHECK(wire in ('openai-compat', 'anthropic-messages', 'google-generative-ai', 'agent-sdk', 'local-light')),
	CONSTRAINT "chat_generation_observations_cost_provenance_check" CHECK(cost_provenance in ('measured', 'estimated', 'unrecorded')),
	CONSTRAINT "chat_generation_observations_finish_reason_check" CHECK(finish_reason is null or finish_reason in ('stop', 'length', 'filter', 'tool', 'other'))
);
--> statement-breakpoint
INSERT INTO `__new_chat_generation_observations`("chat_id", "turn_id", "ordinal", "source_message_id", "source_variant_id", "funder_user_id", "connection_id", "model", "served_model", "provider", "wire", "tokens_in", "tokens_out", "reasoning_tokens", "cache_read_tokens", "cache_write_tokens", "token_details", "response_cache", "cost_usd", "cost_provenance", "cost_details", "context_window", "max_output_tokens", "model_calls", "duration_api_ms", "ttft_ms", "finish_reason", "stop_reason", "terminal_reason", "generation_id", "observed_at") SELECT "chat_id", "turn_id", "ordinal", "source_message_id", "source_variant_id", "funder_user_id", "connection_id", "model", "served_model", "provider", "wire", "tokens_in", "tokens_out", "reasoning_tokens", "cache_read_tokens", "cache_write_tokens", "token_details", "response_cache", "cost_usd", "cost_provenance", "cost_details", "context_window", "max_output_tokens", "model_calls", "duration_api_ms", "ttft_ms", "finish_reason", "stop_reason", "terminal_reason", "generation_id", "observed_at" FROM `chat_generation_observations`;--> statement-breakpoint
DROP TABLE `chat_generation_observations`;--> statement-breakpoint
ALTER TABLE `__new_chat_generation_observations` RENAME TO `chat_generation_observations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `chat_generation_observations_source_message_idx` ON `chat_generation_observations` (`source_message_id`);--> statement-breakpoint
CREATE INDEX `chat_generation_observations_source_variant_idx` ON `chat_generation_observations` (`source_variant_id`);--> statement-breakpoint
CREATE INDEX `chat_generation_observations_funder_idx` ON `chat_generation_observations` (`funder_user_id`,`observed_at`);--> statement-breakpoint
CREATE INDEX `chat_generation_observations_connection_idx` ON `chat_generation_observations` (`connection_id`);--> statement-breakpoint
ALTER TABLE `automation_owner_budgets` DROP COLUMN `updated_at`;--> statement-breakpoint
ALTER TABLE `character_personas` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `chat_handoff_resumptions` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `plugin_provider_claims` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `duplicate_chat_pairs` DROP COLUMN `csls_score`;--> statement-breakpoint
ALTER TABLE `duplicate_chat_pairs` DROP COLUMN `model`;--> statement-breakpoint
ALTER TABLE `character_embeddings` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `document_chunks` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `embed_generations` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `image_analyses` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `image_embeddings` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `plugin_kv` DROP COLUMN `updated_at`;--> statement-breakpoint
ALTER TABLE `character_regex_scripts` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `chat_regex_scripts` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `global_regex_scripts` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `preset_regex_scripts` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `session_entries` DROP COLUMN `seeded_through_seq`;--> statement-breakpoint
ALTER TABLE `session_entries` DROP COLUMN `canon_hash`;--> statement-breakpoint
ALTER TABLE `session_entries` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `oidc_pending_signups` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `label`;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `updated_at`;--> statement-breakpoint
ALTER TABLE `character_tags` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `chat_tags` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `persona_tags` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `preset_tags` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `world_book_tags` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `character_books` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `chat_books` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `global_books` DROP COLUMN `created_at`;--> statement-breakpoint
ALTER TABLE `persona_books` DROP COLUMN `created_at`;