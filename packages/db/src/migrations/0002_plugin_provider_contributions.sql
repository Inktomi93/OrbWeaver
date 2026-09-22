PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_provider_rows` (
	`id` text PRIMARY KEY NOT NULL,
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
	FOREIGN KEY (`origin_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "provider_rows_wire_check" CHECK(wire in ('openai-compat', 'anthropic-messages', 'agent-sdk', 'local-light')),
	CONSTRAINT "provider_rows_dialect_check" CHECK(dialect is null or dialect in ('openai-compatible', 'openrouter')),
	CONSTRAINT "provider_rows_auth_check" CHECK(auth in ('apiKey', 'oauthToken', 'endpoint', 'none')),
	CONSTRAINT "provider_rows_catalog_check" CHECK(catalog in ('url', 'builtin')),
	CONSTRAINT "provider_rows_origin_kind_check" CHECK(origin_kind in ('plugin', 'admin')),
	CONSTRAINT "provider_rows_origin_shape_check" CHECK((origin_kind = 'plugin' and origin_user_id is null) or origin_kind = 'admin')
);--> statement-breakpoint
INSERT INTO `__new_provider_rows`(
	"id", "label", "wire", "dialect", "auth", "base_url", "apis", "serves", "catalog", "metered",
	"docs_url", "features", "definition_hash", "origin_kind", "origin_user_id", "created_at"
)
SELECT
	"id", "label", "wire", "dialect", "auth", "base_url", "apis", "serves", "catalog", "metered",
	"docs_url", "features", 'legacy:' || "id", "origin_kind", "origin_user_id", "created_at"
FROM `provider_rows`
WHERE `origin_kind` = 'admin';--> statement-breakpoint
DROP TABLE `provider_rows`;--> statement-breakpoint
ALTER TABLE `__new_provider_rows` RENAME TO `provider_rows`;--> statement-breakpoint
CREATE UNIQUE INDEX `provider_rows_contribution_identity_unique` ON `provider_rows` (`id`,`definition_hash`,`origin_kind`);--> statement-breakpoint
CREATE INDEX `provider_rows_origin_user_idx` ON `provider_rows` (`origin_user_id`);--> statement-breakpoint
CREATE TABLE `plugin_provider_contributions` (
	`provider_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`definition_hash` text NOT NULL,
	`provider_kind` text DEFAULT 'plugin' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`provider_id`, `plugin_id`),
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`,`definition_hash`,`provider_kind`) REFERENCES `provider_rows`(`id`,`definition_hash`,`origin_kind`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "plugin_provider_contributions_kind_check" CHECK(provider_kind = 'plugin')
);--> statement-breakpoint
CREATE INDEX `plugin_provider_contributions_plugin_idx` ON `plugin_provider_contributions` (`plugin_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
