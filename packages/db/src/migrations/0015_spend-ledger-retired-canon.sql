PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_spend_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`cost_usd` real NOT NULL,
	`created_at` integer NOT NULL,
	`model` text,
	`provider` text,
	`notional` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "spend_ledger_kind_check" CHECK(kind in ('compaction', 'image-extraction', 'image-caption', 'retired-canon'))
);
--> statement-breakpoint
INSERT INTO `__new_spend_ledger`("id", "owner_id", "kind", "cost_usd", "created_at", "model", "provider", "notional") SELECT "id", "owner_id", "kind", "cost_usd", "created_at", NULL, NULL, false FROM `spend_ledger`;--> statement-breakpoint
DROP TABLE `spend_ledger`;--> statement-breakpoint
ALTER TABLE `__new_spend_ledger` RENAME TO `spend_ledger`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `spend_ledger_owner_idx` ON `spend_ledger` (`owner_id`,`created_at`);