PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_message_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`origin` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "message_assets_origin_check" CHECK(origin in ('attached', 'illustration', 'generated-post', 'inline-reply'))
);
--> statement-breakpoint
INSERT INTO `__new_message_assets`("id", "message_id", "asset_id", "origin", "created_at") SELECT "id", "message_id", "asset_id", "origin", "created_at" FROM `message_assets`;--> statement-breakpoint
DROP TABLE `message_assets`;--> statement-breakpoint
ALTER TABLE `__new_message_assets` RENAME TO `message_assets`;--> statement-breakpoint
CREATE INDEX `message_assets_message_idx` ON `message_assets` (`message_id`);--> statement-breakpoint
CREATE INDEX `message_assets_asset_idx` ON `message_assets` (`asset_id`);--> statement-breakpoint
CREATE TABLE `__new_message_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`idx` integer NOT NULL,
	`content` text NOT NULL,
	`raw_content` text,
	`macro_freezes` text,
	`reasoning` text,
	`reasoning_parts` text,
	`cue` text,
	`cue_role` text,
	`model` text,
	`connection_id` text,
	`connection_attribution_provenance` text DEFAULT 'unrecorded' NOT NULL,
	`provider` text,
	`reasoning_effort` text,
	`tokens_in` integer,
	`tokens_out` integer,
	`token_provenance` text DEFAULT 'unrecorded' NOT NULL,
	`cache_read_tokens` integer,
	`cache_write_tokens` integer,
	`reasoning_tokens` integer,
	`cost_usd` real,
	`cost_provenance` text DEFAULT 'unrecorded' NOT NULL,
	`cost_details` text,
	`context_window` integer,
	`context_boundary_message_id` text,
	`max_output_tokens` integer,
	`ttft_ms` integer,
	`finish_reason` text,
	`stop_reason` text,
	`terminal_reason` text,
	`api_error_status` integer,
	`tool_calls` text,
	`variable_delta` text,
	`macro_draws` text,
	`params` text,
	`prompt_snapshot` text,
	`gen_started_at` integer,
	`gen_finished_at` integer,
	`generation_id` text,
	`pre_continue_content` text,
	`pre_continue_reasoning` text,
	`last_continuation_content` text,
	`last_continuation_reasoning` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `user_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`context_boundary_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "message_variants_token_provenance_check" CHECK(token_provenance in ('measured', 'estimated', 'unrecorded')),
	CONSTRAINT "message_variants_cost_provenance_check" CHECK(cost_provenance in ('measured', 'estimated', 'unrecorded')),
	CONSTRAINT "message_variants_finish_reason_check" CHECK(finish_reason is null or finish_reason in ('stop', 'length', 'filter', 'tool', 'other')),
	CONSTRAINT "message_variants_reasoning_effort_check" CHECK(reasoning_effort is null or reasoning_effort in ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max')),
	CONSTRAINT "message_variants_cue_role_check" CHECK(cue_role is null or cue_role in ('user', 'turn-scoped-system')),
	CONSTRAINT "message_variants_connection_attribution_provenance_check" CHECK(connection_attribution_provenance in ('recorded', 'unrecorded')),
	CONSTRAINT "message_variants_connection_attribution_coherence_check" CHECK(connection_id is null or connection_attribution_provenance = 'recorded')
);
--> statement-breakpoint
INSERT INTO `__new_message_variants`("id", "message_id", "idx", "content", "raw_content", "macro_freezes", "reasoning", "reasoning_parts", "cue", "cue_role", "model", "connection_id", "connection_attribution_provenance", "provider", "reasoning_effort", "tokens_in", "tokens_out", "token_provenance", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens", "cost_usd", "cost_provenance", "cost_details", "context_window", "context_boundary_message_id", "max_output_tokens", "ttft_ms", "finish_reason", "stop_reason", "terminal_reason", "api_error_status", "tool_calls", "variable_delta", "macro_draws", "params", "prompt_snapshot", "gen_started_at", "gen_finished_at", "generation_id", "pre_continue_content", "pre_continue_reasoning", "last_continuation_content", "last_continuation_reasoning", "metadata", "created_at") SELECT "id", "message_id", "idx", "content", "raw_content", "macro_freezes", "reasoning", "reasoning_parts", "cue", "cue_role", "model", "connection_id", CASE WHEN "connection_id" IS NOT NULL THEN 'recorded' ELSE 'unrecorded' END, "provider", "reasoning_effort", "tokens_in", "tokens_out", "token_provenance", "cache_read_tokens", "cache_write_tokens", "reasoning_tokens", "cost_usd", "cost_provenance", "cost_details", "context_window", "context_boundary_message_id", "max_output_tokens", "ttft_ms", "finish_reason", "stop_reason", "terminal_reason", "api_error_status", "tool_calls", "variable_delta", "macro_draws", "params", "prompt_snapshot", "gen_started_at", "gen_finished_at", "generation_id", "pre_continue_content", "pre_continue_reasoning", "last_continuation_content", "last_continuation_reasoning", "metadata", "created_at" FROM `message_variants`;--> statement-breakpoint
DROP TABLE `message_variants`;--> statement-breakpoint
ALTER TABLE `__new_message_variants` RENAME TO `message_variants`;--> statement-breakpoint
CREATE UNIQUE INDEX `message_variants_message_idx_unique` ON `message_variants` (`message_id`,`idx`);--> statement-breakpoint
CREATE INDEX `message_variants_context_boundary_idx` ON `message_variants` (`context_boundary_message_id`);--> statement-breakpoint
CREATE INDEX `message_variants_connection_idx` ON `message_variants` (`connection_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
