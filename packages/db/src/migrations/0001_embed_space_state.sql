CREATE TABLE `embed_space_state` (
	`owner_id` text NOT NULL,
	`scope` text NOT NULL,
	`space` text NOT NULL,
	`completed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`owner_id`, `scope`),
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "embed_space_state_scope_check" CHECK(scope in ('cards', 'memory', 'documents', 'images'))
);
