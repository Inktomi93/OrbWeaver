/**
 * Branded entity IDs — nominal types over `string`. Without brands, nothing stops passing a
 * `characterId` where a `chatId` is expected. Mint a TypeID: {@link mintTypeId}`(ID_PREFIX.chat)`.
 * Cross an untyped boundary: {@link castId}`<CharacterId>(raw)`. At the tRPC boundary:
 * {@link typeIdSchema}`(ID_PREFIX.persona)` (prefix-validating) or {@link brandedId}`<UserId>()`.
 */

import { fromString, typeidUnboxed } from "typeid-js";
import { z } from "zod";

declare const brand: unique symbol;

/** A `string` tagged with a phantom `B` marker (erased at runtime). */
export type Branded<B extends string> = string & { readonly [brand]: B };

// The compile-time brand reuses this file's `Branded<…>` phantom, not typeid-js's own object brand —
// an object-shaped brand trips biome's `noBaseToString` on `${id}` template interpolation.
export type TypeIdOf<P extends string> = Branded<P>;

/** The TypeID prefix for each entity. TypeID prefixes must be lowercase `[a-z_]` — multi-word
 *  entities use snake_case, not the camelCase key; a camelCase prefix throws `InvalidPrefixError`. */
export const ID_PREFIX = {
  persona: "persona",
  chat: "chat",
  message: "message",
  messageAsset: "message_asset",
  character: "character",
  characterSnapshot: "character_snapshot",
  tag: "tag",
  worldBook: "world_book",
  worldEntry: "world_entry",
  regexScript: "regex_script",
  preset: "preset",
  theme: "theme",
  asset: "asset",
  messageVariant: "message_variant",
  chatEvent: "chat_event",
  chatStreamEvent: "chat_stream_event",
  sessionEntry: "session_entry",
  chatInjection: "chat_injection",
  chatParticipant: "chat_participant",
  chatInvite: "chat_invite",
  pendingTurn: "pending_turn",
  // EPHEMERAL — the per-turn identity minted once at `executeTurn` (never persisted, no table). Threads the
  // tool-exec frame ↔ the turn-end hooks so a turn-scoped consumer (rpg's staging accumulator) correlates
  // mid-turn tool writes to its commit/abort flush under lock-free concurrency (rpg-design/05 §2).
  chatTurn: "chat_turn",
  characterEmbedding: "character_embedding",
  chatDigest: "chat_digest",
  chatSegment: "chat_segment",
  themeCluster: "theme_cluster",
  duplicateCharacterPair: "duplicate_character_pair",
  duplicateChatPair: "duplicate_chat_pair",
  characterKeywordProfile: "character_keyword_profile",
  keywordCooccurrence: "keyword_cooccurrence",
  workload: "workload",
  workloadSchedule: "workload_schedule",
  auditLog: "audit_log",
  session: "session",
  userCredential: "user_credential",
  imageEmbedding: "image_embedding",
  characterStat: "character_stat",
  ownerStat: "owner_stat",
  dailyStat: "daily_stat",
  modelStat: "model_stat",
  notification: "notification",
  imageryGeneration: "imagery_generation",
  galleryItem: "gallery_item",
  // `global_variables` deliberately has NO TypeID — the natural key (ownerId, key) IS the identity.
  automationRule: "automation_rule",
  automationFire: "automation_fire",
  document: "document",
  documentChunk: "document_chunk",
  // The installed-plugin registry row (D46). `plugin_kv` has NO TypeID — its identity is the composite
  // PK (pluginId, key).
  plugin: "plugin",
  // RPG lite substrate (rpg-design/05 §4.1). Quest ids are PLAIN strings minted inside the snapshot
  // blob (no table, no FK — a TypeID brand buys nothing there; the objective-id precedent), so no
  // `rpgQuest` prefix. Full ADDS its own prefixes (npc/clock/map/session/encounter/scene/pendingCheck).
  rpgGame: "rpg_game",
  rpgSnapshot: "rpg_snapshot",
  rpgSheet: "rpg_sheet",
  rpgJournal: "rpg_journal",
  rpgCheckpoint: "rpg_checkpoint",
} as const;

// --- Identity / auth ---------------------------------------------------------
export type UserId = Branded<"UserId">;
/** The BFF session ROW id (NOT the opaque cookie token — that's `SessionToken`). */
export type SessionId = TypeIdOf<"session">;
export type UserCredentialId = TypeIdOf<"user_credential">;

// Identity VALUES — not entity ids, but auth-layer strings that are mixing-prone.
// `Handle` = user-facing username; `ExternalId` = stable SSO `sub` (NEVER equal to
// Handle); `SessionToken` = opaque cookie value (NEVER a session row id).
export type Handle = Branded<"Handle">;
export type ExternalId = Branded<"ExternalId">;
export type SessionToken = Branded<"SessionToken">;

// --- Model / provider --------------------------------------------------------
// Both Claude model ids and OpenRouter routes; branded so a plain string can't
// flow where a vetted model id is expected.
export type ModelId = Branded<"ModelId">;

// --- Library entities --------------------------------------------------------
export type CharacterId = TypeIdOf<"character">;
export type CharacterSnapshotId = TypeIdOf<"character_snapshot">;
export type PersonaId = TypeIdOf<"persona">;
export type PresetId = TypeIdOf<"preset">;
export type ThemeId = TypeIdOf<"theme">;
export type WorldBookId = TypeIdOf<"world_book">;
export type WorldEntryId = TypeIdOf<"world_entry">;
/** A row in the owner-stamped regex SCRIPT LIBRARY (D121-E — the world-info pattern: one store, attached
 *  at scopes through per-type FK junctions). Distinct from the client-minted UUID an ST card carries. */
export type RegexScriptId = TypeIdOf<"regex_script">;
export type TagId = TypeIdOf<"tag">;
export type AssetId = TypeIdOf<"asset">;
export type ImageryGenerationId = TypeIdOf<"imagery_generation">;
export type GalleryItemId = TypeIdOf<"gallery_item">;

// --- Chat / conversation -----------------------------------------------------
export type ChatId = TypeIdOf<"chat">;
export type MessageId = TypeIdOf<"message">;
export type MessageVariantId = TypeIdOf<"message_variant">;
/** #67 — the structural chat-message ↔ asset link row (`message_assets`; inline-attachment GC retention). */
export type MessageAssetId = TypeIdOf<"message_asset">;
export type ChatEventId = TypeIdOf<"chat_event">;
export type ChatStreamEventId = TypeIdOf<"chat_stream_event">;
export type SessionEntryId = TypeIdOf<"session_entry">;
export type ChatInjectionId = TypeIdOf<"chat_injection">;
export type ChatParticipantId = TypeIdOf<"chat_participant">;
export type ChatInviteId = TypeIdOf<"chat_invite">;
export type PendingTurnId = TypeIdOf<"pending_turn">;
/** The ephemeral per-turn identity (never persisted) — minted once at `executeTurn`, carried on the
 *  `ChatToolExecFrame` and handed to the turn-end hooks so a turn-scoped consumer correlates a turn's tool
 *  writes to its commit/abort flush. Distinct from the provider-layer per-generation turnId. */
export type ChatTurnId = TypeIdOf<"chat_turn">;

// --- Corpus / vectors --------------------------------------------------------
export type CharacterEmbeddingId = TypeIdOf<"character_embedding">;
export type ChatDigestId = TypeIdOf<"chat_digest">;
export type ChatSegmentId = TypeIdOf<"chat_segment">;
export type ImageEmbeddingId = TypeIdOf<"image_embedding">;
// Precompute rollup tables (discovery outputs).
export type DuplicateCharacterPairId = TypeIdOf<"duplicate_character_pair">;
export type DuplicateChatPairId = TypeIdOf<"duplicate_chat_pair">;
export type CharacterKeywordProfileId = TypeIdOf<"character_keyword_profile">;
export type KeywordCooccurrenceId = TypeIdOf<"keyword_cooccurrence">;
export type ThemeClusterId = TypeIdOf<"theme_cluster">;

// --- Stats (precompute rollup rows) ------------------------------------------
export type CharacterStatId = TypeIdOf<"character_stat">;
/** @public the owner_stats table's id brand — one member of the per-table brand block; unused as a column type only because that table has a NATURAL PK. */
export type OwnerStatId = TypeIdOf<"owner_stat">;
export type DailyStatId = TypeIdOf<"daily_stat">;
export type ModelStatId = TypeIdOf<"model_stat">;

// --- Automation (rules + the fire log) ----------------------------------
export type AutomationRuleId = TypeIdOf<"automation_rule">;
export type AutomationFireId = TypeIdOf<"automation_fire">;

// --- Databank (source documents + vector chunks) --------------------
export type DocumentId = TypeIdOf<"document">;
export type DocumentChunkId = TypeIdOf<"document_chunk">;

// --- Plugins (D46 code sandbox) ----------------------------------------------
export type PluginId = TypeIdOf<"plugin">;

// --- RPG (lite substrate — the 5-table floor, rpg-design/05 §4.1) ------------
export type RpgGameId = TypeIdOf<"rpg_game">;
export type RpgSnapshotId = TypeIdOf<"rpg_snapshot">;
export type RpgSheetId = TypeIdOf<"rpg_sheet">;
export type RpgJournalId = TypeIdOf<"rpg_journal">;
export type RpgCheckpointId = TypeIdOf<"rpg_checkpoint">;
/** A quest's stable id — a PLAIN (prefix-less) branded nanoid, minted IN the snapshot blob (no table, no
 *  FK, no `ID_PREFIX` entry). The `no-raw-id` gate requires a brand even for the in-blob object id; a
 *  prefix-less brand is the type-safety-without-TypeID-machinery middle. Mint via `newId<RpgQuestId>()`. */
export type RpgQuestId = Branded<"RpgQuestId">;

// --- Workloads (in-server bulk-work lifecycle) -------------------------------
export type WorkloadId = TypeIdOf<"workload">;
/** A recurring-execution schedule row — the TIME dimension that auto-enqueues a `workload` on a cadence. */
export type WorkloadScheduleId = TypeIdOf<"workload_schedule">;

// --- Notifications (the per-user durable inbox) ------------------------
export type NotificationId = TypeIdOf<"notification">;

// --- Transport (ephemeral, never persisted) ----------------------------------
/** One browser tab's multiplexed SSE socket (SSE-1, `@orb/contracts/stream`). CLIENT-MINTED
 *  (`crypto.randomUUID()` per document) and NOT a capability — the server's registry cell is owned by the
 *  minting principal and a foreign id collapses to a leak-free NOT_FOUND. No table, no TypeID prefix: it is
 *  transport state with a document's lifetime (the `SessionToken` precedent — branded so it can never be
 *  confused with an entity id). */
export type SocketId = Branded<"SocketId">;

// --- Cross-cutting -----------------------------------------------------------
export type AuditLogId = TypeIdOf<"audit_log">;

/** Brand a raw string as a specific id type. The one sanctioned cast — use it at untyped seams, never
 *  to paper over a real type mismatch. Prefer {@link typeIdSchema} for TypeID ids at boundaries. */
export function castId<T extends string>(raw: string): T {
  return raw as T;
}

/** Zod schema for a non-TypeID branded id at a request boundary: validates non-empty, types output
 *  as the brand. For TypeID ids use {@link typeIdSchema} — it also validates the prefix. */
export function brandedId<T extends Branded<string>>(): z.ZodType<T> {
  // Brand is type-only; the runtime value is unchanged (no transform).
  return z.string().min(1) as unknown as z.ZodType<T>;
}

/** Mint a fresh `prefix_<base32 uuidv7>` TypeID, typed as the corresponding brand. The one id-mint
 *  primitive — the `no-mint-via-cast` gate forbids minting through {@link castId}. */
export function mintTypeId<P extends string>(prefix: P): TypeIdOf<P> {
  return typeidUnboxed(prefix) as string as TypeIdOf<P>;
}

/** Mint a fresh plain (non-TypeID) branded id — for brands that are deliberately prefix-less
 *  nanoids, not `prefix_…` TypeIDs (today: `UserId`). Mints via `typeid-js` with an empty prefix
 *  (avoids `globalThis.crypto`, which kit's no-DOM/no-node lib does not type). */
export function newId<T extends Branded<string>>(): T {
  return typeidUnboxed("") as string as T;
}

/** Zod schema for a STRICT TypeID at a request boundary: validates the `prefix_…` shape AND that
 *  the prefix matches — a `chat_…` where a `persona_…` is expected is rejected, not silently accepted. */
export function typeIdSchema<P extends string>(prefix: P): z.ZodType<TypeIdOf<P>> {
  return z.string().transform((value, ctx): TypeIdOf<P> => {
    try {
      // fromString validates shape AND prefix; throws on mismatch/malformed.
      return fromString(value, prefix) as string as TypeIdOf<P>;
    } catch (err) {
      ctx.addIssue({
        code: "custom",
        message: err instanceof Error ? err.message : `Invalid ${prefix} id`,
      });
      return z.NEVER;
    }
  });
}
