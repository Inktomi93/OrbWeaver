PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`config` text NOT NULL,
	`schema_version` integer DEFAULT 8 NOT NULL,
	`forked_from` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`forked_from`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_presets`("id", "owner_id", "name", "kind", "config", "schema_version", "forked_from", "created_at", "updated_at") SELECT "id", "owner_id", "name", "kind", "config", "schema_version", "forked_from", "created_at", "updated_at" FROM `presets`;--> statement-breakpoint
DROP TABLE `presets`;--> statement-breakpoint
ALTER TABLE `__new_presets` RENAME TO `presets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `presets_owner_idx` ON `presets` (`owner_id`);--> statement-breakpoint
CREATE INDEX `presets_owner_forked_from_idx` ON `presets` (`owner_id`,`forked_from`);--> statement-breakpoint
CREATE INDEX `presets_forked_from_idx` ON `presets` (`forked_from`);