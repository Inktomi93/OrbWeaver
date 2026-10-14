ALTER TABLE `workloads` ADD `funder_user_id` text REFERENCES users(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `workloads_funder_idx` ON `workloads` (`funder_user_id`);--> statement-breakpoint
UPDATE `workloads` SET `funder_user_id` = `owner_id` WHERE `owner_id` IS NOT NULL;
