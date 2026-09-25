/**
 * Branded entity IDs — nominal types over `string`. Without brands, nothing stops passing a
 * `characterId` where a `chatId` is expected. Mint a TypeID: {@link mintTypeId}`(ID_PREFIX.chat)`.
 * Cross an untyped boundary: {@link castId}`<CharacterId>(raw)`. At the tRPC boundary:
 * {@link typeIdSchema}`(ID_PREFIX.persona)` (prefix-validating) or {@link brandedId}`<UserId>()`.
 */

import { fromString, typeidUnboxed } from "typeid-js";
import { z } from "zod";

declare const brand: unique symbol;
/** The SECOND phantom key, carried only by {@link VerifiedUserId} — see its doc for why it cannot reuse
 *  `brand` (two disjoint literals on one key reduce the intersection to `never`). */
declare const sessionVerified: unique symbol;

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
  // B6/MR0 — one reactor's one emoji on one variant (`message_reactions`). Keyed to the VARIANT, not the
  // slot: a segment index is only meaningful against one swipe's rendered content (MA-2 §2, Open-Q A ruled
  // variant-level), and a fresh swipe legitimately starts with an empty reaction set.
  messageReaction: "message_reaction",
  chatEvent: "chat_event",
  chatStreamEvent: "chat_stream_event",
  chatStreamGeneration: "chat_stream_generation",
  sessionEntry: "session_entry",
  chatInjection: "chat_injection",
  chatParticipant: "chat_participant",
  chatInvite: "chat_invite",
  pendingTurn: "pending_turn",
  // EPHEMERAL — the per-turn identity minted once at `executeTurn` (never persisted, no table). Threads the
  // tool-exec frame ↔ the turn-end hooks so a turn-scoped consumer (rpg's staging accumulator) correlates
  // mid-turn tool writes to its commit/abort flush under lock-free concurrency.
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
  // A user's CONNECTION row (`user_connections`): provider + credential + model + declared overrides — the
  // unit every per-task binding references by id (@orb/contracts/inference §5.3). `provider_rows` has NO
  // TypeID: the registry id (`openrouter`, `plugin:<name>/<id>`) IS its natural key.
  userConnection: "user_connection",
  // One actor's (user / automation rule / plugin grant) pick of a connection for ONE routable task
  // (`connection_bindings`) — an FK junction row, never a JSON id-array (D61-B6).
  connectionBinding: "connection_binding",
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
  // EPHEMERAL — the S4 suggest/confirm pending ask (RULED F1: an in-RAM
  // map with a TTL, never a table; a respawn wipes them by design). It needs an id because it crosses the
  // wire twice — out on the automation bus, back in on `confirmSuggestion` — and a claim is an ID MATCH.
  automationSuggestion: "automation_suggestion",
  document: "document",
  documentChunk: "document_chunk",
  // The installed-plugin registry row (D46). `plugin_kv` has NO TypeID — its identity is the composite
  // PK (pluginId, key).
  plugin: "plugin",
  // A saved party template (`roster_presets`, D61 B6) — the owner's named cast dropped into rooms via
  // `applyToChat`. Members ride the `(presetId, characterId)` junction PK, so no member TypeID exists.
  rosterPreset: "roster_preset",
  // Card-refinery pipeline rows (refinery R0).
  refinerySession: "refinery_session",
  refineryRun: "refinery_run",
  // A user-authored custom payload schema (refinery R3 / SF0).
  refinerySchema: "refinery_schema",
  // RPG lite substrate. Quest ids are PLAIN strings minted inside the snapshot
  // blob (no table, no FK — a TypeID brand buys nothing there; the objective-id precedent), so no
  // `rpgQuest` prefix. Full ADDS its own prefixes (npc/clock/map/session/encounter/scene/pendingCheck).
  rpgGame: "rpg_game",
  rpgSnapshot: "rpg_snapshot",
  rpgSheet: "rpg_sheet",
  rpgJournal: "rpg_journal",
  rpgCheckpoint: "rpg_checkpoint",
  rpgTurnToolCalls: "rpg_turn_tool_calls",
} as const;

// --- Identity / auth ---------------------------------------------------------
export type UserId = Branded<"UserId">;
/**
 * A `UserId` THE SESSION VERIFIED — the viewer id as it came back from `sessions.me`, never one derived
 * from anything the browser can write (#854, follow-up to #837).
 *
 * Why a second brand rather than a comment: `packages/client/src/state/durable-local.ts` decides whether a
 * durable-local namespace stays live by comparing an incoming id against a BROWSER-WRITABLE boot hint
 * (`orb:active-user`). That module's whole security property — a forged hint can choose which namespace to
 * MINT on but can never keep another identity's namespace live — rests on `bindDurableLocalToUser` being
 * handed the session-verified id, and the module cannot tell the difference by looking. Branding the
 * parameter makes a bare `UserId` a TYPE ERROR at that boundary, so a future caller that reaches for a
 * client-derived id has to write the cast out loud instead of silently laundering it through.
 *
 * THE SUBTYPING IS THE POINT: `VerifiedUserId` is assignable to `UserId` (it IS one — it flows into every
 * `UserId`-typed read unchanged), and `UserId` is NOT assignable to `VerifiedUserId` (it lacks the second
 * phantom). Pinned both directions in `tests/kit/ids/index.test-d.ts`.
 *
 * IT CARRIES ITS OWN PHANTOM KEY, NOT A SECOND `Branded` alias. Measured 2026-08-30: intersecting a second
 * `Branded` reuses the ONE `brand` key, so tsc sees a discriminant property with two disjoint literal types
 * and reduces the whole intersection to `never` — which type-checks (never is assignable everywhere) while
 * making a `VerifiedUserId | null` slot collapse to `null` and every value of the type a lie. A distinct
 * key is what makes this an actual sub-brand instead of a silently empty one.
 *
 * ONE MINT, and it is a `castId` at the session-recovery seam (`packages/client/src/data/use-session-recovery.ts`,
 * off the `sessions.me` result). There is no second sanctioned site; `readBootHint()` and every other
 * browser-storage read stay plain `UserId` on purpose.
 */
export type VerifiedUserId = UserId & { readonly [sessionVerified]: true };
/** The BFF session ROW id (NOT the opaque cookie token — that's `SessionToken`). */
export type SessionId = TypeIdOf<"session">;
export type UserCredentialId = TypeIdOf<"user_credential">;
/** A user's connection row (`user_connections`) — the unit a `ConnectionRef` names and a binding points at. */
export type UserConnectionId = TypeIdOf<"user_connection">;
/** One actor→connection pick for one routable task (`connection_bindings`). */
export type ConnectionBindingId = TypeIdOf<"connection_binding">;

// Identity VALUES — not entity ids, but auth-layer strings that are mixing-prone.
// `Handle` = user-facing username; `ExternalId` = stable SSO `sub` (NEVER equal to
// Handle); `SessionToken` = opaque cookie value (NEVER a session row id).
export type Handle = Branded<"Handle">;
/** The comparison key of a `Handle` (`@orb/kit/handle-key`): two handles with one key are one handle. Never
 *  displayed; only `handleKey` mints it. */
export type HandleKey = Branded<"HandleKey">;
export type ExternalId = Branded<"ExternalId">;
export type SessionToken = Branded<"SessionToken">;

// --- Model / provider --------------------------------------------------------
// Both Claude model ids and OpenRouter routes; branded so a plain string can't
// flow where a vetted model id is expected.
export type ModelId = Branded<"ModelId">;

// --- Library entities --------------------------------------------------------
export type CharacterId = TypeIdOf<"character">;
/** A character CARD's identity slug (`characters.handle` — per-owner unique, import/export-portable,
 *  the `__group__<chatId>` synthetic namespace). NOT the user-facing username: that is `Handle`, a
 *  different identity space that merely shares the field spelling — the two must never interchange
 *  (a username landing in a card-slug lookup is the wrong-id class this brand exists to catch). */
export type CharacterHandle = Branded<"CharacterHandle">;
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
/** A saved party template (`roster_presets`, D61 B6) — library data, distinct from the generation
 *  `PresetId` one line up in spirit: this names a CAST, never params. */
export type RosterPresetId = TypeIdOf<"roster_preset">;

// --- Chat / conversation -----------------------------------------------------
export type ChatId = TypeIdOf<"chat">;
export type MessageId = TypeIdOf<"message">;
export type MessageVariantId = TypeIdOf<"message_variant">;
/** #67 — the structural chat-message ↔ asset link row (`message_assets`; inline-attachment GC retention). */
export type MessageAssetId = TypeIdOf<"message_asset">;
/** B6/MR0 — ONE reactor's ONE emoji on ONE variant (`message_reactions`). The Discord-style grouped chip a
 *  reader sees is a READ PROJECTION over these rows (`MessageReactionGroup`), never a stored array: two
 *  members toggling the same emoji concurrently would lose-update a JSON blob, while a junction toggle is one
 *  INSERT or one DELETE under a UNIQUE (MA-2 §4). */
export type MessageReactionId = TypeIdOf<"message_reaction">;
export type ChatEventId = TypeIdOf<"chat_event">;
export type ChatStreamEventId = TypeIdOf<"chat_stream_event">;
/** One committed provider generation in the resumable token log. A swipe or continue can reuse its
 * message slot, so the slot id cannot identify the hidden-span scrubber lifetime. */
export type ChatStreamGenerationId = TypeIdOf<"chat_stream_generation">;
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
/** Deterministic SHA-256 identity for an owner/task/connection embedding generation; never TypeID-minted. */
export type EmbedGenerationId = Branded<"EmbedGenerationId">;
// Precompute rollup tables (discovery outputs).
export type DuplicateCharacterPairId = TypeIdOf<"duplicate_character_pair">;
export type DuplicateChatPairId = TypeIdOf<"duplicate_chat_pair">;
export type CharacterKeywordProfileId = TypeIdOf<"character_keyword_profile">;
export type KeywordCooccurrenceId = TypeIdOf<"keyword_cooccurrence">;
export type ThemeClusterId = TypeIdOf<"theme_cluster">;

// --- Stats (precompute rollup rows) ------------------------------------------
export type CharacterStatId = TypeIdOf<"character_stat">;
export type DailyStatId = TypeIdOf<"daily_stat">;
export type ModelStatId = TypeIdOf<"model_stat">;

// --- Automation (rules + the fire log) ----------------------------------
export type AutomationRuleId = TypeIdOf<"automation_rule">;
export type AutomationFireId = TypeIdOf<"automation_fire">;
/** An S4 pending suggestion (confirm-first card / rate-refusal invitation). NO table — the store is the
 *  in-RAM per-process map RULED F1; the brand exists because the id is the CLAIM handle on the wire. */
export type AutomationSuggestionId = TypeIdOf<"automation_suggestion">;

// --- Databank (source documents + vector chunks) --------------------
export type DocumentId = TypeIdOf<"document">;
export type DocumentChunkId = TypeIdOf<"document_chunk">;

// --- Plugins (D46 code sandbox) ----------------------------------------------
export type PluginId = TypeIdOf<"plugin">;

// --- Refinery (card-refinery pipeline sessions + append-only run log) ---------
export type RefinerySessionId = TypeIdOf<"refinery_session">;
export type RefineryRunId = TypeIdOf<"refinery_run">;
export type RefinerySchemaId = TypeIdOf<"refinery_schema">;

// --- RPG (lite substrate — the 5-table floor) ------------
export type RpgGameId = TypeIdOf<"rpg_game">;
export type RpgSnapshotId = TypeIdOf<"rpg_snapshot">;
export type RpgSheetId = TypeIdOf<"rpg_sheet">;
export type RpgJournalId = TypeIdOf<"rpg_journal">;
export type RpgCheckpointId = TypeIdOf<"rpg_checkpoint">;
/** ONE folded turn's recorded tool calls (`rpg_turn_tool_calls`) — one row per producing variant, so a swipe
 *  surfaces that swipe's own calls (the `rpg_snapshots` variant-keying, one plane over). */
export type RpgTurnToolCallsId = TypeIdOf<"rpg_turn_tool_calls">;
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
export function brandedId<T extends Branded<string>>(): z.ZodType<T, string> {
  // `z.custom<T>()` supplies only the phantom output face after the string schema has done the real
  // validation. `pipe` preserves the validated string input and the runtime value byte-for-byte.
  return z.string().min(1).pipe(z.custom<T>());
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
 *  the prefix matches — a `chat_…` where a `persona_…` is expected is rejected, not silently accepted.
 *
 *  The explicit `string` Input generic is load-bearing: `z.ZodType`'s Input parameter defaults to
 *  `unknown` (zod 4.4.3, verified against the installed `v4/classic/schemas.d.ts:6`), so omitting it
 *  made `z.input<>` of every schema built from this `unknown` — and `unknown` as a property type accepts
 *  ANY value on assignment: not merely a wrong-prefixed string but a number, an object, anything. Pinning
 *  Input=`string` closes that. Not a behavior change; the schema always accepted a bare string pre-transform.
 *
 *  WHAT THIS DOES NOT DO, stated because the row that prompted it (#641) claimed otherwise and a reader
 *  would otherwise trust the wrong wall: it does NOT restore BRAND enforcement at the input seam, and no
 *  Input generic could. `z.input<>` of a validating `.transform()` is by definition the PRE-parse shape —
 *  the raw string a caller hands in BEFORE branding happens — so it never carried the brand in any zod
 *  version. The brand lives on Output (`z.infer<>`), which was always correctly typed here and was never
 *  the defect. A wrong-branded-but-right-SHAPED value is therefore structurally uncatchable through this
 *  schema; catching that class needs a typed resolution axis instead — the `entityRef` knob kind
 *  (`contracts/automation/presets.ts` + the real `.safeParse` at `domain/automation/substrate/presets.ts`)
 *  is the worked example, and is what actually fixed the case #641 mis-cited as this seam's evidence. */
export function typeIdSchema<P extends string>(prefix: P): z.ZodType<TypeIdOf<P>, string> {
  return z.string().transform((value, ctx): TypeIdOf<P> => {
    // @orb-waive caught-failure-ownership(catch): zod transform pattern — fromString's throw is
    // caught and converted to ctx.addIssue + z.NEVER, zod's own consumption channel for a failed transform.
    // Ends if the transform stops routing the caught failure through ctx.addIssue.
    try {
      // fromString validates shape AND prefix; throws on mismatch/malformed.
      return fromString(value, prefix) as string as TypeIdOf<P>;
    } catch {
      // A fixed message, never typeid-js's own: those echo the rejected value (a prefix mismatch up to the
      // last `_`, an empty prefix in full), and a failed tRPC output parse logs this issue, so a secret a
      // producer mis-mapped into an id field would reach the server log.
      ctx.addIssue({ code: "custom", message: `Invalid ${prefix} id` });
      return z.NEVER;
    }
  });
}
