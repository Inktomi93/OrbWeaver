// schema/imagery — the hosted image-generation PROVENANCE index (producer: domain/imagery; D49 item 1).
// ONE row per generated image: the durable record of what each `kind:"generated"` asset IS (prompt, mode,
// model, cost, the card-identity it depicted). Born WHOLE even though the P5 chat
// caller populates only the free-mode fields — the Phase-7 orchestrator (extract/caption/reuse/edit) fills
// the rest with NO migration (the reserved columns are nullable / defaulted).
//
// TWO forces make this a real table, not asset metadata:
//   • GC safety — a generated asset's only OTHER pointer is a markdown ref inside message content (invisible
//     to the assets ref-registry); `asset_id` is a REAL FK the registry can carry, so mark-sweep never reaps
//     a live in-chat image. `ON DELETE CASCADE`: the provenance is subordinate to the asset, never reverse.
//   • Durable identity — the reuse gate (Phase 7) answers "does a suitable portrait already exist?" from
//     `(subject_character_id, mode, identity_hash)`; the CAS row knows only bytes-metadata.
//
// NO `ownerId` column — ownership DERIVES via `asset_id → assets.ownerId` (D20/D23; the image-embeddings
// precedent — "the vector row FKs the owned asset, no ownerId on the row"). `chat_id SET NULL`: the image
// (and its provenance) outlives a deleted chat — it's the user's, the chat was just where it was born.
//
// `mode` DERIVES the canonical `PROMPT_TEMPLATE_MODES` tuple from `@orb/contracts/imagery` (the ONE home;
// `no-inline-union-redecl`) on BOTH tiers — the column's `{ enum }` gives the row-type union and the
// tuple-built CHECK gates the SQL; the column never re-spells the union on either side.

import type { TokenProvenance } from "@orb/contracts/chat";
import { TOKEN_PROVENANCES } from "@orb/contracts/chat";
import type { ImageryImportSource } from "@orb/contracts/imagery";
import { PROMPT_TEMPLATE_MODES } from "@orb/contracts/imagery";
import type { CostDetails, ProviderId, ResponseCache, TokenDetails } from "@orb/contracts/inference";
import type { AssetId, CharacterId, ChatId, ImageryCallId, ImageryGenerationId, ModelId, UserConnectionId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { checkList } from "../kit/check-list.ts";
import { assets } from "./assets.ts";
import { characters } from "./character.ts";
import { chats } from "./chat.ts";
import { userConnections } from "./connection.ts";
import { users } from "./users.ts";

// CHECK list derived from the canonical tuple (NOT re-spelled) — a static DDL fragment (no bound params).
const MODE_CHECK_LIST = checkList(PROMPT_TEMPLATE_MODES);

export const imageryGenerations = sqliteTable(
  "imagery_generations",
  {
    // TypeID PK (`imagery_generation_…`); brand is type-only, SQL is plain TEXT. App-minted, no DB default.
    id: text("id").$type<ImageryGenerationId>().primaryKey(),
    // The generated image this row describes. Subordinate: deleting the asset erases its provenance.
    assetId: text("asset_id")
      .$type<AssetId>()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    // Provenance context — the chat it was born in; nullable + SET NULL so the image outlives the chat.
    chatId: text("chat_id")
      .$type<ChatId>()
      .references(() => chats.id, { onDelete: "set null" }),
    // The template mode this generation used ("free" for the P5 chat caller). CHECK-gated to the tuple;
    // `{ enum }` derives the row-type union (`$inferSelect.mode` is `PromptTemplateMode`, not bare string).
    mode: text("mode", { enum: PROMPT_TEMPLATE_MODES }).notNull(),
    // The card this portrait depicts (portrait modes; null for scene/background/free). SET NULL on delete.
    subjectCharacterId: text("subject_character_id")
      .$type<CharacterId>()
      .references(() => characters.id, { onDelete: "set null" }),
    // sha-256 of `${mode}:${characterId}:${card.contentHash}` — the reuse key. Null ⇒ never reuse-matched
    // (scene/background/free/edit). Reserved for the Phase-7 reuse gate.
    identityHash: text("identity_hash"),
    // The resolved prompt the image was generated from (regenerate reads this; the gallery shows it).
    prompt: text("prompt").notNull(),
    // The negative prompt applied (reserved — the Phase-7 negative composition). Nullable.
    negativePrompt: text("negative_prompt"),
    // The image model that produced it (the gallery's provenance detail).
    model: text("model").$type<ModelId>().notNull(),
    // The provider registry id + the connection that generated it — the same attribution pair as a chat swipe
    // (inference program §5.3b/§5.3c); SET NULL so provenance outlives the connection row.
    provider: text("provider").$type<ProviderId>(),
    connectionId: text("connection_id")
      .$type<UserConnectionId>()
      .references(() => userConnections.id, { onDelete: "set null" }),
    // The summed generation cost (extraction + caption + generate). Nullable when any component is unknown.
    costUsd: real("cost_usd"),
    servedModel: text("served_model"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    reasoningTokens: integer("reasoning_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    costProvenance: text("cost_provenance", { enum: TOKEN_PROVENANCES }).$type<TokenProvenance>(),
    costDetails: text("cost_details", { mode: "json" }).$type<CostDetails>(),
    // Reported modality subsets may be incomplete; this sidecar never defines the scalar totals.
    tokenDetails: text("token_details", { mode: "json" }).$type<TokenDetails>(),
    responseCache: text("response_cache", { mode: "json" }).$type<ResponseCache>(),
    // An edit/reference input was used (reserved — the Phase-7 edit seam). Default false.
    edited: integer("edited", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    // The provider call this picture came from, shared by every picture of one fanned-out call: the stats
    // rebuild counts one priced generation per call id. NULL only on rows written before the column existed.
    callId: text("call_id").$type<ImageryCallId>(),
    // Restore identity is per output, not per asset bytes or retained output cohort. Source ids confer
    // no authority; the owning import verb admits the entire asset group in the same batch.
    importHash: text("import_hash"),
    importSource: text("import_source", { mode: "json" }).$type<ImageryImportSource>(),
  },
  (t) => [
    // The Phase-7 reuse lookup key (subject + mode + identity); harmless as a plain index in v1.
    index("imagery_generations_reuse_idx").on(t.subjectCharacterId, t.mode, t.identityHash),
    // The SET-NULL parent scan on a connection delete (`fk-columns-indexed` gate).
    index("imagery_generations_connection_idx").on(t.connectionId),
    // The two remaining child FKs: an asset delete erases its provenance row and a chat delete nulls the
    // room's `chat_id` — both scan this table without a LEADING index (`fk-columns-indexed` gate).
    index("imagery_generations_asset_idx").on(t.assetId),
    index("imagery_generations_chat_idx").on(t.chatId),
    uniqueIndex("imagery_generations_import_unique").on(t.assetId, t.importHash).where(sql`${t.importHash} is not null`),
    check("imagery_generations_mode_check", sql.raw(`mode in (${MODE_CHECK_LIST})`)),
  ],
);

// D23 parentless per-user import identity aggregate, not a reservation or a fee ledger. It commits
// with admitted generation rows. A retained subset shares this identity with later missing outputs;
// native calls have no row here and their call_id deliberately has no FK to this import-only table.
export const imageryImportCalls = sqliteTable(
  "imagery_import_calls",
  {
    id: text("id").$type<ImageryCallId>().primaryKey(),
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    identity: text("identity").notNull(),
  },
  (t) => [uniqueIndex("imagery_import_calls_owner_identity_unique").on(t.ownerId, t.identity)],
);
