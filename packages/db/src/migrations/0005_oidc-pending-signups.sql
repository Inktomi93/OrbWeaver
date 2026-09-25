CREATE TABLE `oidc_pending_signups` (
	`external_id` text PRIMARY KEY NOT NULL,
	`secret_hash` text NOT NULL,
	`handle` text NOT NULL,
	`email` text,
	`groups` text NOT NULL,
	`invite_token_hash` text NOT NULL,
	`id_token_ciphertext` text,
	`id_token_iv` text,
	`id_token_tag` text,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_pending_signups_secret_hash_unique` ON `oidc_pending_signups` (`secret_hash`);--> statement-breakpoint
CREATE INDEX `oidc_pending_signups_expires_idx` ON `oidc_pending_signups` (`expires_at`);--> statement-breakpoint
ALTER TABLE `oidc_transactions` ADD `invite_token_hash` text;