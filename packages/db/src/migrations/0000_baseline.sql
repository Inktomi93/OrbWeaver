CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`hash` text NOT NULL,
	`animated` integer DEFAULT false NOT NULL,
	`uploaded_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "assets_kind_check" CHECK(kind in ('card', 'avatar', 'export', 'generated', 'gallery', 'attachment', 'document', 'background', 'plugin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_owner_hash_unique` ON `assets` (`owner_id`,`hash`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`actor_user_id` text,
	`entity_type` text,
	`entity_id` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_time_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_actor_idx` ON `audit_logs` (`actor_user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `automation_budgets` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`max_fires_per_hour` integer DEFAULT 120 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `automation_fires` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`chat_id` text,
	`trigger_type` text NOT NULL,
	`outcome` text NOT NULL,
	`detail` text,
	`automation_depth` integer DEFAULT 0 NOT NULL,
	`fired_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `automation_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "automation_fires_outcome_check" CHECK(outcome in ('fired', 'predicate_false', 'predicate_error', 'budget_refused', 'depth_refused', 'action_error', 'authority_refused', 'test_run'))
);
--> statement-breakpoint
CREATE INDEX `automation_fires_rule_time` ON `automation_fires` (`rule_id`,`fired_at`);--> statement-breakpoint
CREATE TABLE `automation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`chat_id` text,
	`name` text NOT NULL,
	`description` text,
	`enabled` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL,
	`trigger_bus` text NOT NULL,
	`trigger_type` text NOT NULL,
	`predicate_cel` text,
	`actions` text NOT NULL,
	`match_automation_events` integer DEFAULT false NOT NULL,
	`cooldown_seconds` integer DEFAULT 0 NOT NULL,
	`max_fires_per_hour` integer DEFAULT 30 NOT NULL,
	`consecutive_errors` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`last_fired_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "automation_rules_name_check" CHECK(length(name) <= 120),
	CONSTRAINT "automation_rules_trigger_bus_check" CHECK(trigger_bus in ('chat', 'domain')),
	CONSTRAINT "automation_rules_trigger_type_check" CHECK((trigger_bus = 'chat' AND trigger_type in ('chatOpened', 'messageCommitted', 'messageEdited', 'variantSelected', 'turnStarted', 'turnCompleted', 'turnAborted', 'worldInfoActivated', 'personaSwitched', 'chatCreated', 'messageHidden', 'messagesDeleted', 'chatUpdated', 'wiEntryAttached', 'wiEntryDetached')) OR (trigger_bus = 'domain' AND trigger_type in ('character.updated', 'asset.created')))
);
--> statement-breakpoint
CREATE INDEX `automation_rules_chat_enabled` ON `automation_rules` (`chat_id`,`enabled`,`trigger_type`);--> statement-breakpoint
CREATE TABLE `global_variables` (
	`owner_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`owner_id`, `key`),
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "global_variables_key_check" CHECK(length(key) <= 128),
	CONSTRAINT "global_variables_value_check" CHECK(length(cast(value as blob)) <= 65536)
);
--> statement-breakpoint
CREATE TABLE `character_personas` (
	`character_id` text NOT NULL,
	`persona_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`character_id`, `persona_id`),
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `character_personas_persona_idx` ON `character_personas` (`persona_id`);--> statement-breakpoint
CREATE TABLE `character_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`content` text NOT NULL,
	`label` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `character_snapshots_character_idx` ON `character_snapshots` (`character_id`);--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`owner_id` text NOT NULL,
	`starred` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`synthetic` integer DEFAULT false NOT NULL,
	`forbid_external_media` integer,
	`trust_html` integer,
	`theme_override` text,
	`background_override` text,
	`imported_from` text,
	`import_hash` text,
	`content_hash` text NOT NULL,
	`token_size` integer DEFAULT 0 NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`personality` text,
	`scenario` text,
	`greetings` text DEFAULT '[]' NOT NULL,
	`example_messages` text,
	`system_prompt` text,
	`post_history_instructions` text,
	`depth_prompt` text,
	`creator_notes` text,
	`creator` text,
	`card_version` text,
	`nickname` text,
	`source` text,
	`creation_date` integer,
	`modification_date` integer,
	`regex_scripts` text DEFAULT '[]' NOT NULL,
	`extensions` text,
	`residual_data` text,
	`avatar_asset_id` text,
	`refinery` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`avatar_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `characters_owner_handle_unique` ON `characters` (`owner_id`,`handle`);--> statement-breakpoint
CREATE INDEX `characters_owner_idx` ON `characters` (`owner_id`);--> statement-breakpoint
CREATE TABLE `chat_events` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chat_events_type_check" CHECK(type in ('delta', 'messageCommitted', 'messageEdited', 'messageHidden', 'variantSelected', 'messagesDeleted', 'messagesReordered', 'reasoningEdited', 'reasoningCleared', 'reasoningStreamDone', 'turnStarted', 'turnCompleted', 'turnAborted', 'warning', 'worldInfoActivated', 'personaSwitched', 'wiBookAttached', 'wiBookDetached', 'wiEntryAttached', 'wiEntryDetached', 'wiEntryScopeChanged', 'chatCreated', 'chatDeleted', 'chatOpened', 'historyTruncated', 'chatUpdated'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_events_chat_seq_unique` ON `chat_events` (`chat_id`,`seq`);--> statement-breakpoint
CREATE TABLE `chat_injections` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`position` text NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`injection_order` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chat_injections_position_check" CHECK(position in ('before_prompt', 'in_static', 'in_prompt', 'in_chat')),
	CONSTRAINT "chat_injections_role_check" CHECK(role in ('system', 'user', 'assistant'))
);
--> statement-breakpoint
CREATE INDEX `chat_injections_chat_idx` ON `chat_injections` (`chat_id`);--> statement-breakpoint
CREATE TABLE `chat_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`max_uses` integer,
	`uses` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`invited_user_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chat_invites_status_check" CHECK(status in ('pending', 'accepted', 'declined', 'revoked', 'expired'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_invites_token_hash_unique` ON `chat_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `chat_invites_chat_idx` ON `chat_invites` (`chat_id`);--> statement-breakpoint
CREATE TABLE `chat_locks` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`holder` text NOT NULL,
	`acquired_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chat_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`kind` text NOT NULL,
	`user_id` text,
	`character_id` text,
	`role` text NOT NULL,
	`active_persona_id` text,
	`talkativeness` real DEFAULT 0.5 NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`joined_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`join_seq` integer NOT NULL,
	`left_seq` integer,
	`join_history_visibility` text DEFAULT 'full' NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`active_persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "chat_participants_kind_shape" CHECK((kind = 'human' AND user_id IS NOT NULL AND character_id IS NULL) OR (kind = 'character' AND character_id IS NOT NULL AND user_id IS NULL) OR (kind = 'agent' AND user_id IS NOT NULL AND character_id IS NULL) OR (kind = 'observer' AND user_id IS NULL AND character_id IS NULL)),
	CONSTRAINT "chat_participants_kind_check" CHECK(kind in ('human', 'character')),
	CONSTRAINT "chat_participants_role_check" CHECK(role in ('host', 'member')),
	CONSTRAINT "chat_participants_join_visibility_check" CHECK(join_history_visibility in ('from-join', 'full'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_participants_chat_user_unique` ON `chat_participants` (`chat_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `chat_participants_chat_idx` ON `chat_participants` (`chat_id`);--> statement-breakpoint
CREATE INDEX `chat_participants_character_idx` ON `chat_participants` (`character_id`);--> statement-breakpoint
CREATE TABLE `chat_stream_events` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`message_id` text,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`delta` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chat_stream_events_kind_check" CHECK(kind in ('text', 'reasoning'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_stream_events_chat_seq_unique` ON `chat_stream_events` (`chat_id`,`seq`);--> statement-breakpoint
CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`star` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`temporary` integer DEFAULT false NOT NULL,
	`pending_host_user_id` text,
	`anchor_persona_id` text,
	`parent_chat_id` text,
	`forked_at` integer,
	`compact_summary` text,
	`compacted_at_seq` integer,
	`metadata` text,
	`variable_values` text,
	`runtime_variables` text,
	`standalone_variable_deltas` text,
	`imported_from` text,
	`import_hash` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`pending_host_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`anchor_persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`parent_chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `chats_parent_idx` ON `chats` (`parent_chat_id`);--> statement-breakpoint
CREATE TABLE `message_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `message_assets_message_idx` ON `message_assets` (`message_id`);--> statement-breakpoint
CREATE TABLE `message_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`idx` integer NOT NULL,
	`content` text NOT NULL,
	`reasoning` text,
	`model` text,
	`provider` text,
	`reasoning_effort` text,
	`tokens_in` integer,
	`tokens_out` integer,
	`cache_read_tokens` integer,
	`cache_write_tokens` integer,
	`cost_usd` real,
	`context_window` integer,
	`context_boundary_message_id` text,
	`max_output_tokens` integer,
	`ttft_ms` integer,
	`finish_reason` text,
	`stop_reason` text,
	`terminal_reason` text,
	`api_error_status` integer,
	`tool_calls` text,
	`variable_delta` text,
	`params` text,
	`prompt_snapshot` text,
	`gen_started_at` integer,
	`gen_finished_at` integer,
	`generation_id` text,
	`raw_request` text,
	`raw_response` text,
	`pre_continue_content` text,
	`pre_continue_reasoning` text,
	`last_continuation_content` text,
	`last_continuation_reasoning` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`context_boundary_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_variants_message_idx_unique` ON `message_variants` (`message_id`,`idx`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`author_user_id` text,
	`character_id` text,
	`persona_id` text,
	`selected_variant_id` text,
	`excluded_from_prompt` integer DEFAULT false NOT NULL,
	`initiator` text DEFAULT 'human' NOT NULL,
	`automation_depth` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`edited_at` integer,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`selected_variant_id`) REFERENCES `message_variants`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "messages_role_check" CHECK(role in ('system', 'user', 'assistant')),
	CONSTRAINT "messages_initiator_check" CHECK(initiator in ('human', 'automation', 'plugin')),
	CONSTRAINT "messages_attribution_shape" CHECK((character_id IS NULL OR role = 'assistant') AND (persona_id IS NULL OR role = 'user') AND (character_id IS NULL OR author_user_id IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_chat_seq_unique` ON `messages` (`chat_id`,`seq`);--> statement-breakpoint
CREATE TABLE `pending_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`triggered_by` text NOT NULL,
	`run_as_user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`triggered_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_as_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pending_turns_chat_idx` ON `pending_turns` (`chat_id`);--> statement-breakpoint
CREATE TABLE `user_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`provider` text NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`tag` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`revoked_at` integer,
	`metadata` text,
	`label` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "user_credentials_provider_check" CHECK(provider in ('openrouter', 'anthropic', 'openai', 'custom_openai'))
);
--> statement-breakpoint
CREATE INDEX `user_credentials_owner_idx` ON `user_credentials` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_credentials_active_unique` ON `user_credentials` (`owner_id`,`provider`) WHERE "user_credentials"."active" = 1;--> statement-breakpoint
CREATE TABLE `character_documents` (
	`character_id` text NOT NULL,
	`document_id` text NOT NULL,
	PRIMARY KEY(`character_id`, `document_id`),
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `character_documents_document_idx` ON `character_documents` (`document_id`);--> statement-breakpoint
CREATE TABLE `chat_documents` (
	`chat_id` text NOT NULL,
	`document_id` text NOT NULL,
	PRIMARY KEY(`chat_id`, `document_id`),
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_documents_document_idx` ON `chat_documents` (`document_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_asset_id` text,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`origin` text NOT NULL,
	`source_url` text,
	`extracted_text` text NOT NULL,
	`import_hash` text NOT NULL,
	`byte_size` integer NOT NULL,
	`extractor_version` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "documents_origin_check" CHECK(origin in ('upload', 'web', 'youtube', 'wiki', 'text'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_owner_hash_unique` ON `documents` (`owner_id`,`import_hash`);--> statement-breakpoint
CREATE TABLE `global_documents` (
	`owner_id` text NOT NULL,
	`document_id` text NOT NULL,
	PRIMARY KEY(`owner_id`, `document_id`),
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `global_documents_document_idx` ON `global_documents` (`document_id`);--> statement-breakpoint
CREATE TABLE `character_keyword_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`keyword` text NOT NULL,
	`count` integer NOT NULL,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_keyword_profiles_character_keyword_unique` ON `character_keyword_profiles` (`character_id`,`keyword`);--> statement-breakpoint
CREATE INDEX `character_keyword_profiles_character_idx` ON `character_keyword_profiles` (`character_id`);--> statement-breakpoint
CREATE TABLE `character_summaries` (
	`character_id` text PRIMARY KEY NOT NULL,
	`genre` text,
	`tone` text,
	`sub_genres` text DEFAULT '[]' NOT NULL,
	`setting` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`elevator_pitch` text,
	`overview` text,
	`model` text NOT NULL,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `digest_theme_assignments` (
	`digest_id` text NOT NULL,
	`theme_cluster_id` text NOT NULL,
	`msg_mid_at` integer,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`digest_id`, `theme_cluster_id`),
	FOREIGN KEY (`digest_id`) REFERENCES `chat_digests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`theme_cluster_id`) REFERENCES `theme_clusters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `digest_theme_assignments_cluster_idx` ON `digest_theme_assignments` (`theme_cluster_id`);--> statement-breakpoint
CREATE TABLE `duplicate_character_pairs` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id_a` text NOT NULL,
	`character_id_b` text NOT NULL,
	`csls_score` real NOT NULL,
	`similarity` real NOT NULL,
	`model` text NOT NULL,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`character_id_a`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id_b`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "duplicate_character_pairs_canonical_check" CHECK(character_id_a < character_id_b)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `duplicate_character_pairs_pair_unique` ON `duplicate_character_pairs` (`character_id_a`,`character_id_b`);--> statement-breakpoint
CREATE INDEX `duplicate_character_pairs_a_idx` ON `duplicate_character_pairs` (`character_id_a`);--> statement-breakpoint
CREATE INDEX `duplicate_character_pairs_b_idx` ON `duplicate_character_pairs` (`character_id_b`);--> statement-breakpoint
CREATE TABLE `duplicate_chat_pairs` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id_a` text NOT NULL,
	`chat_id_b` text NOT NULL,
	`csls_score` real NOT NULL,
	`similarity` real NOT NULL,
	`relation` text NOT NULL,
	`model` text NOT NULL,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id_a`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id_b`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "duplicate_chat_pairs_canonical_check" CHECK(chat_id_a < chat_id_b),
	CONSTRAINT "duplicate_chat_pairs_relation_check" CHECK(relation in ('duplicate', 'forked'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `duplicate_chat_pairs_pair_unique` ON `duplicate_chat_pairs` (`chat_id_a`,`chat_id_b`);--> statement-breakpoint
CREATE INDEX `duplicate_chat_pairs_a_idx` ON `duplicate_chat_pairs` (`chat_id_a`);--> statement-breakpoint
CREATE INDEX `duplicate_chat_pairs_b_idx` ON `duplicate_chat_pairs` (`chat_id_b`);--> statement-breakpoint
CREATE TABLE `keyword_cooccurrence` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`keyword_a` text NOT NULL,
	`keyword_b` text NOT NULL,
	`count` integer NOT NULL,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "keyword_cooccurrence_canonical_check" CHECK(keyword_a < keyword_b)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keyword_cooccurrence_owner_pair_unique` ON `keyword_cooccurrence` (`owner_id`,`keyword_a`,`keyword_b`);--> statement-breakpoint
CREATE INDEX `keyword_cooccurrence_owner_idx` ON `keyword_cooccurrence` (`owner_id`);--> statement-breakpoint
CREATE TABLE `theme_clusters` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`level` text NOT NULL,
	`cluster_idx` integer NOT NULL,
	`name` text,
	`centroid` F32_BLOB(1024) NOT NULL,
	`size` integer NOT NULL,
	`model` text NOT NULL,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `theme_clusters_owner_level_idx_unique` ON `theme_clusters` (`owner_id`,`level`,`cluster_idx`);--> statement-breakpoint
CREATE INDEX `theme_clusters_owner_idx` ON `theme_clusters` (`owner_id`);--> statement-breakpoint
CREATE TABLE `character_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`embedding` F32_BLOB(1024) NOT NULL,
	`content_hash` text NOT NULL,
	`hub_score` real,
	`model` text NOT NULL,
	`dim` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_embeddings_character_model_unique` ON `character_embeddings` (`character_id`,`model`);--> statement-breakpoint
CREATE TABLE `chat_digest_speakers` (
	`digest_id` text NOT NULL,
	`character_id` text NOT NULL,
	PRIMARY KEY(`digest_id`, `character_id`),
	FOREIGN KEY (`digest_id`) REFERENCES `chat_digests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_digest_speakers_character_idx` ON `chat_digest_speakers` (`character_id`);--> statement-breakpoint
CREATE TABLE `chat_digests` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`scoped_character_id` text NOT NULL,
	`is_group` integer DEFAULT false NOT NULL,
	`tier` integer NOT NULL,
	`block_idx` integer NOT NULL,
	`text` text NOT NULL,
	`embedding` F32_BLOB(1024) NOT NULL,
	`content_hash` text NOT NULL,
	`hub_score` real,
	`topic_anchor` text,
	`keywords` text DEFAULT '[]' NOT NULL,
	`model` text NOT NULL,
	`dim` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scoped_character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_digests_scope_unique` ON `chat_digests` (`chat_id`,`scoped_character_id`,`tier`,`block_idx`,`model`);--> statement-breakpoint
CREATE INDEX `chat_digests_chat_idx` ON `chat_digests` (`chat_id`);--> statement-breakpoint
CREATE TABLE `chat_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`block_idx` integer NOT NULL,
	`seq_start` integer NOT NULL,
	`seq_end` integer NOT NULL,
	`text` text NOT NULL,
	`embedding` F32_BLOB(1024) NOT NULL,
	`content_hash` text NOT NULL,
	`hub_score` real,
	`model` text NOT NULL,
	`dim` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_segments_chat_block_unique` ON `chat_segments` (`chat_id`,`block_idx`,`model`);--> statement-breakpoint
CREATE TABLE `document_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`chunk_idx` integer NOT NULL,
	`content` text NOT NULL,
	`char_start` integer NOT NULL,
	`char_end` integer NOT NULL,
	`embedding` F32_BLOB(1024) NOT NULL,
	`content_hash` text NOT NULL,
	`hub_score` real,
	`model` text NOT NULL,
	`dim` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_chunks_doc_chunk_model_unique` ON `document_chunks` (`document_id`,`chunk_idx`,`model`);--> statement-breakpoint
CREATE INDEX `document_chunks_document_idx` ON `document_chunks` (`document_id`);--> statement-breakpoint
CREATE TABLE `image_embeddings` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`embedding` F32_BLOB(1024) NOT NULL,
	`lens` text NOT NULL,
	`caption` text,
	`caption_meta` text,
	`content_hash` text NOT NULL,
	`hub_score` real,
	`model` text NOT NULL,
	`dim` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "image_embeddings_lens_check" CHECK(lens in ('image-raw', 'image-captioned'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `image_embeddings_asset_model_lens_unique` ON `image_embeddings` (`asset_id`,`model`,`lens`);--> statement-breakpoint
CREATE TABLE `gallery_items` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`subject_character_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gallery_items_asset_subject_unique` ON `gallery_items` (`asset_id`,`subject_character_id`);--> statement-breakpoint
CREATE INDEX `gallery_items_character_idx` ON `gallery_items` (`subject_character_id`);--> statement-breakpoint
CREATE TABLE `imagery_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`chat_id` text,
	`mode` text NOT NULL,
	`subject_character_id` text,
	`identity_hash` text,
	`prompt` text NOT NULL,
	`negative_prompt` text,
	`model` text NOT NULL,
	`cost_usd` real,
	`edited` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`subject_character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "imagery_generations_mode_check" CHECK(mode in ('free', 'character', 'face', 'scenario', 'background', 'character_multimodal', 'face_multimodal'))
);
--> statement-breakpoint
CREATE INDEX `imagery_generations_reuse_idx` ON `imagery_generations` (`subject_character_id`,`mode`,`identity_hash`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_user_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`seq` integer NOT NULL,
	`read_at` integer,
	`dismissed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notifications_type_check" CHECK(type in ('invite', 'kicked', 'handoff-nominated', 'handoff-accepted', 'deferred-turn-dropped', 'automation-notice', 'plugin-disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_recipient_seq_unique` ON `notifications` (`recipient_user_id`,`seq`);--> statement-breakpoint
CREATE TABLE `personas` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`title` text,
	`description` text NOT NULL,
	`starred` integer DEFAULT false NOT NULL,
	`avatar_asset_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`avatar_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `personas_owner_idx` ON `personas` (`owner_id`);--> statement-breakpoint
CREATE TABLE `plugin_kv` (
	`plugin_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`plugin_id`, `key`),
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "plugin_kv_key_check" CHECK(length(key) <= 128),
	CONSTRAINT "plugin_kv_value_check" CHECK(length(value) <= 65536)
);
--> statement-breakpoint
CREATE TABLE `plugins` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`manifest` text NOT NULL,
	`bundle_asset_id` text NOT NULL,
	`granted_capabilities` text NOT NULL,
	`status` text NOT NULL,
	`origin` text NOT NULL,
	`consecutive_crashes` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`installed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bundle_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "plugins_status_check" CHECK(status in ('disabled', 'enabled', 'errored')),
	CONSTRAINT "plugins_origin_check" CHECK(origin in ('upload'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugins_owner_slug_unique` ON `plugins` (`owner_id`,`slug`);--> statement-breakpoint
CREATE TABLE `presets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`config` text NOT NULL,
	`schema_version` integer DEFAULT 4 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `presets_owner_idx` ON `presets` (`owner_id`);--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`sdk_session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`seeded_through_seq` integer NOT NULL,
	`canon_hash` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_entries_chat_seq_unique` ON `session_entries` (`chat_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_entries_sdk_session_unique` ON `session_entries` (`sdk_session_id`);--> statement-breakpoint
CREATE TABLE `oidc_transactions` (
	`state` text PRIMARY KEY NOT NULL,
	`code_verifier` text NOT NULL,
	`nonce` text,
	`redirect_uri` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oidc_transactions_expires_idx` ON `oidc_transactions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`revoked_at` integer,
	`user_agent` text,
	`label` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `themes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`name` text NOT NULL,
	`override` text NOT NULL,
	`css` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `themes_owner_idx` ON `themes` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `themes_owner_name_uq` ON `themes` (`owner_id`,`name`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`schema_version` integer DEFAULT 4 NOT NULL,
	`config` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `character_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`chats` integer DEFAULT 0 NOT NULL,
	`user_turns` integer DEFAULT 0 NOT NULL,
	`assistant_turns` integer DEFAULT 0 NOT NULL,
	`system_turns` integer DEFAULT 0 NOT NULL,
	`swipes` integer DEFAULT 0 NOT NULL,
	`user_words` integer DEFAULT 0 NOT NULL,
	`assistant_words` integer DEFAULT 0 NOT NULL,
	`swipe_words` integer DEFAULT 0 NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`gen_time_ms` integer DEFAULT 0 NOT NULL,
	`gen_samples` integer DEFAULT 0 NOT NULL,
	`reasoning_generations` integer DEFAULT 0 NOT NULL,
	`reasoning_ms` integer DEFAULT 0 NOT NULL,
	`active_idx_sum` integer DEFAULT 0 NOT NULL,
	`variant_messages` integer DEFAULT 0 NOT NULL,
	`forked_chats` integer DEFAULT 0 NOT NULL,
	`content_bytes` integer DEFAULT 0 NOT NULL,
	`first_chat_at` integer,
	`last_activity_at` integer,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_stats_character_unique` ON `character_stats` (`character_id`);--> statement-breakpoint
CREATE TABLE `daily_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`day` text NOT NULL,
	`chats_created` integer DEFAULT 0 NOT NULL,
	`user_turns` integer DEFAULT 0 NOT NULL,
	`assistant_turns` integer DEFAULT 0 NOT NULL,
	`system_turns` integer DEFAULT 0 NOT NULL,
	`swipes` integer DEFAULT 0 NOT NULL,
	`user_words` integer DEFAULT 0 NOT NULL,
	`assistant_words` integer DEFAULT 0 NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`gen_time_ms` integer DEFAULT 0 NOT NULL,
	`message_dates_approx` integer DEFAULT false NOT NULL,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_stats_owner_day_unique` ON `daily_stats` (`owner_id`,`day`);--> statement-breakpoint
CREATE TABLE `model_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`model` text NOT NULL,
	`provider` text DEFAULT '(unknown)' NOT NULL,
	`generations` integer DEFAULT 0 NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`gen_time_ms` integer DEFAULT 0 NOT NULL,
	`gen_samples` integer DEFAULT 0 NOT NULL,
	`reasoning_generations` integer DEFAULT 0 NOT NULL,
	`reasoning_ms` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `model_stats_owner_model_provider_unique` ON `model_stats` (`owner_id`,`model`,`provider`);--> statement-breakpoint
CREATE TABLE `owner_stats` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`characters` integer DEFAULT 0 NOT NULL,
	`chats` integer DEFAULT 0 NOT NULL,
	`user_turns` integer DEFAULT 0 NOT NULL,
	`assistant_turns` integer DEFAULT 0 NOT NULL,
	`system_turns` integer DEFAULT 0 NOT NULL,
	`swipes` integer DEFAULT 0 NOT NULL,
	`user_words` integer DEFAULT 0 NOT NULL,
	`assistant_words` integer DEFAULT 0 NOT NULL,
	`swipe_words` integer DEFAULT 0 NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`gen_time_ms` integer DEFAULT 0 NOT NULL,
	`gen_samples` integer DEFAULT 0 NOT NULL,
	`reasoning_generations` integer DEFAULT 0 NOT NULL,
	`reasoning_ms` integer DEFAULT 0 NOT NULL,
	`active_idx_sum` integer DEFAULT 0 NOT NULL,
	`variant_messages` integer DEFAULT 0 NOT NULL,
	`forked_chats` integer DEFAULT 0 NOT NULL,
	`content_bytes` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`max_context_tokens` integer,
	`first_chat_at` integer,
	`last_activity_at` integer,
	`computed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `character_tags` (
	`character_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`character_id`, `tag_id`),
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "character_tags_status_check" CHECK(status in ('pending', 'accepted'))
);
--> statement-breakpoint
CREATE INDEX `character_tags_tag_idx` ON `character_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `chat_tags` (
	`chat_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`chat_id`, `tag_id`, `owner_id`),
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_tags_tag_idx` ON `chat_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `persona_tags` (
	`persona_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`persona_id`, `tag_id`),
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `persona_tags_tag_idx` ON `persona_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `preset_tags` (
	`preset_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`preset_id`, `tag_id`),
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `preset_tags_tag_idx` ON `preset_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text,
	`color2` text,
	`source` text,
	`folder_type` text DEFAULT 'NONE' NOT NULL,
	`sort_order` integer,
	`is_hidden_on_card` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "tags_source_check" CHECK(source in ('manual', 'auto', 'card')),
	CONSTRAINT "tags_folder_type_check" CHECK(folder_type in ('NONE', 'OPEN', 'CLOSED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_owner_name_unique` ON `tags` (`owner_id`,lower("name"));--> statement-breakpoint
CREATE TABLE `world_book_tags` (
	`world_book_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`world_book_id`, `tag_id`),
	FOREIGN KEY (`world_book_id`) REFERENCES `world_books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `world_book_tags_tag_idx` ON `world_book_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`handle` text NOT NULL,
	`external_id` text,
	`email` text,
	`role` text DEFAULT 'user' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`password_hash` text,
	`kind` text DEFAULT 'human' NOT NULL,
	`owner_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "users_role_check" CHECK(role in ('owner', 'admin', 'user')),
	CONSTRAINT "users_kind_check" CHECK(kind in ('human')),
	CONSTRAINT "users_agent_shape" CHECK(kind <> 'agent' OR (role = 'user' AND password_hash IS NULL AND external_id IS NULL AND owner_user_id IS NOT NULL)),
	CONSTRAINT "users_human_shape" CHECK(kind <> 'human' OR owner_user_id IS NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_unique` ON `users` (`handle`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_external_id_unique` ON `users` (`external_id`) WHERE "users"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `users_single_owner_unique` ON `users` (`role`) WHERE "users"."role" = 'owner';--> statement-breakpoint
CREATE TABLE `workload_schedules` (
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
	CONSTRAINT "workload_schedules_kind_check" CHECK(kind in ('index', 'distill-characters', 'compute-themes', 'memory-backfill', 'group-character-backfill', 'compute-cooccurrence', 'find-duplicates', 'csls', 'assets-backfill', 'assets-gc', 'assets-fsck', 'import-st', 'import-bundle', 'reconcile-stats', 'refresh-model-catalog', 'reconcile-world-state', 'databank-ingest', 'databank-reindex')),
	CONSTRAINT "workload_schedules_mode_check" CHECK(mode in ('singular', 'bulk')),
	CONSTRAINT "workload_schedules_cadence_check" CHECK(cadence in ('hourly', 'daily', 'weekly', 'monthly'))
);
--> statement-breakpoint
CREATE TABLE `workloads` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`mode` text DEFAULT 'singular' NOT NULL,
	`source` text DEFAULT 'none' NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`result` text,
	`owner_id` text,
	`depends_on` text,
	`error` text,
	`scheduled_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "workloads_kind_check" CHECK(kind in ('index', 'distill-characters', 'compute-themes', 'memory-backfill', 'group-character-backfill', 'compute-cooccurrence', 'find-duplicates', 'csls', 'assets-backfill', 'assets-gc', 'assets-fsck', 'import-st', 'import-bundle', 'reconcile-stats', 'refresh-model-catalog', 'reconcile-world-state', 'databank-ingest', 'databank-reindex')),
	CONSTRAINT "workloads_status_check" CHECK(status in ('queued', 'running', 'succeeded', 'failed', 'cancelling', 'cancelled', 'worker_died')),
	CONSTRAINT "workloads_mode_check" CHECK(mode in ('singular', 'bulk')),
	CONSTRAINT "workloads_source_check" CHECK(source in ('none', 'text', 'image', 'all'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workloads_mode_active_singular` ON `workloads` (`kind`,`owner_id`,`source`) WHERE status in ('queued', 'running', 'cancelling') and mode = 'singular';--> statement-breakpoint
CREATE UNIQUE INDEX `workloads_mode_active_bulk` ON `workloads` (`kind`,`source`) WHERE status in ('queued', 'running', 'cancelling') and mode = 'bulk';--> statement-breakpoint
CREATE TABLE `character_books` (
	`character_id` text NOT NULL,
	`world_book_id` text NOT NULL,
	`role` text DEFAULT 'auxiliary' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`character_id`, `world_book_id`),
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`world_book_id`) REFERENCES `world_books`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "character_books_role_check" CHECK(role in ('primary', 'auxiliary'))
);
--> statement-breakpoint
CREATE INDEX `character_books_book_idx` ON `character_books` (`world_book_id`);--> statement-breakpoint
CREATE TABLE `chat_books` (
	`chat_id` text NOT NULL,
	`world_book_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`chat_id`, `world_book_id`),
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`world_book_id`) REFERENCES `world_books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_books_book_idx` ON `chat_books` (`world_book_id`);--> statement-breakpoint
CREATE TABLE `global_books` (
	`world_book_id` text PRIMARY KEY NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`world_book_id`) REFERENCES `world_books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `persona_books` (
	`persona_id` text NOT NULL,
	`world_book_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`persona_id`, `world_book_id`),
	FOREIGN KEY (`persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`world_book_id`) REFERENCES `world_books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `persona_books_book_idx` ON `persona_books` (`world_book_id`);--> statement-breakpoint
CREATE TABLE `world_books` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `world_books_owner_idx` ON `world_books` (`owner_id`);--> statement-breakpoint
CREATE TABLE `world_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`world_book_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`content` text NOT NULL,
	`keys` text,
	`enabled` integer DEFAULT true NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`ignore_budget` integer DEFAULT false NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`world_book_id`) REFERENCES `world_books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `world_entries_book_idx` ON `world_entries` (`world_book_id`);