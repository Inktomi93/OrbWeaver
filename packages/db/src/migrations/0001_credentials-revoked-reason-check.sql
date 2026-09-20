PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`schema_version` integer DEFAULT 9 NOT NULL,
	`config` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_settings`("user_id", "schema_version", "config", "updated_at") SELECT "user_id", "schema_version", "config", "updated_at" FROM `user_settings`;--> statement-breakpoint
DROP TABLE `user_settings`;--> statement-breakpoint
ALTER TABLE `__new_user_settings` RENAME TO `user_settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_user_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`tag` text NOT NULL,
	`revoked_at` integer,
	`revoked_reason` text,
	`metadata` text,
	`label` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_credentials_revoked_reason_check" CHECK(revoked_reason is null or revoked_reason in ('auth_failed', 'unreachable', 'user'))
);
--> statement-breakpoint
INSERT INTO `__new_user_credentials`("id", "owner_id", "provider", "ciphertext", "iv", "tag", "revoked_at", "revoked_reason", "metadata", "label", "created_at", "updated_at") SELECT "id", "owner_id", "provider", "ciphertext", "iv", "tag", "revoked_at", "revoked_reason", "metadata", "label", "created_at", "updated_at" FROM `user_credentials`;--> statement-breakpoint
DROP TABLE `user_credentials`;--> statement-breakpoint
ALTER TABLE `__new_user_credentials` RENAME TO `user_credentials`;--> statement-breakpoint
CREATE INDEX `user_credentials_owner_idx` ON `user_credentials` (`owner_id`);