-- Adds the assets-rebuild-index workload kind: widens the workloads.kind and workload_schedules.kind CHECKs (SQLite rebuilds a table to change a CHECK; every existing row is copied unchanged).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_workload_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`mode` text DEFAULT 'singular' NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`cadence` text NOT NULL,
	`next_run_at` integer NOT NULL,
	`last_run_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workload_schedules_kind_check" CHECK(kind in ('index', 'distill-characters', 'compute-themes', 'memory-backfill', 'group-character-backfill', 'compute-cooccurrence', 'find-duplicates', 'csls', 'assets-backfill', 'assets-gc', 'assets-fsck', 'assets-rebuild-index', 'import-st', 'import-token-usage-backfill', 'import-bundle', 'reconcile-stats', 'refresh-model-catalog', 'reconcile-world-state', 'databank-ingest', 'databank-reindex', 'refine-score-sweep')),
	CONSTRAINT "workload_schedules_mode_check" CHECK(mode in ('singular', 'bulk')),
	CONSTRAINT "workload_schedules_cadence_check" CHECK(cadence in ('hourly', 'daily', 'weekly', 'monthly'))
);
--> statement-breakpoint
INSERT INTO `__new_workload_schedules`("id", "owner_id", "kind", "mode", "params", "cadence", "next_run_at", "last_run_at", "enabled", "created_at", "updated_at") SELECT "id", "owner_id", "kind", "mode", "params", "cadence", "next_run_at", "last_run_at", "enabled", "created_at", "updated_at" FROM `workload_schedules`;--> statement-breakpoint
DROP TABLE `workload_schedules`;--> statement-breakpoint
ALTER TABLE `__new_workload_schedules` RENAME TO `workload_schedules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `workload_schedules_owner_idx` ON `workload_schedules` (`owner_id`);--> statement-breakpoint
CREATE TABLE `__new_workloads` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`mode` text DEFAULT 'singular' NOT NULL,
	`admission_key` text DEFAULT 'none' NOT NULL,
	`lane` text DEFAULT 'sweep' NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`result` text,
	`progress` text,
	`owner_id` text,
	`funder_user_id` text,
	`admission_system` integer DEFAULT true NOT NULL,
	`depends_on` text,
	`error` text,
	`scheduled_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`respawns` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`funder_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "workloads_kind_check" CHECK(kind in ('index', 'distill-characters', 'compute-themes', 'memory-backfill', 'group-character-backfill', 'compute-cooccurrence', 'find-duplicates', 'csls', 'assets-backfill', 'assets-gc', 'assets-fsck', 'assets-rebuild-index', 'import-st', 'import-token-usage-backfill', 'import-bundle', 'reconcile-stats', 'refresh-model-catalog', 'reconcile-world-state', 'databank-ingest', 'databank-reindex', 'refine-score-sweep')),
	CONSTRAINT "workloads_status_check" CHECK(status in ('queued', 'running', 'succeeded', 'failed', 'cancelling', 'cancelled', 'worker_died')),
	CONSTRAINT "workloads_mode_check" CHECK(mode in ('singular', 'bulk')),
	CONSTRAINT "workloads_lane_check" CHECK(lane in ('interactive', 'sweep'))
);
--> statement-breakpoint
INSERT INTO `__new_workloads`("id", "kind", "status", "mode", "admission_key", "lane", "params", "result", "progress", "owner_id", "funder_user_id", "admission_system", "depends_on", "error", "scheduled_at", "created_at", "updated_at", "respawns") SELECT "id", "kind", "status", "mode", "admission_key", "lane", "params", "result", "progress", "owner_id", "funder_user_id", "admission_system", "depends_on", "error", "scheduled_at", "created_at", "updated_at", "respawns" FROM `workloads`;--> statement-breakpoint
DROP TABLE `workloads`;--> statement-breakpoint
ALTER TABLE `__new_workloads` RENAME TO `workloads`;--> statement-breakpoint
CREATE UNIQUE INDEX `workloads_mode_active_singular_owned` ON `workloads` (`kind`,`owner_id`,`admission_key`) WHERE status in ('queued', 'running', 'cancelling') and mode = 'singular' and admission_system = 0;--> statement-breakpoint
CREATE UNIQUE INDEX `workloads_mode_active_singular_system` ON `workloads` (`kind`,`admission_key`) WHERE status in ('queued', 'running', 'cancelling') and mode = 'singular' and admission_system = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `workloads_mode_active_bulk` ON `workloads` (`kind`,`admission_key`) WHERE status in ('queued', 'running', 'cancelling') and mode = 'bulk';--> statement-breakpoint
CREATE INDEX `workloads_owner_idx` ON `workloads` (`owner_id`);--> statement-breakpoint
CREATE INDEX `workloads_funder_idx` ON `workloads` (`funder_user_id`);