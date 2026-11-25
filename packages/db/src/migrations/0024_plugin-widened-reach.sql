PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`manifest` text NOT NULL,
	`bundle_asset_id` text NOT NULL,
	`granted_capabilities` text NOT NULL,
	`status` text NOT NULL,
	`origin` text NOT NULL,
	`source_url` text,
	`source_commit` text,
	`pending_reconsent` integer DEFAULT false NOT NULL,
	`widened_net_hosts` text DEFAULT '[]' NOT NULL,
	`widened_provider_ids` text DEFAULT '[]' NOT NULL,
	`widened_match_automation_events` integer DEFAULT false NOT NULL,
	`consecutive_crashes` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`installed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bundle_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "plugins_status_check" CHECK(status in ('disabled', 'enabled', 'errored')),
	CONSTRAINT "plugins_origin_check" CHECK(origin in ('upload', 'url', 'git')),
	CONSTRAINT "plugins_source_url_check" CHECK((origin = 'upload' and source_url is null) or (origin <> 'upload' and source_url is not null)),
	CONSTRAINT "plugins_source_commit_check" CHECK((origin = 'git' and source_commit is not null and length(source_commit) = 40 and source_commit not glob '*[^0-9a-f]*') or (origin <> 'git' and source_commit is null)),
	CONSTRAINT "plugins_widened_hosts_check" CHECK(pending_reconsent = 1 or json_array_length(widened_net_hosts) = 0),
	CONSTRAINT "plugins_widened_reach_check" CHECK(pending_reconsent = 1 or (json_array_length(widened_provider_ids) = 0 and widened_match_automation_events = 0))
);
--> statement-breakpoint
INSERT INTO `__new_plugins`("id", "owner_id", "slug", "name", "version", "manifest", "bundle_asset_id", "granted_capabilities", "status", "origin", "source_url", "source_commit", "pending_reconsent", "widened_net_hosts", "consecutive_crashes", "last_error", "installed_at", "updated_at") SELECT "id", "owner_id", "slug", "name", "version", "manifest", "bundle_asset_id", "granted_capabilities", "status", "origin", "source_url", "source_commit", "pending_reconsent", "widened_net_hosts", "consecutive_crashes", "last_error", "installed_at", "updated_at" FROM `plugins`;--> statement-breakpoint
DROP TABLE `plugins`;--> statement-breakpoint
ALTER TABLE `__new_plugins` RENAME TO `plugins`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `plugins_owner_slug_unique` ON `plugins` (`owner_id`,`slug`);--> statement-breakpoint
CREATE INDEX `plugins_bundle_asset_idx` ON `plugins` (`bundle_asset_id`);