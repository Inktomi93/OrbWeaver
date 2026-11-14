-- The compaction ledger becomes the one spend ledger for priced calls with no canon row of their own, tagged by kind, and an image generation keeps its call's wall time. Every existing ledger row is a compaction pass and keeps its id: the brand is type-only and no reader parses the stored prefix.
CREATE TABLE `spend_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`cost_usd` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "spend_ledger_kind_check" CHECK(kind in ('compaction', 'image-extraction', 'image-caption'))
);
--> statement-breakpoint
INSERT INTO `spend_ledger`("id", "owner_id", "kind", "cost_usd", "created_at") SELECT "id", "owner_id", 'compaction', "cost_usd", "created_at" FROM `compaction_spend`;--> statement-breakpoint
CREATE INDEX `spend_ledger_owner_idx` ON `spend_ledger` (`owner_id`,`created_at`);--> statement-breakpoint
DROP TABLE `compaction_spend`;--> statement-breakpoint
ALTER TABLE `imagery_generations` ADD `gen_time_ms` integer;
