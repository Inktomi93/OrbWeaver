// How a caller's tenancy reaches each schema table (Spine-Identity-and-Auth §2b, D18/D20/D23). Keyed by the
// schema barrel's table exports and typed against each table's own columns, so a missing, stale or
// contradicting row fails tsc; tests/db/tenancy/index.test.ts checks what columns cannot show (foreign keys).
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Db } from "#client";

type Schema = Db["_"]["fullSchema"];

/** Every table export of the schema barrel: the key set {@link TABLE_SCOPING} must cover exactly. */
export type SchemaTableName = { [Name in keyof Schema]: Schema[Name] extends SQLiteTable ? Name : never }[keyof Schema];

type SqlNameOf<Name extends SchemaTableName> = Schema[Name] extends { readonly _: { readonly name: infer Sql } } ? Sql : never;

type ColumnOf<Name extends SchemaTableName> = keyof Schema[Name]["_"]["columns"];

/** The room: its own id is the anchor every other membership-class row carries as `chatId` (D18). */
export const ROOM_TABLE = "chats" satisfies SchemaTableName;

/** Strongest predicate first: a table that satisfies two classes takes the one its authorization check spells. */
const SCOPING_CLASSES = ["ownerId", "membership", "junction", "parent", "global"] as const;
type ScopingClass = (typeof SCOPING_CLASSES)[number];

/**
 * The classes a table's own columns admit. An `ownerId` column is the scope (D23), even beside a `chatId`
 * (chat_tags, D30). An unstamped `chatId` puts the table behind the roster (D18), as does being the room.
 * Every other table derives through its foreign keys or has no tenant; which of those is the row's judgment.
 */
type AdmittedScope<Name extends SchemaTableName> =
  "ownerId" extends ColumnOf<Name>
    ? "ownerId"
    : "chatId" extends ColumnOf<Name>
      ? "membership"
      : Name extends typeof ROOM_TABLE
        ? "membership"
        : Exclude<ScopingClass, "ownerId" | "membership">;

/**
 * One table's scoping decision. `why` names what an authorization check for the table predicates on. An
 * `ownerId` row also carries `stamp`, the D23 justification for stamping an owner instead of deriving it
 * through one foreign key: a true producer, a parentless per-user aggregate, or a sanctioned scope subject.
 */
export type ScopingRow = { readonly sqlName: string; readonly why: string } & (
  | { readonly scope: "ownerId"; readonly stamp: string }
  | { readonly scope: Exclude<ScopingClass, "ownerId"> }
);

type RowFor<Name extends SchemaTableName> = { readonly sqlName: SqlNameOf<Name>; readonly why: string } & (AdmittedScope<Name> extends "ownerId"
  ? { readonly scope: "ownerId"; readonly stamp: string }
  : { readonly scope: AdmittedScope<Name> });

/** The total registry shape: one row per table export, under its table's SQL name, in a class its columns admit. */
export type TableScopingRegistry = { readonly [Name in SchemaTableName]: RowFor<Name> };

export const TABLE_SCOPING = {
  // ownerId — the table stamps its owner (D23).
  assets: { sqlName: "assets", scope: "ownerId", stamp: "D21 single-owned (per-user, fetchOwned)", why: "D21 single-owned; reads go through `fetchOwned`." },
  automationRules: {
    sqlName: "automation_rules",
    scope: "ownerId",
    stamp: "D46 host-authored rule (runs as its author)",
    why: "D46 host-authored rule — runs as its author; the ownerId is the funding/authority subject.",
  },
  characters: { sqlName: "characters", scope: "ownerId", stamp: "D23 true producer", why: "D23 true producer — the card library is single-owned." },
  refinerySchemas: {
    sqlName: "refinery_schemas",
    scope: "ownerId",
    stamp:
      "D23 true producer (R3/SF0 — the custom payload-schema LIBRARY; a schema is authored library tooling with no owning parent to derive through, the presets shape)",
    why: "R3/SF0 custom payload-schema LIBRARY — authored library tooling with no owning parent (the presets shape).",
  },
  chatTags: {
    sqlName: "chat_tags",
    scope: "ownerId",
    stamp: "D30 per-user overlay on an ownerless chat (the tagger IS the owner)",
    why: "D30 per-user overlay on an OWNERLESS chat — the tagger IS the scope subject, so the chatId does NOT make it membership-scoped.",
  },
  dailyStats: { sqlName: "daily_stats", scope: "ownerId", stamp: "D23 parentless per-user aggregate (×day)", why: "D23 parentless per-user aggregate (×day)." },
  pluginProviderClaims: {
    sqlName: "plugin_provider_claims",
    scope: "ownerId",
    stamp:
      "D265 per-owner binding of a plugin provider id to one definition — the owner IS the scope the id resolves in, and the claim outlives its install as that owner's tombstone (plugin_id SET NULL), so there is no parent to derive the owner through; writers read it from plugins.owner_id",
    why: "D265 — one user's binding of a plugin provider id to a definition; the owner IS the scope a plugin id resolves in, and the claim outlives its install.",
  },
  embedGenerations: {
    sqlName: "embed_generations",
    scope: "ownerId",
    stamp:
      "D23 per-owner immutable vector provenance — connectionId is nullable SET NULL so a deleted connection cannot remain the ownership path; ownerId is retained as the generation's tenancy belt",
    why: "D23 per-owner immutable vector provenance — the retained owner remains the tenancy belt after a deleted connection is SET NULL.",
  },
  embedGenerationTargets: {
    sqlName: "embed_generation_targets",
    scope: "ownerId",
    stamp: "D23 parentless per-user aggregate (×embedding task) — the owner/task pair is the authoritative migration-target identity",
    why: "D23 parentless per-user aggregate (×embedding task) — the owner/task pair is the migration target identity.",
  },
  embedSpaceState: {
    sqlName: "embed_space_state",
    scope: "ownerId",
    stamp:
      "D23 parentless per-user aggregate (×vector scope) — the last COMPLETE embed space per (owner, scope) (inference program §10-5). There is no parent to derive through: the row's SUBJECT is the owner's corpus as a whole, not any one vector row, and a vector table cannot carry it (those are keyed per producer and deliberately ownerless, D20). The owner IS the identity here, exactly as owner_stats is",
    why: "D23 parentless per-user aggregate (×vector scope) — §10-5's completion record; no producer FK.",
  },
  embeddingCalls: {
    sqlName: "embedding_calls",
    scope: "ownerId",
    stamp: "D23 parentless per-user execution canon — the resolved funder owns the physical batch, which outlives connection deletion and vector purge",
    why: "D23 parentless per-user execution canon — resolved funder retained independently of nullable connection and purged vectors.",
  },
  documents: {
    sqlName: "documents",
    scope: "ownerId",
    stamp: "D49 databank producer / D23 top-level owned canon",
    why: "D49 databank producer — top-level owned canon.",
  },
  globalDocuments: {
    sqlName: "global_documents",
    scope: "ownerId",
    stamp: "D49 personal-bank scope junction (the ownerId IS the scope subject)",
    why: "D49 personal-bank scope junction — the ownerId IS the scope subject (not the documentId's owner).",
  },
  globalVariables: {
    sqlName: "global_variables",
    scope: "ownerId",
    stamp: "D46 per-user cross-chat KV (fetchOwned)",
    why: "D46 per-user cross-chat KV — a user can never read another's globals.",
  },
  keywordCooccurrence: {
    sqlName: "keyword_cooccurrence",
    scope: "ownerId",
    stamp: "D23 parentless per-user aggregate (×keyword-pair)",
    why: "D23 parentless per-user aggregate (×keyword-pair).",
  },
  modelStats: {
    sqlName: "model_stats",
    scope: "ownerId",
    stamp: "D23 parentless per-user aggregate (×model)",
    why: "D23 parentless per-user aggregate (×model).",
  },
  ownerStats: { sqlName: "owner_stats", scope: "ownerId", stamp: "D23 parentless per-user aggregate", why: "D23 parentless per-user aggregate." },
  imageryImportCalls: {
    sqlName: "imagery_import_calls",
    scope: "ownerId",
    stamp: "D23 parentless per-user import identity aggregate, atomically committed with its owned asset outputs",
    why: "D23 parentless per-user import identity aggregate; asset admission and all output rows commit with the claim.",
  },
  statsCanonVersions: {
    sqlName: "stats_canon_versions",
    scope: "ownerId",
    stamp: "D23 parentless per-user aggregate — monotonic rebuild ownership token",
    why: "D23 parentless per-user aggregate — monotonic rebuild ownership token.",
  },
  compactionSpend: {
    sqlName: "compaction_spend",
    scope: "ownerId",
    stamp:
      "D23 owner unreachable by FK — the funding host's compaction spend, which outlives the chat it was spent in (no chat_id), so the stamp is the only owner the stats rebuild can fold it to",
    why: "D23 owner stamp — the funding host's compaction spend ledger; no FK reaches the owner.",
  },
  personas: { sqlName: "personas", scope: "ownerId", stamp: "D23 true producer", why: "D23 true producer — personas are single-owned." },
  rosterPresets: {
    sqlName: "roster_presets",
    scope: "ownerId",
    stamp:
      "D23 true producer (D61 B6 — a saved party is the user's authored artifact; its character references are a LIST via the roster_preset_members junction, so there is no single required FK to derive the owner through)",
    why: "D61 B6 true producer — a saved party is the user's authored artifact; its character references are a LIST via the members junction, so there is no single owning FK to derive through.",
  },
  pluginKv: {
    sqlName: "plugin_kv",
    scope: "ownerId",
    stamp:
      "D46 denormalized guard on the plugin_id partition — the belt WHERE (plugin_id, owner_id) makes a cross-owner KV read structurally impossible even if a plugin_id were reused; owner also drives the user-hard-delete cascade",
    why: "D46 denormalized belt on the plugin_id partition — the (plugin_id, owner_id) WHERE makes a cross-owner KV read structurally impossible.",
  },
  plugins: {
    sqlName: "plugins",
    scope: "ownerId",
    stamp: "D46 true producer (the installing principal's per-user plugin registry; a plugin runs as its owner)",
    why: "D46 true producer — a plugin runs as its installing principal.",
  },
  presets: {
    sqlName: "presets",
    scope: "ownerId",
    stamp: "D23 true producer (nullable — the shared system default)",
    why: "D23 true producer; NULLABLE ownerId is the shared system default (a null owner matches no `fetchOwned` caller — that is what makes it read-only).",
  },
  tags: { sqlName: "tags", scope: "ownerId", stamp: "D23 true producer", why: "D23 true producer — a tag has no owning parent to derive through." },
  themeClusters: {
    sqlName: "theme_clusters",
    scope: "ownerId",
    stamp: "D23 parentless per-user aggregate (×cluster)",
    why: "D23 parentless per-user aggregate (×cluster).",
  },
  themes: {
    sqlName: "themes",
    scope: "ownerId",
    stamp: "D23 generalized producer list (themes) / D44/D63",
    why: "D44/D63 user theme library; seed palettes are null-owner rows, non-editable by construction.",
  },
  userConnections: {
    sqlName: "user_connections",
    scope: "ownerId",
    stamp: "D23 true producer (a connection is the user's own row — inference program §5.3; the resolver refuses a binding that names a stranger's)",
    why: "D23 true producer — a connection is the user's own row (inference program §5.3); the binding fold reads ONLY the funder's rows.",
  },
  userCredentials: {
    sqlName: "user_credentials",
    scope: "ownerId",
    stamp: "D23 true producer",
    why: "D23 true producer — the credential vault is single-owned.",
  },
  workloadSchedules: {
    sqlName: "workload_schedules",
    scope: "ownerId",
    stamp: "D23 true producer (a user-authored recurring-run config; no owned anchor to derive from — the TIME dimension over the workloads queue)",
    why: "D23 true producer — a user-authored recurring-run config with no owned anchor to derive from.",
  },
  workloads: { sqlName: "workloads", scope: "ownerId", stamp: "D23 true producer", why: "D23 true producer — the per-user execution queue." },
  worldBooks: { sqlName: "world_books", scope: "ownerId", stamp: "D23 true producer", why: "D23 true producer — books are top-level single-owned." },
  automationOwnerBudgets: {
    sqlName: "automation_owner_budgets",
    scope: "ownerId",
    stamp:
      "D23 parentless per-user aggregate + D46 — C5's owner-GLOBAL fire-rate ceiling: the scope belt for chat-less rules, which no chat can key. The owner IS the scope here — the row has no parent to derive one from — so the stamp is the identity, not a redundant denormalization",
    why: "C5's owner-GLOBAL fire-rate ceiling — the scope belt for chat-less rules (the per-chat belt is a fixed constant with no table). An authorization check here predicates on the caller's own userId and nothing else (the single-owned plane — there is no id to pass, so there is no other lane to name).",
  },
  regexScripts: {
    sqlName: "regex_scripts",
    scope: "ownerId",
    stamp: "D23 true producer (D121-E — the regex SCRIPT LIBRARY; a script is authored with no owning parent to derive through)",
    why: "D23 true producer — a script is the user's authored artifact with no owning parent to derive through (the world_books twin).",
  },
  // membership — the chat is ownerless; the participant roster is the authority (D18).
  automationFires: { sqlName: "automation_fires", scope: "membership", why: "D46 per-chat fire log — chat-anchored, read through the room." },
  chatBooks: {
    sqlName: "chat_books",
    scope: "membership",
    why: "the room's attached books: the CHAT side gates the read (a member sees the room's lore even when the book is the host's property, D18/D64); the world_books parent gates the EDIT.",
  },
  chatRegexScripts: {
    sqlName: "chat_regex_scripts",
    scope: "membership",
    why: "the room's attached regex scripts (the chat_books twin, D121-E): the CHAT side gates the read (a member sees the room's transforms even though the script is the host's property, D18/D64); the regex_scripts parent gates the EDIT.",
  },
  chatDigests: {
    sqlName: "chat_digests",
    scope: "membership",
    why: "the room's memory digests — chat-anchored derived data, read only by the room's members.",
  },
  chatGenerationObservations: {
    sqlName: "chat_generation_observations",
    scope: "membership",
    why: "retained completed generation facts inherit admission through their chat/source parents (D18); funderUserId freezes private liability (D19), never room read authority. Public/member projections strip funding and connection identity before the wire.",
  },
  chatDocuments: {
    sqlName: "chat_documents",
    scope: "membership",
    why: "the room's active databank set — room-public by design (`loadMetaByIds`'s header: a member views the HOST's active documents).",
  },
  chatEvents: {
    sqlName: "chat_events",
    scope: "membership",
    why: "the durable chat-bus log — the replay ring is room-public to members (the contract's allowlist makes secrets unrepresentable).",
  },
  chatHandoffResumptions: {
    sqlName: "chat_handoff_resumptions",
    scope: "membership",
    why: "the accepted-host completion marker is room workflow state; its chatId anchors authority in the participant roster.",
  },
  chatImportClaims: {
    sqlName: "chat_import_claims",
    scope: "membership",
    why: "the import idempotency claim is born with and derives authority through its chat; characterId narrows operation identity rather than creating a second read surface.",
  },
  chatInjections: { sqlName: "chat_injections", scope: "membership", why: "per-chat positional injections — room state, membership-gated." },
  chatInvites: { sqlName: "chat_invites", scope: "membership", why: "the membership chokepoint — issued by the host, redeemed by token; scope is the chat." },
  chatLocks: {
    sqlName: "chat_locks",
    scope: "membership",
    why: "the per-chat turn lock, PK = the chat's own id — a concurrency primitive co-located with the room it guards.",
  },
  chatParticipants: {
    sqlName: "chat_participants",
    scope: "membership",
    why: "the roster IS the membership predicate every other (b) read resolves through (D18).",
  },
  chatSegments: { sqlName: "chat_segments", scope: "membership", why: "the room's embedded transcript segments — chat-anchored derived data." },
  chatStreamEvents: { sqlName: "chat_stream_events", scope: "membership", why: "the resumable SSE token log — room-public to members, chat-anchored." },
  chats: {
    sqlName: "chats",
    scope: "membership",
    why: "D18: NO ownerId — the host participant is the authority and 'list my chats' is pure membership. Its OWN id is the anchor other (b) rows carry as chatId.",
  },
  imageryGenerations: {
    sqlName: "imagery_generations",
    scope: "membership",
    why: "chat-anchored image-generation provenance — the room it fired in scopes it (the asset parent scopes the blob).",
  },
  messages: {
    sqlName: "messages",
    scope: "membership",
    why: "canon slots — a member sees the room's admitted history (the `joinHistoryVisibility` floor is a host OPTION over this, not a second scope).",
  },
  pendingTurns: {
    sqlName: "pending_turns",
    scope: "membership",
    why: "a host-offline deferred turn — chat-anchored; `triggeredBy`/`runAsUserId` are turn IDENTITY (D19), not the read scope.",
  },
  rpgGames: {
    sqlName: "rpg_games",
    scope: "membership",
    why: "the rpg plane hangs off the room — `gmUserId` is a ROLE within the room, not an ownership stamp.",
  },
  sessionEntries: {
    sqlName: "session_entries",
    scope: "membership",
    why: "the agent-sdk session cache is chat-anchored (D8/D25); produced by infra, never a user-facing read.",
  },
  // junction — a pure link; the caller must reach both parents.
  characterBooks: {
    sqlName: "character_books",
    scope: "junction",
    why: "character ↔ world_book attachment; both parents are (a) ownerId tables, so the caller must own both ends.",
  },
  characterDocuments: { sqlName: "character_documents", scope: "junction", why: "character ↔ document attachment; both parents are (a) ownerId tables." },
  characterRegexScripts: {
    sqlName: "character_regex_scripts",
    scope: "junction",
    why: "D121-E character ↔ regex_script attachment; both parents are (a) ownerId tables, so the caller must own both ends.",
  },
  characterPersonas: {
    sqlName: "character_personas",
    scope: "junction",
    why: "the M:N character ↔ persona association (producer: persona); both parents are (a) ownerId tables.",
  },
  characterTags: {
    sqlName: "character_tags",
    scope: "junction",
    why: "D23 derive-don't-stamp precedent — a required FK to an owned row on BOTH ends makes the owner always derivable.",
  },
  chatDigestSpeakers: {
    sqlName: "chat_digest_speakers",
    scope: "junction",
    why: "digest ↔ character speaker stamp; the digest side is (b) membership, the character side is (a).",
  },
  digestThemeAssignments: {
    sqlName: "digest_theme_assignments",
    scope: "junction",
    why: "digest ↔ theme_cluster analytics link; theme_clusters is per-owner, the digest is chat-anchored.",
  },
  duplicateCharacterPairs: {
    sqlName: "duplicate_character_pairs",
    scope: "junction",
    why: "a derived near-duplicate PAIR — both characters must be the caller's (discovery computes per owner).",
  },
  duplicateChatPairs: {
    sqlName: "duplicate_chat_pairs",
    scope: "junction",
    why: "a derived near-duplicate PAIR over two chats — the caller must be a member of both.",
  },
  messageAssets: {
    sqlName: "message_assets",
    scope: "junction",
    why: "the structural message ↔ asset link (#67) — the message side is (b), the asset side is (a); it exists so the ref registry can SEE an inline chat image.",
  },
  personaBooks: { sqlName: "persona_books", scope: "junction", why: "persona ↔ world_book attachment; both parents are (a) ownerId tables." },
  pluginAssets: {
    sqlName: "plugin_assets",
    scope: "junction",
    why: "#802 plugin ↔ asset fetch link (`net.fetchAsset`); both parents are (a) ownerId tables and the write closes over BOTH — the pluginId from the bridge, the assetId minted by the CAS store under the installer — so neither end is guest-nameable. Like `message_assets` it exists so the asset-GC ref registry can SEE the reference; `fetched_at` is provenance riding the link, never a read key.",
  },
  rosterPresetMembers: {
    sqlName: "roster_preset_members",
    scope: "junction",
    why: "D61 B6 — roster_preset ↔ character seat; both parents are (a) ownerId tables (same owner, gated at the write verb), and the read joins through the preset. position/talkativeness/disabled are seat DATA riding the link, never a read key (the message_reactions posture).",
  },
  personaTags: { sqlName: "persona_tags", scope: "junction", why: "persona ↔ tag attachment; both parents are (a) ownerId tables." },
  presetTags: { sqlName: "preset_tags", scope: "junction", why: "preset ↔ tag attachment; both parents are (a) ownerId tables." },
  worldBookTags: { sqlName: "world_book_tags", scope: "junction", why: "world_book ↔ tag attachment; both parents are (a) ownerId tables." },
  presetRegexScripts: {
    sqlName: "preset_regex_scripts",
    scope: "junction",
    why: "D121-E preset ↔ regex_script attachment; both parents are (a) ownerId tables (a null-owner system preset matches no caller, so it is un-attachable by construction).",
  },
  // parent — scope inherits one owning foreign key.
  connectionBindings: {
    sqlName: "connection_bindings",
    scope: "parent",
    why: "an actor → connection pick (inference program §5.3): the owner DERIVES one FK away through the arm's actor (`users` / `automation_rules.ownerId` / `plugins.ownerId`), so the row carries no stamp of its own (D23 no doubling).",
  },
  rosterPresetRules: {
    sqlName: "roster_preset_rules",
    scope: "parent",
    why: "B10's rules rider — a cast's captured automation RULE PRESETS. NOT `junction` even though it links two concepts: a rule preset is a CODE-catalogue id (`RULE_PRESET_IDS`), not a row, so there is no second independently-scoped parent to reach (the message_reactions reasoning) — scope derives through the ONE owning FK, presetId → roster_presets.ownerId (D23). rule_preset_id/position/knobs are captured DATA riding the link, never a read key.",
  },
  automationRuleState: {
    sqlName: "automation_rule_state",
    scope: "parent",
    why: "S5 (C1) the run_analysis arm's plot state — scope derives ruleId → automation_rules (ownerId, chatId); D23-clean, no member/plugin read surface.",
  },
  messageReactions: {
    sqlName: "message_reactions",
    scope: "parent",
    why: "B6/MR0 — scope derives variantId → message_variants → messages → chats → the roster (D23 derive-don't-stamp). It is NOT `junction`: both FKs land in the SAME room, so there is no second independently-scoped parent to reach; and NOT `membership`, because the row carries no chatId of its own. `reactorParticipantId` is DATA (which seat reacted, D80), never the read key (MA-2 §3/§4).",
  },
  characterEmbeddings: {
    sqlName: "character_embeddings",
    scope: "parent",
    why: "derived vectors for a character — scope is `characters.ownerId` via the FK (embeddings stamps no owner, D23).",
  },
  characterKeywordProfiles: {
    sqlName: "character_keyword_profiles",
    scope: "parent",
    why: "discovery's per-card keyword profile — scope derives through `characters`.",
  },
  characterSnapshots: {
    sqlName: "character_snapshots",
    scope: "parent",
    why: "D28 the character history log — scope derives through `characters`; it gates nothing itself.",
  },
  characterStats: {
    sqlName: "character_stats",
    scope: "parent",
    why: "per-card economics — scope derives through `characters` (distinct from the (a) per-USER stats aggregates).",
  },
  characterSummaries: {
    sqlName: "character_summaries",
    scope: "parent",
    why: "discovery's distillation — scope derives through `characters` (its verbs' headers state the owner join).",
  },
  documentChunks: { sqlName: "document_chunks", scope: "parent", why: "databank chunk vectors — scope derives through `documents.ownerId`." },
  galleryItems: {
    sqlName: "gallery_items",
    scope: "parent",
    why: "ownership DERIVES via `asset_id → assets.ownerId` (the owner ruling 2026-07-01, stated in the schema header); `subject_character_id` is a nullable label, not a second parent.",
  },
  globalRegexScripts: {
    sqlName: "global_regex_scripts",
    scope: "parent",
    why: "D121-E: the always-on script set — a single PK/FK to `regex_scripts`, so scope is the script's owner.",
  },
  globalBooks: { sqlName: "global_books", scope: "parent", why: "the always-on book set — a single PK/FK to `world_books`, so scope is the book's owner." },
  imageAnalyses: { sqlName: "image_analyses", scope: "parent", why: "Utility annotations inherit the immutable asset owner and survive vector retirement." },
  imageEmbeddings: { sqlName: "image_embeddings", scope: "parent", why: "derived image vectors — scope derives through `assets.ownerId`." },
  imageIndexSkips: {
    sqlName: "image_index_skips",
    scope: "parent",
    why: "the indexer's admission-floor skip-log — a single PK/FK to `assets`, so scope derives through `assets.ownerId` (no stamped owner, D20).",
  },
  messageVariants: {
    sqlName: "message_variants",
    scope: "parent",
    why: "D26 the generation record — scope derives through `messages` to the room; a variant carries no attribution of its own.",
  },
  notifications: {
    sqlName: "notifications",
    scope: "parent",
    why: "the per-user durable inbox — `recipientUserId` IS the single owning FK (a differently-spelled owner column, so it is not on the D23 stamp allowlist).",
  },
  refineryRuns: {
    sqlName: "refinery_runs",
    scope: "parent",
    why: "refinery append-only run log — scope derives through `refinery_sessions` → `characters.ownerId` (two required FKs).",
  },
  refinerySessions: {
    sqlName: "refinery_sessions",
    scope: "parent",
    why: "refinery session — anchored `character_id NOT NULL → characters.ownerId`; the D23 DERIVE class (no stamp), the gallery_items/imagery_generations precedent.",
  },
  rpgCheckpoints: { sqlName: "rpg_checkpoints", scope: "parent", why: "scope derives through `rpg_games` to the room; the snapshot FK is intra-aggregate." },
  rpgJournal: { sqlName: "rpg_journal", scope: "parent", why: "scope derives through `rpg_games` to the room." },
  rpgSheets: {
    sqlName: "rpg_sheets",
    scope: "parent",
    why: "scope derives through `rpg_games` to the room; `userId`/`characterId` are the sheet's SUBJECT, not the read scope.",
  },
  rpgSnapshots: {
    sqlName: "rpg_snapshots",
    scope: "parent",
    why: "scope derives through `rpg_games` to the room; empty anchor slots are snapshot FKs, never lost completions.",
  },
  rpgTurnToolCalls: {
    sqlName: "rpg_turn_tool_calls",
    scope: "parent",
    why: "scope derives through `rpg_games` to the room — the read verb resolves MEMBERSHIP (a tool call is the record of a turn everyone at the table watched, not a GM secret), so the predicate is the game's chat, never an ownerId.",
  },
  sessions: {
    sqlName: "sessions",
    scope: "parent",
    why: "auth/BFF sessions — the single `userId` FK is the scope; reads are the session-resolution path, never a user-facing surface.",
  },
  userSeedLedger: {
    sqlName: "user_seed_ledger",
    scope: "parent",
    why: "the per-user seed ledger (D263) — `user_id` leads the PK and IS the FK and the scope.",
  },
  userSettings: { sqlName: "user_settings", scope: "parent", why: "the per-user config tier — natural-key PK `user_id` IS the FK and the scope." },
  worldEntries: { sqlName: "world_entries", scope: "parent", why: "book entries — scope derives through `world_books.ownerId`; entries stamp no owner (D23)." },
  // global — no tenancy predicate exists.
  adminDistributedPlugins: {
    sqlName: "admin_distributed_plugins",
    scope: "global",
    why: "D147(d) DEPLOYMENT POLICY — the set of plugin bundles an admin publishes to everyone. It has no tenant: `distributedBy` is a publisher-attribution stamp (and the CASCADE that lets that account be deleted), not a read scope, and the per-user INSTALLS it fans out to are ordinary owner-scoped `plugins` rows. Its authorization is the `requireAdmin` gate on the three distribution verbs, not a column.",
  },
  auditLogs: {
    sqlName: "audit_logs",
    scope: "global",
    why: "the append-only system log (writer: foundation/observability's `logAudit`); `actorUserId` is a SET-NULL attribution stamp, not a read scope — the log outlives its actor by design (D24).",
  },
  oidcTransactions: {
    sqlName: "oidc_transactions",
    scope: "global",
    why: "transient pre-identity auth state — there is no principal yet when it is written or read.",
  },
  oidcPendingSignups: {
    sqlName: "oidc_pending_signups",
    scope: "global",
    why: "transient pre-account auth state (D259) — no principal exists when it is written, previewed or taken; the one key is the peppered hash of the secret in the caller's own pending cookie.",
  },
  providerRows: {
    sqlName: "provider_rows",
    scope: "global",
    why: "the runtime provider REGISTRY content (plugin-shipped / admin-added `ProviderDef` rows, inference program §5.9-1): admin rows are deployment-wide; a plugin row is reached only through its reader's own `plugin_provider_claims` row (D265); `origin_*` is provenance, never a read key.",
  },
  rateLimitBuckets: {
    sqlName: "rate_limit_buckets",
    scope: "global",
    why: "transport-tier counters (producer: transport/rate-limit.ts) — keyed by bucket, never by tenant.",
  },
  settings: {
    sqlName: "settings",
    scope: "global",
    why: "the global KV escape hatch (the reserved `app` AppSettings row + the OR catalog snapshot); the per-USER tier is the separate `user_settings` table.",
  },
  users: {
    sqlName: "users",
    scope: "global",
    why: "the tenancy ROOT — it is not scoped BY anything: reads are self (principal.userId) or admin-gated, enforced by `no-direct-users-read`, not by a scope column.",
  },
} as const satisfies TableScopingRegistry;
