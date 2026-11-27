PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_embedding_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`invocation_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`connection_id` text,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`served_model` text,
	`wire` text NOT NULL,
	`task` text NOT NULL,
	`input_count` integer NOT NULL,
	`input_modalities` text NOT NULL,
	`prompt_tokens` integer,
	`total_tokens` integer,
	`token_details` text,
	`response_cache` text,
	`cost_usd` real,
	`cost_provenance` text NOT NULL,
	`cost_details` text,
	`outcome` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`connection_id`) REFERENCES `user_connections`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "embedding_calls_task_check" CHECK(task in ('embed', 'imageEmbed', 'rerank')),
	CONSTRAINT "embedding_calls_outcome_check" CHECK(outcome is null or outcome in ('completed', 'failed')),
	CONSTRAINT "embedding_calls_cost_provenance_check" CHECK(cost_provenance in ('measured', 'estimated', 'unrecorded'))
);
--> statement-breakpoint
INSERT INTO `__new_embedding_calls`("id", "invocation_id", "owner_id", "connection_id", "provider", "model", "served_model", "wire", "task", "input_count", "input_modalities", "prompt_tokens", "total_tokens", "token_details", "response_cache", "cost_usd", "cost_provenance", "cost_details", "outcome", "created_at") SELECT "id", "invocation_id", "owner_id", "connection_id", "provider", "model", "served_model", "wire", "task", "input_count", "input_modalities", "prompt_tokens", "total_tokens", "token_details", "response_cache", "cost_usd", "cost_provenance", "cost_details", "outcome", "created_at" FROM `embedding_calls`;--> statement-breakpoint
DROP TABLE `embedding_calls`;--> statement-breakpoint
ALTER TABLE `__new_embedding_calls` RENAME TO `embedding_calls`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `embedding_calls_owner_idx` ON `embedding_calls` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `embedding_calls_connection_idx` ON `embedding_calls` (`connection_id`);--> statement-breakpoint
CREATE INDEX `embedding_calls_invocation_idx` ON `embedding_calls` (`invocation_id`);