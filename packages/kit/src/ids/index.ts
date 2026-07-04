/**
 * Branded entity IDs — nominal types over `string`.
 *
 * Without brands, nothing stops passing a `characterId` where a `chatId` is
 * expected. The compile-time brand is a phantom `unique symbol` (erased at
 * runtime, zero cost); TypeID brands additionally carry a real `prefix_…` value
 * validated at the boundary by {@link typeIdSchema}.
 *
 * Lives in `@orb/kit` (the universal leaf — `contracts`, `db`, every domain,
 * `transport`, and `client` all import down into it). Brand attachment is the
 * FLOW's job — {@link castId} at untyped seams, {@link typeIdSchema} at request
 * boundaries.
 *
 * Mint a TypeID id: {@link mintTypeId}`(ID_PREFIX.chat)`. Cross an untyped
 * boundary: {@link castId}`<CharacterId>(raw)`. At the tRPC boundary:
 * {@link typeIdSchema}`(ID_PREFIX.persona)` (prefix-validating) or
 * {@link brandedId}`<UserId>()` (non-empty, for non-TypeID brands).
 */

import { fromString, typeidUnboxed } from "typeid-js";
import { z } from "zod";

declare const brand: unique symbol;

/** A `string` tagged with a phantom `B` marker (erased at runtime). */
export type Branded<B extends string> = string & { readonly [brand]: B };

// --- TypeID-branded ids (strict, prefix-validated) ---------------------------
// The COMPILE-TIME brand reuses this file's `Branded<…>` (`unique symbol` phantom),
// NOT typeid-js's own object brand — an object-shaped brand trips biome's
// `noBaseToString` on `${id}` template interpolation; the `unique symbol` brand
// does not. The runtime win (prefix validation via `fromString`) is independent
// of the brand shape.
export type TypeIdOf<P extends string> = Branded<P>;

/**
 * The TypeID prefix for each entity (orbweaver schema, ledger D0–D31).
 * TypeID prefixes must be lowercase `[a-z_]` — multi-word entities use snake_case,
 * NOT the camelCase key (`ID_PREFIX.worldBook` → the literal `"world_book"`); a
 * camelCase prefix throws `InvalidPrefixError` at mint time.
 */
export const ID_PREFIX = {
  persona: "persona",
  chat: "chat",
  message: "message",
  character: "character",
  // D28: the card is the flat `characters` row; history is `character_snapshots`
  // (no `character_version` brand — the table is gone).
  characterSnapshot: "character_snapshot",
  tag: "tag",
  worldBook: "world_book",
  worldEntry: "world_entry",
  preset: "preset",
  asset: "asset",
  messageVariant: "message_variant",
  chatEvent: "chat_event",
  chatStreamEvent: "chat_stream_event",
  sessionEntry: "session_entry",
  chatInjection: "chat_injection",
  chatParticipant: "chat_participant",
  // D16: the unified roster system — invites + host-offline deferred turns.
  chatInvite: "chat_invite",
  pendingTurn: "pending_turn",
  characterEmbedding: "character_embedding",
  chatDigest: "chat_digest",
  chatSegment: "chat_segment",
  // Discovery rollups — prefixes mirror their Tier-1-DB.md table names (theme_clusters,
  // character_keyword_profiles, keyword_cooccurrence).
  themeCluster: "theme_cluster",
  // D24: the polymorphic `duplicate_pair` becomes per-type FK tables.
  duplicateCharacterPair: "duplicate_character_pair",
  duplicateChatPair: "duplicate_chat_pair",
  characterKeywordProfile: "character_keyword_profile",
  keywordCooccurrence: "keyword_cooccurrence",
  workload: "workload",
  auditLog: "audit_log",
  session: "session",
  userCredential: "user_credential",
  imageEmbedding: "image_embedding",
  characterStat: "character_stat",
  ownerStat: "owner_stat",
  dailyStat: "daily_stat",
  modelStat: "model_stat",
  buddyTurn: "buddy_turn",
  buddyQuip: "buddy_quip",
  // D16: the per-user durable notification inbox.
  notification: "notification",
  // D49: hosted image-generation provenance (imagery leaf, item 1) + curated gallery items (gallery v2, item 2).
  imageryGeneration: "imagery_generation",
  galleryItem: "gallery_item",
  // D59: chat-crew review artifacts — the prose-audit edit proposal (crew-owned) + the card-evolution
  // proposal (character-owned; the crew only FILES it — chat-crew-design/02 §4–5).
  crewEditProposal: "crewprop",
  cardEvolutionProposal: "cardprop",
  // D46: automation rules + the fire log. `global_variables` deliberately has NO TypeID — nothing FKs
  // it; the natural key (ownerId, key) IS the identity (automation-design/02 §4).
  automationRule: "automation_rule",
  automationFire: "automation_fire",
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
export type WorldBookId = TypeIdOf<"world_book">;
export type WorldEntryId = TypeIdOf<"world_entry">;
export type TagId = TypeIdOf<"tag">;
export type AssetId = TypeIdOf<"asset">;
export type ImageryGenerationId = TypeIdOf<"imagery_generation">;
export type GalleryItemId = TypeIdOf<"gallery_item">;

// --- Chat / conversation -----------------------------------------------------
export type ChatId = TypeIdOf<"chat">;
export type MessageId = TypeIdOf<"message">;
export type MessageVariantId = TypeIdOf<"message_variant">;
export type ChatEventId = TypeIdOf<"chat_event">;
export type ChatStreamEventId = TypeIdOf<"chat_stream_event">;
export type SessionEntryId = TypeIdOf<"session_entry">;
export type ChatInjectionId = TypeIdOf<"chat_injection">;
export type ChatParticipantId = TypeIdOf<"chat_participant">;
export type ChatInviteId = TypeIdOf<"chat_invite">;
export type PendingTurnId = TypeIdOf<"pending_turn">;

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
export type OwnerStatId = TypeIdOf<"owner_stat">;
export type DailyStatId = TypeIdOf<"daily_stat">;
export type ModelStatId = TypeIdOf<"model_stat">;

// --- Buddy (proactive companion turns + quips) -------------------------------
export type BuddyTurnId = TypeIdOf<"buddy_turn">;
export type BuddyQuipId = TypeIdOf<"buddy_quip">;

// --- Chat crew (D59 — review artifacts) ---------------------------------------
export type CrewEditProposalId = TypeIdOf<"crewprop">;
export type CardEvolutionProposalId = TypeIdOf<"cardprop">;

// --- Automation (D46 — rules + the fire log) ----------------------------------
export type AutomationRuleId = TypeIdOf<"automation_rule">;
export type AutomationFireId = TypeIdOf<"automation_fire">;

// --- Workloads (in-server bulk-work lifecycle) -------------------------------
export type WorkloadId = TypeIdOf<"workload">;

// --- Notifications (D16 — the per-user durable inbox) ------------------------
export type NotificationId = TypeIdOf<"notification">;

// --- Cross-cutting -----------------------------------------------------------
export type AuditLogId = TypeIdOf<"audit_log">;

/**
 * Brand a raw string as a specific id type. The ONE sanctioned cast — use it at
 * untyped seams (raw HTTP params, polymorphic `entityId`s, test fixtures), never
 * to paper over a real type mismatch. Works for both phantom and TypeID brands.
 * Prefer {@link typeIdSchema} (validating) over a bare cast for TypeID ids at
 * boundaries.
 */
export function castId<T extends string>(raw: string): T {
  return raw as T;
}

/**
 * Zod schema for a non-TypeID branded id at a request boundary: validates
 * non-empty, types output as the brand.
 * Usage: `z.object({ userId: brandedId<UserId>() })`.
 * For TypeID ids use {@link typeIdSchema} — it also validates the prefix.
 */
export function brandedId<T extends Branded<string>>(): z.ZodType<T> {
  // Brand is type-only; the runtime value is unchanged (no transform).
  return z.string().min(1) as unknown as z.ZodType<T>;
}

/**
 * Mint a fresh `prefix_<base32 uuidv7>` TypeID, typed as the corresponding brand.
 * The ONE id-mint primitive (the `no-mint-via-cast` gate forbids minting through
 * {@link castId}).
 */
export function mintTypeId<P extends string>(prefix: P): TypeIdOf<P> {
  // typeidUnboxed returns the library's object-brand; re-brand to this file's
  // `Branded<P>` — the runtime value (a `prefix_…` string) is identical.
  return typeidUnboxed(prefix) as string as TypeIdOf<P>;
}

/**
 * Mint a fresh PLAIN (non-TypeID) branded id — for the brands that are deliberately
 * prefix-less nanoids, not `prefix_…` TypeIDs (today: `UserId`, Tier-1-DB.md §4). The
 * companion to {@link mintTypeId}: both gates (`no-mint-via-cast`, `no-raw-id`) name
 * `newId<T>()` as THE plain-id minter so a row id never has to be laundered through
 * {@link castId}. Mints via `typeid-js` with an EMPTY prefix → a 26-char base32
 * (UUIDv7-backed, time-sortable) opaque id with no `prefix_` — isomorphic, and avoids
 * `globalThis.crypto` (kit's no-DOM/no-node lib does not type it). Mirrors
 * {@link mintTypeId}'s sanctioned `as string as T` cast (the minter is the one home).
 */
export function newId<T extends Branded<string>>(): T {
  return typeidUnboxed("") as string as T;
}

/**
 * Zod schema for a STRICT TypeID at a request boundary: validates the `prefix_…`
 * shape AND that the prefix matches, then types output as the brand. Runtime win
 * over {@link brandedId}: a `chat_…` where a `persona_…` is expected is REJECTED
 * (`fromString` throws on prefix mismatch), not silently accepted.
 * Usage: `z.object({ personaId: typeIdSchema(ID_PREFIX.persona) })`.
 */
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
