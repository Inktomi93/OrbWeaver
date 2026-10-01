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
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`credential_id`) REFERENCES `user_credentials`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "user_connections_seed_slot_check" CHECK(seed_slot is null or seed_slot in ('embed', 'rerank')),
	CONSTRAINT "user_connections_api_check" CHECK(api in ('chat-completions', 'agent-sdk', 'anthropic-messages', 'google-generative-ai', 'auto')),
	CONSTRAINT "user_connections_model_check_check" CHECK(model_check in ('listed', 'unlisted', 'unchecked'))
);
--> statement-breakpoint
INSERT INTO `__new_user_connections`("id", "owner_id", "label", "provider_id", "credential_id", "base_url", "model", "api", "declared", "extras", "transport", "model_check", "allow_background", "prompt_cache", "seed_slot", "created_at", "updated_at") SELECT "id", "owner_id", "label", "provider_id", "credential_id", "base_url", "model", "api", "declared", "extras", "transport", "model_check", "allow_background", "prompt_cache", "seed_slot", "created_at", "updated_at" FROM `user_connections`;--> statement-breakpoint
DROP TABLE `user_connections`;--> statement-breakpoint
ALTER TABLE `__new_user_connections` RENAME TO `user_connections`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_connections_owner_label_unique` ON `user_connections` (`owner_id`,`label`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_connections_owner_seed_slot_unique` ON `user_connections` (`owner_id`,`seed_slot`);--> statement-breakpoint
CREATE INDEX `user_connections_credential_idx` ON `user_connections` (`credential_id`);--> statement-breakpoint
CREATE TABLE `__new_provider_rows` (
	`id` text NOT NULL,
	`label` text NOT NULL,
	`wire` text NOT NULL,
	`dialect` text,
	`auth` text NOT NULL,
	`base_url` text,
	`apis` text NOT NULL,
	`serves` text,
	`catalog` text NOT NULL,
	`metered` integer NOT NULL,
	`docs_url` text,
	`features` text,
	`definition_hash` text NOT NULL,
	`origin_kind` text NOT NULL,
	`origin_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`id`, `definition_hash`),
	FOREIGN KEY (`origin_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "provider_rows_wire_check" CHECK(wire in ('openai-compat', 'anthropic-messages', 'google-generative-ai', 'agent-sdk', 'local-light')),
	CONSTRAINT "provider_rows_dialect_check" CHECK(dialect is null or dialect in ('openai-compatible', 'openrouter')),
	CONSTRAINT "provider_rows_auth_check" CHECK(auth in ('apiKey', 'oauthToken', 'endpoint', 'none')),
	CONSTRAINT "provider_rows_catalog_check" CHECK(catalog in ('url', 'builtin')),
	CONSTRAINT "provider_rows_origin_kind_check" CHECK(origin_kind in ('plugin', 'admin')),
	CONSTRAINT "provider_rows_origin_shape_check" CHECK((origin_kind = 'plugin' and origin_user_id is null) or origin_kind = 'admin'),
	CONSTRAINT "provider_rows_namespace_check" CHECK((origin_kind = 'plugin') = (substr(id, 1, 7) = 'plugin:'))
);
--> statement-breakpoint
INSERT INTO `__new_provider_rows`("id", "label", "wire", "dialect", "auth", "base_url", "apis", "serves", "catalog", "metered", "docs_url", "features", "definition_hash", "origin_kind", "origin_user_id", "created_at") SELECT "id", "label", "wire", "dialect", "auth", "base_url", "apis", "serves", "catalog", "metered", "docs_url", "features", "definition_hash", "origin_kind", "origin_user_id", "created_at" FROM `provider_rows`;--> statement-breakpoint
DROP TABLE `provider_rows`;--> statement-breakpoint
ALTER TABLE `__new_provider_rows` RENAME TO `provider_rows`;--> statement-breakpoint
CREATE UNIQUE INDEX `provider_rows_admin_id_unique` ON `provider_rows` (`id`) WHERE "provider_rows"."origin_kind" = 'admin';--> statement-breakpoint
CREATE INDEX `provider_rows_origin_user_idx` ON `provider_rows` (`origin_user_id`);