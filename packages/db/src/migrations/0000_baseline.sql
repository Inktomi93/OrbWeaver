CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`hash` text NOT NULL,
	`animated` integer DEFAULT false NOT NULL,
	`width` integer,
	`height` integer,
	`uploaded_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "assets_kind_check" CHECK(kind in ('card', 'avatar', 'export', 'generated', 'gallery', 'attachment', 'document', 'background', 'plugin')),
	CONSTRAINT "assets_measurements_check" CHECK(size >= 0 and (width is null or width > 0) and (height is null or height > 0))
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
	CONSTRAINT "automation_fires_outcome_check" CHECK(outcome in ('fired', 'predicate_false', 'predicate_error', 'budget_refused', 'depth_refused', 'action_error', 'authority_refused', 'test_run', 'reserved')),
	CONSTRAINT "automation_fires_trigger_type_check" CHECK(trigger_type in ('chatOpened', 'messageCommitted', 'messageEdited', 'variantSelected', 'turnStarted', 'turnCompleted', 'turnAborted', 'worldInfoActivated', 'personaSwitched', 'chatCreated', 'reactionsChanged', 'messageHidden', 'messagesDeleted', 'chatUpdated', 'wiEntryAttached', 'wiEntryDetached', 'character.updated', 'asset.created', 'persona.updated', 'world-info.updated')),
	CONSTRAINT "automation_fires_depth_check" CHECK(automation_depth >= 0)
);
--> statement-breakpoint
CREATE INDEX `automation_fires_rule_time` ON `automation_fires` (`rule_id`,`fired_at`);--> statement-breakpoint
CREATE INDEX `automation_fires_chat_idx` ON `automation_fires` (`chat_id`);--> statement-breakpoint
CREATE TABLE `automation_owner_budgets` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`max_fires_per_hour` integer DEFAULT 120 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "automation_owner_budgets_budget_check" CHECK(max_fires_per_hour >= 0)
);
--> statement-breakpoint
CREATE TABLE `automation_rule_state` (
	`rule_id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`guidance` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `automation_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "automation_rule_state_guidance_check" CHECK(length(guidance) <= 600)
);
--> statement-breakpoint
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
	`rule_preset_id` text,
	`rule_preset_knobs` text,
	`actions` text NOT NULL,
	`match_automation_events` integer DEFAULT false NOT NULL,
	`suggest_on_refusal` integer DEFAULT true NOT NULL,
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
	CONSTRAINT "automation_rules_rule_preset_check" CHECK((rule_preset_id IS NULL) = (rule_preset_knobs IS NULL)),
	CONSTRAINT "automation_rules_trigger_bus_check" CHECK(trigger_bus in ('chat', 'domain')),
	CONSTRAINT "automation_rules_trigger_type_check" CHECK((trigger_bus = 'chat' AND trigger_type in ('chatOpened', 'messageCommitted', 'messageEdited', 'variantSelected', 'turnStarted', 'turnCompleted', 'turnAborted', 'worldInfoActivated', 'personaSwitched', 'chatCreated', 'reactionsChanged', 'messageHidden', 'messagesDeleted', 'chatUpdated', 'wiEntryAttached', 'wiEntryDetached')) OR (trigger_bus = 'domain' AND trigger_type in ('character.updated', 'asset.created', 'persona.updated', 'world-info.updated'))),
	CONSTRAINT "automation_rules_counters_check" CHECK(cooldown_seconds >= 0 and max_fires_per_hour >= 0 and consecutive_errors >= 0)
);
--> statement-breakpoint
CREATE INDEX `automation_rules_chat_enabled` ON `automation_rules` (`chat_id`,`enabled`,`trigger_type`);--> statement-breakpoint
CREATE INDEX `automation_rules_owner_idx` ON `automation_rules` (`owner_id`);--> statement-breakpoint
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
	`interactive_html` integer,
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
	`extensions` text,
	`residual_data` text,
	`avatar_asset_id` text,
	`refinery` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`avatar_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `characters_owner_handle_unique` ON `characters` (`owner_id`,`handle`);--> statement-breakpoint
CREATE INDEX `characters_owner_idx` ON `characters` (`owner_id`);--> statement-breakpoint
CREATE INDEX `characters_avatar_asset_idx` ON `characters` (`avatar_asset_id`);--> statement-breakpoint
CREATE TABLE `chat_events` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chat_events_type_check" CHECK(type in ('delta', 'messageCommitted', 'messageEdited', 'messageHidden', 'variantSelected', 'messagesDeleted', 'messagesReordered', 'reasoningEdited', 'reasoningCleared', 'reasoningStreamDone', 'turnAccepted', 'turnStarted', 'turnCompleted', 'turnAborted', 'warning', 'worldInfoActivated', 'personaSwitched', 'reactionsChanged', 'wiBookAttached', 'wiBookDetached', 'wiEntryAttached', 'wiEntryDetached', 'wiEntryScopeChanged', 'chatCreated', 'chatOpened', 'historyTruncated', 'chatUpdated'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_events_chat_seq_unique` ON `chat_events` (`chat_id`,`seq`);--> statement-breakpoint
CREATE TABLE `chat_handoff_resumptions` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`accepted_by_user_id` text NOT NULL,
	`actor_rekeys` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`accepted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_handoff_resumptions_accepted_by_idx` ON `chat_handoff_resumptions` (`accepted_by_user_id`);--> statement-breakpoint
CREATE TABLE `chat_import_claims` (
	`chat_id` text NOT NULL,
	`character_id` text NOT NULL,
	`import_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`character_id`, `import_hash`),
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_import_claims_chat_idx` ON `chat_import_claims` (`chat_id`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `chat_invites_token_hash_unique` ON `chat_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `chat_invites_chat_idx` ON `chat_invites` (`chat_id`);--> statement-breakpoint
CREATE INDEX `chat_invites_invited_user_idx` ON `chat_invites` (`invited_user_id`);--> statement-breakpoint
CREATE INDEX `chat_invites_created_by_user_idx` ON `chat_invites` (`created_by_user_id`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `chat_participants_chat_host_unique` ON `chat_participants` (`chat_id`) WHERE role = 'host' and left_seq is null;--> statement-breakpoint
CREATE INDEX `chat_participants_chat_idx` ON `chat_participants` (`chat_id`);--> statement-breakpoint
CREATE INDEX `chat_participants_character_idx` ON `chat_participants` (`character_id`);--> statement-breakpoint
CREATE INDEX `chat_participants_user_idx` ON `chat_participants` (`user_id`);--> statement-breakpoint
CREATE INDEX `chat_participants_active_persona_idx` ON `chat_participants` (`active_persona_id`);--> statement-breakpoint
CREATE TABLE `chat_stream_events` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`message_id` text,
	`generation_id` text,
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
CREATE INDEX `chat_stream_events_message_idx` ON `chat_stream_events` (`message_id`);--> statement-breakpoint
CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text,
	`starred` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`temporary` integer DEFAULT false NOT NULL,
	`started_at` integer,
	`pending_host_user_id` text,
	`pending_handoff_offer` text,
	`anchor_persona_id` text,
	`parent_chat_id` text,
	`forked_at` integer,
	`compact_summary` text,
	`compacted_at_seq` integer,
	`metadata` text,
	`variable_values` text,
	`user_macro_values` text,
	`runtime_variables` text,
	`stream_seq` integer DEFAULT 0 NOT NULL,
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
CREATE INDEX `chats_anchor_persona_idx` ON `chats` (`anchor_persona_id`);--> statement-breakpoint
CREATE INDEX `chats_pending_host_idx` ON `chats` (`pending_host_user_id`);--> statement-breakpoint
CREATE TABLE `message_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`origin` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "message_assets_origin_check" CHECK(origin in ('attached', 'illustration', 'inline-reply'))
);
--> statement-breakpoint
CREATE INDEX `message_assets_message_idx` ON `message_assets` (`message_id`);--> statement-breakpoint
CREATE INDEX `message_assets_asset_idx` ON `message_assets` (`asset_id`);--> statement-breakpoint
CREATE TABLE `message_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`variant_id` text NOT NULL,
	`reactor_participant_id` text NOT NULL,
	`emoji` text NOT NULL,
	`emoji_image_asset_id` text,
	`segment_index` integer,
	`segment_speaker` text,
	`segment_snippet` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`variant_id`) REFERENCES `message_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reactor_participant_id`) REFERENCES `chat_participants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`emoji_image_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "message_reactions_segment_shape" CHECK((segment_index IS NULL AND segment_speaker IS NULL AND segment_snippet IS NULL) OR (segment_index IS NOT NULL AND segment_snippet IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_reactions_whole_message_unique` ON `message_reactions` (`variant_id`,`reactor_participant_id`,`emoji`) WHERE segment_index is null;--> statement-breakpoint
CREATE UNIQUE INDEX `message_reactions_segment_unique` ON `message_reactions` (`variant_id`,`reactor_participant_id`,`emoji`,`segment_index`) WHERE segment_index is not null;--> statement-breakpoint
CREATE INDEX `message_reactions_reactor_idx` ON `message_reactions` (`reactor_participant_id`);--> statement-breakpoint
CREATE INDEX `message_reactions_emoji_asset_idx` ON `message_reactions` (`emoji_image_asset_id`);--> statement-breakpoint
CREATE TABLE `message_variants` (
	`id` text PRIMARY KEY NOT NULL,
	`message_id` text NOT NULL,
	`idx` integer NOT NULL,
	`content` text NOT NULL,
	`raw_content` text,
	`macro_freezes` text,
	`reasoning` text,
	`reasoning_parts` text,
	`model` text,
	`connection_id` text,
	`provider` text,
	`reasoning_effort` text,
	`tokens_in` integer,
	`tokens_out` integer,
	`token_provenance` text DEFAULT 'unrecorded' NOT NULL,
	`cache_read_tokens` integer,
	`cache_write_tokens` integer,
	`reasoning_tokens` integer,
	`cost_usd` real,
	`cost_provenance` text DEFAULT 'unrecorded' NOT NULL,
	`cost_details` text,
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
	`macro_draws` text,
	`params` text,
	`prompt_snapshot` text,
	`gen_started_at` integer,
	`gen_finished_at` integer,
	`generation_id` text,
	`pre_continue_content` text,
	`pre_continue_reasoning` text,
	`last_continuation_content` text,
	`last_continuation_reasoning` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `user_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`context_boundary_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "message_variants_token_provenance_check" CHECK(token_provenance in ('measured', 'estimated', 'unrecorded')),
	CONSTRAINT "message_variants_cost_provenance_check" CHECK(cost_provenance in ('measured', 'estimated', 'unrecorded')),
	CONSTRAINT "message_variants_finish_reason_check" CHECK(finish_reason is null or finish_reason in ('stop', 'length', 'filter', 'tool', 'other')),
	CONSTRAINT "message_variants_reasoning_effort_check" CHECK(reasoning_effort is null or reasoning_effort in ('none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `message_variants_message_idx_unique` ON `message_variants` (`message_id`,`idx`);--> statement-breakpoint
CREATE INDEX `message_variants_context_boundary_idx` ON `message_variants` (`context_boundary_message_id`);--> statement-breakpoint
CREATE INDEX `message_variants_connection_idx` ON `message_variants` (`connection_id`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`kind` text DEFAULT 'standard' NOT NULL,
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
	CONSTRAINT "messages_kind_check" CHECK(kind in ('standard', 'narrator', 'comment')),
	CONSTRAINT "messages_initiator_check" CHECK(initiator in ('human', 'automation', 'plugin', 'import')),
	CONSTRAINT "messages_kind_shape" CHECK((kind <> 'narrator' OR role = 'assistant')),
	CONSTRAINT "messages_attribution_shape" CHECK((character_id IS NULL OR role = 'assistant') AND (persona_id IS NULL OR role = 'user') AND (character_id IS NULL OR author_user_id IS NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_chat_seq_unique` ON `messages` (`chat_id`,`seq`);--> statement-breakpoint
CREATE INDEX `messages_author_user_idx` ON `messages` (`author_user_id`);--> statement-breakpoint
CREATE INDEX `messages_character_idx` ON `messages` (`character_id`);--> statement-breakpoint
CREATE INDEX `messages_persona_idx` ON `messages` (`persona_id`);--> statement-breakpoint
CREATE INDEX `messages_selected_variant_idx` ON `messages` (`selected_variant_id`);--> statement-breakpoint
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
CREATE INDEX `pending_turns_triggered_by_idx` ON `pending_turns` (`triggered_by`);--> statement-breakpoint
CREATE INDEX `pending_turns_run_as_user_idx` ON `pending_turns` (`run_as_user_id`);--> statement-breakpoint
CREATE TABLE `user_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`label` text NOT NULL,
	`provider_id` text NOT NULL,
	`credential_id` text,
	`base_url` text,
	`model` text NOT NULL,
	`api` text DEFAULT 'auto' NOT NULL,
	`declared` text,
	`extras` text,
	`transport` text,
	`model_listed` integer DEFAULT true NOT NULL,
	`allow_background` integer DEFAULT false NOT NULL,
	`prompt_cache` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`credential_id`) REFERENCES `user_credentials`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "user_connections_api_check" CHECK(api in ('chat-completions', 'agent-sdk', 'anthropic-messages', 'auto'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_connections_owner_label_unique` ON `user_connections` (`owner_id`,`label`);--> statement-breakpoint
CREATE INDEX `user_connections_credential_idx` ON `user_connections` (`credential_id`);--> statement-breakpoint
CREATE TABLE `connection_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_kind` text NOT NULL,
	`user_id` text,
	`rule_id` text,
	`plugin_id` text,
	`task` text NOT NULL,
	`connection_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`rule_id`) REFERENCES `automation_rules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `user_connections`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "connection_bindings_actor_kind_check" CHECK(actor_kind in ('user', 'automation-rule', 'plugin-grant')),
	CONSTRAINT "connection_bindings_task_check" CHECK(task in ('chat', 'summarize', 'generateImage', 'embed', 'imageEmbed', 'rerank')),
	CONSTRAINT "connection_bindings_actor_shape_check" CHECK((actor_kind = 'user' and user_id is not null and rule_id is null and plugin_id is null) or (actor_kind = 'automation-rule' and rule_id is not null and user_id is null and plugin_id is null) or (actor_kind = 'plugin-grant' and plugin_id is not null and user_id is null and rule_id is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connection_bindings_user_task_unique` ON `connection_bindings` (`user_id`,`task`) WHERE "connection_bindings"."actor_kind" = 'user';--> statement-breakpoint
CREATE UNIQUE INDEX `connection_bindings_rule_task_unique` ON `connection_bindings` (`rule_id`,`task`) WHERE "connection_bindings"."actor_kind" = 'automation-rule';--> statement-breakpoint
CREATE UNIQUE INDEX `connection_bindings_plugin_task_unique` ON `connection_bindings` (`plugin_id`,`task`) WHERE "connection_bindings"."actor_kind" = 'plugin-grant';--> statement-breakpoint
CREATE INDEX `connection_bindings_connection_idx` ON `connection_bindings` (`connection_id`);--> statement-breakpoint
CREATE TABLE `plugin_provider_contributions` (
	`provider_id` text NOT NULL,
	`plugin_id` text NOT NULL,
	`definition_hash` text NOT NULL,
	`provider_kind` text DEFAULT 'plugin' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`provider_id`, `plugin_id`),
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`provider_id`,`definition_hash`,`provider_kind`) REFERENCES `provider_rows`(`id`,`definition_hash`,`origin_kind`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "plugin_provider_contributions_kind_check" CHECK(provider_kind = 'plugin')
);
--> statement-breakpoint
CREATE INDEX `plugin_provider_contributions_plugin_idx` ON `plugin_provider_contributions` (`plugin_id`);--> statement-breakpoint
CREATE TABLE `provider_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`wire` text NOT NULL,
	`dialect` text,
	`auth` text NOT NULL,
	`base_url` text,
	`apis` text NOT NULL,
	`serves` text,
	`catalog` text NOT NULL,
	`metered` integer NOT NULL,
	`docs_url` text,
	`features` text,
	`definition_hash` text NOT NULL,
	`origin_kind` text NOT NULL,
	`origin_user_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`origin_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "provider_rows_wire_check" CHECK(wire in ('openai-compat', 'anthropic-messages', 'agent-sdk', 'local-light')),
	CONSTRAINT "provider_rows_dialect_check" CHECK(dialect is null or dialect in ('openai-compatible', 'openrouter')),
	CONSTRAINT "provider_rows_auth_check" CHECK(auth in ('apiKey', 'oauthToken', 'endpoint', 'none')),
	CONSTRAINT "provider_rows_catalog_check" CHECK(catalog in ('url', 'builtin')),
	CONSTRAINT "provider_rows_origin_kind_check" CHECK(origin_kind in ('plugin', 'admin')),
	CONSTRAINT "provider_rows_origin_shape_check" CHECK((origin_kind = 'plugin' and origin_user_id is null) or origin_kind = 'admin')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_rows_contribution_identity_unique` ON `provider_rows` (`id`,`definition_hash`,`origin_kind`);--> statement-breakpoint
CREATE INDEX `provider_rows_origin_user_idx` ON `provider_rows` (`origin_user_id`);--> statement-breakpoint
CREATE TABLE `user_credentials` (
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
CREATE INDEX `user_credentials_owner_idx` ON `user_credentials` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_credentials_owner_provider_label_unique` ON `user_credentials` (`owner_id`,`provider`,`label`);--> statement-breakpoint
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
CREATE INDEX `documents_source_asset_idx` ON `documents` (`source_asset_id`);--> statement-breakpoint
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
	`generation_id` text NOT NULL,
	`dim` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `embed_generations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_embeddings_character_generation_unique` ON `character_embeddings` (`character_id`,`generation_id`);--> statement-breakpoint
CREATE INDEX `character_embeddings_generation_idx` ON `character_embeddings` (`generation_id`);--> statement-breakpoint
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
	`generation_id` text NOT NULL,
	`dim` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scoped_character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `embed_generations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_digests_scope_unique` ON `chat_digests` (`chat_id`,`scoped_character_id`,`tier`,`block_idx`,`generation_id`);--> statement-breakpoint
CREATE INDEX `chat_digests_chat_idx` ON `chat_digests` (`chat_id`);--> statement-breakpoint
CREATE INDEX `chat_digests_scoped_character_idx` ON `chat_digests` (`scoped_character_id`);--> statement-breakpoint
CREATE INDEX `chat_digests_generation_idx` ON `chat_digests` (`generation_id`);--> statement-breakpoint
CREATE TABLE `chat_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`block_idx` integer NOT NULL,
	`chunk_idx` integer NOT NULL,
	`seq_start` integer NOT NULL,
	`seq_end` integer NOT NULL,
	`text` text NOT NULL,
	`embedding` F32_BLOB(1024) NOT NULL,
	`content_hash` text NOT NULL,
	`hub_score` real,
	`model` text NOT NULL,
	`generation_id` text NOT NULL,
	`dim` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `embed_generations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "chat_segments_span_check" CHECK(block_idx >= 0 and chunk_idx >= 0 and seq_start >= 0 and seq_end >= seq_start)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_segments_chat_block_chunk_unique` ON `chat_segments` (`chat_id`,`block_idx`,`chunk_idx`,`generation_id`);--> statement-breakpoint
CREATE INDEX `chat_segments_generation_idx` ON `chat_segments` (`generation_id`);--> statement-breakpoint
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
	`generation_id` text NOT NULL,
	`dim` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `embed_generations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "document_chunks_span_check" CHECK(chunk_idx >= 0 and char_start >= 0 and char_end >= char_start)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_chunks_doc_chunk_generation_unique` ON `document_chunks` (`document_id`,`chunk_idx`,`generation_id`);--> statement-breakpoint
CREATE INDEX `document_chunks_document_idx` ON `document_chunks` (`document_id`);--> statement-breakpoint
CREATE INDEX `document_chunks_generation_idx` ON `document_chunks` (`generation_id`);--> statement-breakpoint
CREATE TABLE `embed_generation_targets` (
	`owner_id` text NOT NULL,
	`task` text NOT NULL,
	`generation_id` text NOT NULL,
	`epoch` integer NOT NULL,
	PRIMARY KEY(`owner_id`, `task`),
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `embed_generations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "embed_generation_targets_task_check" CHECK(task in ('embed', 'imageEmbed'))
);
--> statement-breakpoint
CREATE INDEX `embed_generation_targets_generation_idx` ON `embed_generation_targets` (`generation_id`);--> statement-breakpoint
CREATE TABLE `embed_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`task` text NOT NULL,
	`via` text NOT NULL,
	`connection_id` text,
	`connection_ref` text NOT NULL,
	`fingerprint` text NOT NULL,
	`space` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `user_connections`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "embed_generations_task_check" CHECK(task in ('embed', 'imageEmbed')),
	CONSTRAINT "embed_generations_via_check" CHECK(via in ('embed', 'imageEmbed'))
);
--> statement-breakpoint
CREATE INDEX `embed_generations_owner_task_idx` ON `embed_generations` (`owner_id`,`task`);--> statement-breakpoint
CREATE INDEX `embed_generations_connection_idx` ON `embed_generations` (`connection_id`);--> statement-breakpoint
CREATE TABLE `embed_space_state` (
	`owner_id` text NOT NULL,
	`scope` text NOT NULL,
	`active_generation_id` text,
	`candidate_generation_id` text,
	`candidate_epoch` integer,
	`completed_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`owner_id`, `scope`),
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`active_generation_id`) REFERENCES `embed_generations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`candidate_generation_id`) REFERENCES `embed_generations`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "embed_space_state_scope_check" CHECK(scope in ('cards', 'memory', 'documents', 'images'))
);
--> statement-breakpoint
CREATE INDEX `embed_space_state_active_generation_idx` ON `embed_space_state` (`active_generation_id`);--> statement-breakpoint
CREATE INDEX `embed_space_state_candidate_generation_idx` ON `embed_space_state` (`candidate_generation_id`);--> statement-breakpoint
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
	`generation_id` text NOT NULL,
	`dim` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`generation_id`) REFERENCES `embed_generations`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "image_embeddings_lens_check" CHECK(lens in ('image-raw', 'image-captioned'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `image_embeddings_asset_generation_lens_unique` ON `image_embeddings` (`asset_id`,`generation_id`,`lens`);--> statement-breakpoint
CREATE INDEX `image_embeddings_generation_idx` ON `image_embeddings` (`generation_id`);--> statement-breakpoint
CREATE TABLE `image_index_skips` (
	`asset_id` text PRIMARY KEY NOT NULL,
	`reason` text NOT NULL,
	`width` integer,
	`height` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "image_index_skips_reason_check" CHECK(reason in ('below-dimension-floor'))
);
--> statement-breakpoint
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
CREATE UNIQUE INDEX `gallery_items_asset_unsubjected_unique` ON `gallery_items` (`asset_id`) WHERE "gallery_items"."subject_character_id" IS NULL;--> statement-breakpoint
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
	`provider` text,
	`connection_id` text,
	`cost_usd` real,
	`edited` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`subject_character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`connection_id`) REFERENCES `user_connections`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "imagery_generations_mode_check" CHECK(mode in ('free', 'character', 'face', 'scenario', 'background', 'character_multimodal', 'face_multimodal'))
);
--> statement-breakpoint
CREATE INDEX `imagery_generations_reuse_idx` ON `imagery_generations` (`subject_character_id`,`mode`,`identity_hash`);--> statement-breakpoint
CREATE INDEX `imagery_generations_connection_idx` ON `imagery_generations` (`connection_id`);--> statement-breakpoint
CREATE INDEX `imagery_generations_asset_idx` ON `imagery_generations` (`asset_id`);--> statement-breakpoint
CREATE INDEX `imagery_generations_chat_idx` ON `imagery_generations` (`chat_id`);--> statement-breakpoint
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
	CONSTRAINT "notifications_type_check" CHECK(type in ('invite', 'kicked', 'handoff-nominated', 'handoff-accepted', 'deferred-turn-dropped', 'automation-notice', 'plugin-disabled', 'plugins-awaiting-consent'))
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
CREATE INDEX `personas_avatar_asset_idx` ON `personas` (`avatar_asset_id`);--> statement-breakpoint
CREATE TABLE `admin_distributed_plugins` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`version` text NOT NULL,
	`bundle_asset_id` text NOT NULL,
	`distributed_by` text NOT NULL,
	`distributed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`bundle_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`distributed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `admin_distributed_plugins_bundle_asset_idx` ON `admin_distributed_plugins` (`bundle_asset_id`);--> statement-breakpoint
CREATE INDEX `admin_distributed_plugins_distributed_by_idx` ON `admin_distributed_plugins` (`distributed_by`);--> statement-breakpoint
CREATE TABLE `plugin_assets` (
	`plugin_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`bundle_path` text DEFAULT '' NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`plugin_id`, `asset_id`, `bundle_path`),
	FOREIGN KEY (`plugin_id`) REFERENCES `plugins`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "plugin_assets_bundle_path_check" CHECK(bundle_path = '' or bundle_path like 'ui/assets/%')
);
--> statement-breakpoint
CREATE INDEX `plugin_assets_asset_idx` ON `plugin_assets` (`asset_id`);--> statement-breakpoint
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
	CONSTRAINT "plugin_kv_value_check" CHECK(length(cast(value as blob)) <= 65536)
);
--> statement-breakpoint
CREATE INDEX `plugin_kv_owner_idx` ON `plugin_kv` (`owner_id`);--> statement-breakpoint
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
	`source_url` text,
	`pending_reconsent` integer DEFAULT false NOT NULL,
	`widened_net_hosts` text DEFAULT '[]' NOT NULL,
	`consecutive_crashes` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`installed_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bundle_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "plugins_status_check" CHECK(status in ('disabled', 'enabled', 'errored')),
	CONSTRAINT "plugins_origin_check" CHECK(origin in ('upload', 'url')),
	CONSTRAINT "plugins_source_url_check" CHECK((origin = 'upload' and source_url is null) or (origin <> 'upload' and source_url is not null)),
	CONSTRAINT "plugins_widened_hosts_check" CHECK(pending_reconsent = 1 or json_array_length(widened_net_hosts) = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plugins_owner_slug_unique` ON `plugins` (`owner_id`,`slug`);--> statement-breakpoint
CREATE INDEX `plugins_bundle_asset_idx` ON `plugins` (`bundle_asset_id`);--> statement-breakpoint
CREATE TABLE `presets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`config` text NOT NULL,
	`schema_version` integer DEFAULT 8 NOT NULL,
	`forked_from` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`forked_from`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `presets_owner_idx` ON `presets` (`owner_id`);--> statement-breakpoint
CREATE INDEX `presets_owner_forked_from_idx` ON `presets` (`owner_id`,`forked_from`);--> statement-breakpoint
CREATE INDEX `presets_forked_from_idx` ON `presets` (`forked_from`);--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT "rate_limit_buckets_window_check" CHECK(count >= 0 and expires_at > 0)
);
--> statement-breakpoint
CREATE TABLE `refinery_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`stage` text NOT NULL,
	`iteration` integer DEFAULT 0 NOT NULL,
	`payload_config` text NOT NULL,
	`payload` text NOT NULL,
	`model` text,
	`prompt_tokens` integer,
	`output_tokens` integer,
	`duration_ms` integer NOT NULL,
	`source_run_id` text,
	`stripped_keys` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `refinery_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_run_id`) REFERENCES `refinery_runs`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "refinery_runs_stage_check" CHECK(stage in ('score', 'rewrite', 'analyze'))
);
--> statement-breakpoint
CREATE INDEX `refinery_runs_session_stage_idx` ON `refinery_runs` (`session_id`,`stage`,`created_at`);--> statement-breakpoint
CREATE INDEX `refinery_runs_source_idx` ON `refinery_runs` (`source_run_id`);--> statement-breakpoint
CREATE TABLE `refinery_schemas` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`stage` text NOT NULL,
	`schema` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "refinery_schemas_stage_check" CHECK(stage in ('score', 'analyze'))
);
--> statement-breakpoint
CREATE INDEX `refinery_schemas_owner_idx` ON `refinery_schemas` (`owner_id`);--> statement-breakpoint
CREATE TABLE `refinery_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`name` text,
	`status` text DEFAULT 'active' NOT NULL,
	`original_card` text NOT NULL,
	`selection` text NOT NULL,
	`stage_config` text NOT NULL,
	`guidance` text,
	`iteration_count` integer DEFAULT 0 NOT NULL,
	`inflight_until` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "refinery_sessions_status_check" CHECK(status in ('active', 'completed', 'abandoned'))
);
--> statement-breakpoint
CREATE INDEX `refinery_sessions_character_idx` ON `refinery_sessions` (`character_id`);--> statement-breakpoint
CREATE TABLE `character_regex_scripts` (
	`character_id` text NOT NULL,
	`regex_script_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`character_id`, `regex_script_id`),
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`regex_script_id`) REFERENCES `regex_scripts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `character_regex_scripts_script_idx` ON `character_regex_scripts` (`regex_script_id`);--> statement-breakpoint
CREATE TABLE `chat_regex_scripts` (
	`chat_id` text NOT NULL,
	`regex_script_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`chat_id`, `regex_script_id`),
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`regex_script_id`) REFERENCES `regex_scripts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chat_regex_scripts_script_idx` ON `chat_regex_scripts` (`regex_script_id`);--> statement-breakpoint
CREATE TABLE `global_regex_scripts` (
	`regex_script_id` text PRIMARY KEY NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`regex_script_id`) REFERENCES `regex_scripts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `preset_regex_scripts` (
	`preset_id` text NOT NULL,
	`regex_script_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`preset_id`, `regex_script_id`),
	FOREIGN KEY (`preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`regex_script_id`) REFERENCES `regex_scripts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `preset_regex_scripts_script_idx` ON `preset_regex_scripts` (`regex_script_id`);--> statement-breakpoint
CREATE TABLE `regex_scripts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`behavior` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `regex_scripts_owner_idx` ON `regex_scripts` (`owner_id`);--> statement-breakpoint
CREATE TABLE `roster_preset_members` (
	`preset_id` text NOT NULL,
	`character_id` text NOT NULL,
	`position` integer NOT NULL,
	`talkativeness` real,
	`disabled` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`preset_id`, `character_id`),
	FOREIGN KEY (`preset_id`) REFERENCES `roster_presets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `roster_preset_members_character_idx` ON `roster_preset_members` (`character_id`);--> statement-breakpoint
CREATE TABLE `roster_preset_rules` (
	`preset_id` text NOT NULL,
	`rule_preset_id` text NOT NULL,
	`position` integer NOT NULL,
	`knobs` text NOT NULL,
	PRIMARY KEY(`preset_id`, `rule_preset_id`),
	FOREIGN KEY (`preset_id`) REFERENCES `roster_presets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `roster_presets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`anchor_persona_id` text,
	`group_config` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`anchor_persona_id`) REFERENCES `personas`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `roster_presets_owner_name_unique` ON `roster_presets` (`owner_id`,`name`);--> statement-breakpoint
CREATE INDEX `roster_presets_anchor_persona_idx` ON `roster_presets` (`anchor_persona_id`);--> statement-breakpoint
CREATE TABLE `rpg_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`snapshot_id` text NOT NULL,
	`label` text NOT NULL,
	`trigger` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `rpg_games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`snapshot_id`) REFERENCES `rpg_snapshots`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "rpg_checkpoints_trigger_check" CHECK(trigger in ('manual'))
);
--> statement-breakpoint
CREATE INDEX `rpg_checkpoints_game_idx` ON `rpg_checkpoints` (`game_id`);--> statement-breakpoint
CREATE INDEX `rpg_checkpoints_snapshot_idx` ON `rpg_checkpoints` (`snapshot_id`);--> statement-breakpoint
CREATE TABLE `rpg_games` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`mode` text NOT NULL,
	`status` text NOT NULL,
	`session_number` integer DEFAULT 1 NOT NULL,
	`gm_user_id` text,
	`gm_preset_id` text,
	`config` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`gm_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`gm_preset_id`) REFERENCES `presets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "rpg_games_mode_check" CHECK(mode in ('lite', 'full')),
	CONSTRAINT "rpg_games_status_check" CHECK(status in ('setup', 'ready', 'active', 'concluded'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rpg_games_chat_unique` ON `rpg_games` (`chat_id`);--> statement-breakpoint
CREATE INDEX `rpg_games_gm_user_idx` ON `rpg_games` (`gm_user_id`);--> statement-breakpoint
CREATE INDEX `rpg_games_gm_preset_idx` ON `rpg_games` (`gm_preset_id`);--> statement-breakpoint
CREATE TABLE `rpg_journal` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`type` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`variant_id` text,
	`source_message_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `rpg_games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `message_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "rpg_journal_type_check" CHECK(type in ('location', 'npc', 'combat', 'quest', 'item', 'event', 'note', 'custom'))
);
--> statement-breakpoint
CREATE INDEX `rpg_journal_game_variant_idx` ON `rpg_journal` (`game_id`,`variant_id`);--> statement-breakpoint
CREATE INDEX `rpg_journal_variant_idx` ON `rpg_journal` (`variant_id`);--> statement-breakpoint
CREATE INDEX `rpg_journal_source_message_idx` ON `rpg_journal` (`source_message_id`);--> statement-breakpoint
CREATE TABLE `rpg_sheets` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`character_id` text,
	`user_id` text,
	`sheet` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `rpg_games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "rpg_sheets_actor_xor_check" CHECK((character_id is null) + (user_id is null) = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rpg_sheets_game_character_unique` ON `rpg_sheets` (`game_id`,`character_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `rpg_sheets_game_user_unique` ON `rpg_sheets` (`game_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `rpg_sheets_character_idx` ON `rpg_sheets` (`character_id`);--> statement-breakpoint
CREATE INDEX `rpg_sheets_user_idx` ON `rpg_sheets` (`user_id`);--> statement-breakpoint
CREATE TABLE `rpg_snapshots` (
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
	FOREIGN KEY (`game_id`) REFERENCES `rpg_games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `message_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`as_of_message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "rpg_snapshots_arm_check" CHECK((message_id is null) = (variant_id is null) and (message_id is null or as_of_message_id is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rpg_snapshots_variant_unique` ON `rpg_snapshots` (`variant_id`) WHERE variant_id is not null;--> statement-breakpoint
CREATE INDEX `rpg_snapshots_game_idx` ON `rpg_snapshots` (`game_id`);--> statement-breakpoint
CREATE INDEX `rpg_snapshots_message_idx` ON `rpg_snapshots` (`message_id`);--> statement-breakpoint
CREATE INDEX `rpg_snapshots_as_of_message_idx` ON `rpg_snapshots` (`as_of_message_id`);--> statement-breakpoint
CREATE TABLE `rpg_turn_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`message_id` text NOT NULL,
	`variant_id` text NOT NULL,
	`calls` text NOT NULL,
	`failure` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `rpg_games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`variant_id`) REFERENCES `message_variants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rpg_turn_tool_calls_variant_unique` ON `rpg_turn_tool_calls` (`variant_id`);--> statement-breakpoint
CREATE INDEX `rpg_turn_tool_calls_game_idx` ON `rpg_turn_tool_calls` (`game_id`);--> statement-breakpoint
CREATE INDEX `rpg_turn_tool_calls_message_idx` ON `rpg_turn_tool_calls` (`message_id`);--> statement-breakpoint
CREATE TABLE `session_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`sdk_session_id` text NOT NULL,
	`seq` integer NOT NULL,
	`seeded_through_seq` integer NOT NULL,
	`canon_hash` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`connection_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `user_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_entries_chat_seq_unique` ON `session_entries` (`chat_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_entries_sdk_session_unique` ON `session_entries` (`sdk_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_entries_primary_unique` ON `session_entries` (`chat_id`,`connection_id`) WHERE "session_entries"."is_primary" = 1;--> statement-breakpoint
CREATE INDEX `session_entries_connection_idx` ON `session_entries` (`connection_id`);--> statement-breakpoint
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
CREATE TABLE `oidc_transactions` (
	`state` text PRIMARY KEY NOT NULL,
	`code_verifier` text NOT NULL,
	`nonce` text,
	`redirect_uri` text,
	`invite_token_hash` text,
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
	`oidc_id_token_ciphertext` text,
	`oidc_id_token_iv` text,
	`oidc_id_token_tag` text,
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
	`schema_version` integer DEFAULT 9 NOT NULL,
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
	`tokens_in_measured_samples` integer DEFAULT 0 NOT NULL,
	`tokens_in_estimated_samples` integer DEFAULT 0 NOT NULL,
	`tokens_out_measured_samples` integer DEFAULT 0 NOT NULL,
	`tokens_out_estimated_samples` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`cost_samples` integer DEFAULT 0 NOT NULL,
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
	`tokens_in_measured_samples` integer DEFAULT 0 NOT NULL,
	`tokens_in_estimated_samples` integer DEFAULT 0 NOT NULL,
	`tokens_out_measured_samples` integer DEFAULT 0 NOT NULL,
	`tokens_out_estimated_samples` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`cost_samples` integer DEFAULT 0 NOT NULL,
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
	`tokens_in_measured_samples` integer DEFAULT 0 NOT NULL,
	`tokens_in_estimated_samples` integer DEFAULT 0 NOT NULL,
	`tokens_out_measured_samples` integer DEFAULT 0 NOT NULL,
	`tokens_out_estimated_samples` integer DEFAULT 0 NOT NULL,
	`gen_time_ms` integer DEFAULT 0 NOT NULL,
	`gen_samples` integer DEFAULT 0 NOT NULL,
	`reasoning_generations` integer DEFAULT 0 NOT NULL,
	`reasoning_ms` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`cost_samples` integer DEFAULT 0 NOT NULL,
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
	`tokens_in_measured_samples` integer DEFAULT 0 NOT NULL,
	`tokens_in_estimated_samples` integer DEFAULT 0 NOT NULL,
	`tokens_out_measured_samples` integer DEFAULT 0 NOT NULL,
	`tokens_out_estimated_samples` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`cost_samples` integer DEFAULT 0 NOT NULL,
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
CREATE TABLE `stats_canon_versions` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
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
CREATE INDEX `chat_tags_owner_idx` ON `chat_tags` (`owner_id`);--> statement-breakpoint
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
	`handle_key` text NOT NULL,
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
CREATE UNIQUE INDEX `users_handle_key_unique` ON `users` (`handle_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_external_id_unique` ON `users` (`external_id`) WHERE "users"."external_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `users_single_owner_unique` ON `users` (`role`) WHERE "users"."role" = 'owner';--> statement-breakpoint
CREATE INDEX `users_owner_user_idx` ON `users` (`owner_user_id`);--> statement-breakpoint
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
	CONSTRAINT "workload_schedules_kind_check" CHECK(kind in ('index', 'distill-characters', 'compute-themes', 'memory-backfill', 'group-character-backfill', 'compute-cooccurrence', 'find-duplicates', 'csls', 'assets-backfill', 'assets-gc', 'assets-fsck', 'import-st', 'import-token-usage-backfill', 'import-bundle', 'reconcile-stats', 'refresh-model-catalog', 'reconcile-world-state', 'databank-ingest', 'databank-reindex', 'refine-score-sweep')),
	CONSTRAINT "workload_schedules_mode_check" CHECK(mode in ('singular', 'bulk')),
	CONSTRAINT "workload_schedules_cadence_check" CHECK(cadence in ('hourly', 'daily', 'weekly', 'monthly'))
);
--> statement-breakpoint
CREATE INDEX `workload_schedules_owner_idx` ON `workload_schedules` (`owner_id`);--> statement-breakpoint
CREATE TABLE `workloads` (
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
	`admission_system` integer DEFAULT true NOT NULL,
	`depends_on` text,
	`error` text,
	`scheduled_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`respawns` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "workloads_kind_check" CHECK(kind in ('index', 'distill-characters', 'compute-themes', 'memory-backfill', 'group-character-backfill', 'compute-cooccurrence', 'find-duplicates', 'csls', 'assets-backfill', 'assets-gc', 'assets-fsck', 'import-st', 'import-token-usage-backfill', 'import-bundle', 'reconcile-stats', 'refresh-model-catalog', 'reconcile-world-state', 'databank-ingest', 'databank-reindex', 'refine-score-sweep')),
	CONSTRAINT "workloads_status_check" CHECK(status in ('queued', 'running', 'succeeded', 'failed', 'cancelling', 'cancelled', 'worker_died')),
	CONSTRAINT "workloads_mode_check" CHECK(mode in ('singular', 'bulk')),
	CONSTRAINT "workloads_lane_check" CHECK(lane in ('interactive', 'sweep'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workloads_mode_active_singular_owned` ON `workloads` (`kind`,`owner_id`,`admission_key`) WHERE status in ('queued', 'running', 'cancelling') and mode = 'singular' and admission_system = 0;--> statement-breakpoint
CREATE UNIQUE INDEX `workloads_mode_active_singular_system` ON `workloads` (`kind`,`admission_key`) WHERE status in ('queued', 'running', 'cancelling') and mode = 'singular' and admission_system = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `workloads_mode_active_bulk` ON `workloads` (`kind`,`admission_key`) WHERE status in ('queued', 'running', 'cancelling') and mode = 'bulk';--> statement-breakpoint
CREATE INDEX `workloads_owner_idx` ON `workloads` (`owner_id`);--> statement-breakpoint
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
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
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
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`world_book_id`) REFERENCES `world_books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `world_entries_book_idx` ON `world_entries` (`world_book_id`);