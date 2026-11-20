-- A kind belongs to each use of a stored file: asset_kinds holds one row per use and assets.kind is dropped (SQLite rebuilds the table to drop a column a CHECK names; every row is copied unchanged).
CREATE TABLE `asset_kinds` (
	`asset_id` text NOT NULL,
	`kind` text NOT NULL,
	PRIMARY KEY(`asset_id`, `kind`),
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "asset_kinds_kind_check" CHECK(kind in ('card', 'avatar', 'export', 'generated', 'gallery', 'attachment', 'document', 'background', 'plugin'))
);
--> statement-breakpoint
CREATE INDEX `asset_kinds_kind_idx` ON `asset_kinds` (`kind`);--> statement-breakpoint
-- Each existing asset keeps the kind it was first stored under as its first use. This runs before the rebuild below, which drops assets.kind.
INSERT INTO `asset_kinds`("asset_id", "kind") SELECT "id", "kind" FROM `assets`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`hash` text NOT NULL,
	`animated` integer DEFAULT false NOT NULL,
	`width` integer,
	`height` integer,
	`uploaded_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "assets_measurements_check" CHECK(size >= 0 and (width is null or width > 0) and (height is null or height > 0))
);
--> statement-breakpoint
INSERT INTO `__new_assets`("id", "owner_id", "mime", "size", "hash", "animated", "width", "height", "uploaded_at") SELECT "id", "owner_id", "mime", "size", "hash", "animated", "width", "height", "uploaded_at" FROM `assets`;--> statement-breakpoint
DROP TABLE `assets`;--> statement-breakpoint
ALTER TABLE `__new_assets` RENAME TO `assets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `assets_owner_hash_unique` ON `assets` (`owner_id`,`hash`);