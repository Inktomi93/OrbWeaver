PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chat_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`invited_user_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`allow_signup` integer DEFAULT false NOT NULL,
	`created_by_user_id` text,
	`mint_mode` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chat_invites_status_check" CHECK(status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
	CONSTRAINT "chat_invites_uses_check" CHECK(uses >= 0 and (max_uses is null or max_uses > 0)),
	CONSTRAINT "chat_invites_signup_shape" CHECK(allow_signup = 0 OR (invited_user_id IS NULL AND max_uses IS NOT NULL AND expires_at IS NOT NULL)),
	CONSTRAINT "chat_invites_signup_mode" CHECK(allow_signup = 0 OR mint_mode IS NOT NULL),
	CONSTRAINT "chat_invites_mint_mode_check" CHECK(mint_mode is null or mint_mode in ('single-user', 'local', 'forward-header', 'oidc'))
);
--> statement-breakpoint
INSERT INTO `__new_chat_invites`("id", "chat_id", "token_hash", "max_uses", "uses", "expires_at", "invited_user_id", "status", "allow_signup", "created_by_user_id", "mint_mode", "created_at") SELECT "id", "chat_id", "token_hash", "max_uses", "uses", "expires_at", "invited_user_id", "status", "allow_signup", "created_by_user_id", "mint_mode", "created_at" FROM `chat_invites`;--> statement-breakpoint
DROP TABLE `chat_invites`;--> statement-breakpoint
ALTER TABLE `__new_chat_invites` RENAME TO `chat_invites`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `chat_invites_token_hash_unique` ON `chat_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `chat_invites_chat_idx` ON `chat_invites` (`chat_id`);--> statement-breakpoint
CREATE INDEX `chat_invites_invited_user_idx` ON `chat_invites` (`invited_user_id`);--> statement-breakpoint
CREATE INDEX `chat_invites_created_by_user_idx` ON `chat_invites` (`created_by_user_id`);