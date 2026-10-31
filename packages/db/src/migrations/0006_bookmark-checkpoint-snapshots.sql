-- A checkpoint now pins its own bookmark row, which the state ladder never reads. Releases before v0.3.0
-- pinned a turn row, which made that turn's message undeletable; later releases pinned a hand row, which the
-- ladder ranked as a beat. The rule is recorded on docs/work/1492-re-pin-checkpoints-from-releases-before-v0-3.md.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rpg_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`message_id` text,
	`variant_id` text,
	`as_of_message_id` text,
	`clock` text,
	`calendar_date` text,
	`location` text DEFAULT '' NOT NULL,
	`weather` text,
	`present_characters` text,
	`recent_events` text,
	`actor_state` text,
	`tracker_values` text,
	`quests` text DEFAULT '[]',
	`plot` text,
	`field_locks` text,
	`committed` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`kind` text NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `rpg_games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `message_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`as_of_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "rpg_snapshots_arm_check" CHECK((kind = 'turn' and message_id is not null and variant_id is not null and as_of_message_id is null) or (kind = 'hand' and message_id is null and variant_id is null) or (kind = 'bookmark' and message_id is null and variant_id is null and as_of_message_id is null))
);
--> statement-breakpoint
-- Every existing row is a beat: variant-keyed rows are turns, the rest are hand writes.
INSERT INTO `__new_rpg_snapshots`("id", "game_id", "message_id", "variant_id", "as_of_message_id", "clock", "calendar_date", "location", "weather", "present_characters", "recent_events", "actor_state", "tracker_values", "quests", "plot", "field_locks", "committed", "created_at", "kind") SELECT "id", "game_id", "message_id", "variant_id", "as_of_message_id", "clock", "calendar_date", "location", "weather", "present_characters", "recent_events", "actor_state", "tracker_values", "quests", "plot", "field_locks", "committed", "created_at", CASE WHEN "variant_id" IS NULL THEN 'hand' ELSE 'turn' END FROM `rpg_snapshots`;--> statement-breakpoint
DROP TABLE `rpg_snapshots`;--> statement-breakpoint
ALTER TABLE `__new_rpg_snapshots` RENAME TO `rpg_snapshots`;--> statement-breakpoint
CREATE UNIQUE INDEX `rpg_snapshots_variant_unique` ON `rpg_snapshots` (`variant_id`) WHERE variant_id is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `rpg_snapshots_id_kind_unique` ON `rpg_snapshots` (`id`,`kind`);--> statement-breakpoint
CREATE INDEX `rpg_snapshots_game_idx` ON `rpg_snapshots` (`game_id`);--> statement-breakpoint
CREATE INDEX `rpg_snapshots_message_idx` ON `rpg_snapshots` (`message_id`);--> statement-breakpoint
CREATE INDEX `rpg_snapshots_as_of_message_idx` ON `rpg_snapshots` (`as_of_message_id`);--> statement-breakpoint
CREATE TABLE `__new_rpg_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`snapshot_kind` text DEFAULT 'bookmark' NOT NULL,
	`label` text NOT NULL,
	`trigger` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `rpg_games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_id`,`snapshot_kind`) REFERENCES `rpg_snapshots`(`id`,`kind`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "rpg_checkpoints_snapshot_kind_check" CHECK(snapshot_kind = 'bookmark'),
	CONSTRAINT "rpg_checkpoints_trigger_check" CHECK(trigger in ('manual'))
);
--> statement-breakpoint
-- The old table has no snapshot_kind; the repair below re-points every copied row at a bookmark.
INSERT INTO `__new_rpg_checkpoints`("id", "game_id", "snapshot_id", "label", "trigger", "created_at") SELECT "id", "game_id", "snapshot_id", "label", "trigger", "created_at" FROM `rpg_checkpoints`;--> statement-breakpoint
DROP TABLE `rpg_checkpoints`;--> statement-breakpoint
ALTER TABLE `__new_rpg_checkpoints` RENAME TO `rpg_checkpoints`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `rpg_checkpoints_game_idx` ON `rpg_checkpoints` (`game_id`);--> statement-breakpoint
CREATE INDEX `rpg_checkpoints_snapshot_idx` ON `rpg_checkpoints` (`snapshot_id`,`snapshot_kind`);--> statement-breakpoint
-- Repair: each checkpoint gets its own committed bookmark copy of the row it pinned, turn or hand, under the
-- bookmark rule in packages/server/src/domain/rpg/persistence/snapshots.ts: no keys, no as-of stamp, and the
-- checkpoint's own created_at. The pinned row stays as the beat it was, so the room's state does not move.
-- The copy's id is the checkpoint's TypeID suffix under the snapshot prefix: valid, unique per checkpoint, and
-- derivable again by the re-point below.
INSERT INTO `rpg_snapshots` (
	`id`, `game_id`, `message_id`, `variant_id`, `as_of_message_id`, `clock`, `calendar_date`, `location`, `weather`,
	`present_characters`, `recent_events`, `actor_state`, `tracker_values`, `quests`, `plot`, `field_locks`, `committed`, `created_at`, `kind`
)
SELECT
	'rpg_snapshot_' || substr(c.`id`, -26), c.`game_id`, NULL, NULL, NULL, s.`clock`, s.`calendar_date`, s.`location`, s.`weather`,
	s.`present_characters`, s.`recent_events`, s.`actor_state`, s.`tracker_values`, s.`quests`, s.`plot`, s.`field_locks`, 1, c.`created_at`, 'bookmark'
FROM `rpg_checkpoints` c
JOIN `rpg_snapshots` s ON s.`id` = c.`snapshot_id`;--> statement-breakpoint
UPDATE `rpg_checkpoints` SET `snapshot_id` = 'rpg_snapshot_' || substr(`id`, -26);
