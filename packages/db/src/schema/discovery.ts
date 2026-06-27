// schema/discovery — the library-semantics rollups (producer: domain/discovery; the corpus→discovery
// rename). Discovery EMBEDS NOTHING and writes no vector row — it reads the embeddings store read-only,
// computes its signals in-RAM, and writes ONLY these OWN rollup tables (+ the `hub_score` column on the
// embeddings rows via the injected `embeddings.writeHubScores` seam, which is NOT here). Authoritative
// spec: `docs/architecture/domains/discovery.md` + `knowledge-cluster.md` §7 + `tiers/db.md` + the ledger
// (D23/D24). Seven tables: duplicate_character_pairs · duplicate_chat_pairs · keyword_cooccurrence ·
// character_keyword_profiles · character_summaries · theme_clusters · digest_theme_assignments.
//
// THE LOAD-BEARING DECISIONS encoded here:
//   • D24 — NO polymorphic tables: neo's one `duplicate_pairs` (an `entity_type` discriminator + untyped
//     `entity_id_a/b`, NO FK, a hand-rolled orphan-GC sweep) becomes per-type FK tables —
//     `duplicate_character_pairs` (FK `characters` ×2) + `duplicate_chat_pairs` (FK `chats` ×2), both
//     CASCADE. A deleted entity removes its pairs BY PHYSICS (no reaper). A 3rd dedup'd kind would be a
//     NEW `duplicate_<kind>_pairs` table, never an enum arm. The unordered pair is canonicalized A<B (the
//     unique index + a CHECK a<b — which also forbids a self-pair).
//   • D23 — the ownership-stamp rule (reach the owner via ONE FK to an owned entity? yes ⇒ DERIVE / no
//     `ownerId` column; no ⇒ KEEP `ownerId`):
//       KEEP ownerId  → keyword_cooccurrence (owner × keyword-pair — a parentless per-user aggregate),
//                       theme_clusters (owner × cluster — a parentless per-user aggregate).
//       DERIVE / none → duplicate_character_pairs (via characters.ownerId), duplicate_chat_pairs (via
//                       chat → host), character_keyword_profiles (via characters.ownerId),
//                       character_summaries (via characters.ownerId), digest_theme_assignments (via
//                       digest → chat → host).
//   • The `relation` axis (`duplicate | forked`) lives ONLY on `duplicate_chat_pairs` — chats have fork
//     lineage (`parentChatId`, D27), so a chat pair can be a known fork family; characters do NOT (they use
//     snapshots, D28), so a character pair is always an accidental `duplicate` and carries NO `relation`
//     column. It is a single union, NOT a polymorphic discriminator. Its canonical home would be
//     `@orb/contracts/discovery`, but that namespace is currently EMPTY (only a `.gitkeep`) — so the tuple
//     is declared LOCALLY here (`[...] as const`) and a `.int` test-mirror pins the column enum to it. When
//     contracts/discovery is populated, derive `relation` from there, mirroring `image_embeddings.lens`.
//   • `theme_clusters.centroid` is a `vector32` F32_BLOB — but a k-means MEAN rollup, NOT a primary
//     vector store (those four live in `schema/embeddings.ts`). It lives here because it is discovery's
//     own derived signal. `level` (`scene | arc`, the ThemeLevel union) is the clustering level; its
//     canonical home is `domain/discovery/contract/params.ts` (a server-tier domain concern that db may
//     NOT import), so the column is plain TEXT — the domain validates it, the db does not constrain it.
//
// Timestamps / provenance are plain `integer("x_at")` epoch-MS NUMBERS (NOT Date). `computedAt` is the
// provenance stamp on each recompute, born via `(unixepoch() * 1000)`. Floats (`cslsScore`/`similarity`)
// are `real(...)`. `*Id` columns carry the type-only TypeID brand (`$type<XId>()`); the SQL is plain TEXT.

import type {
  CharacterId,
  CharacterKeywordProfileId,
  ChatDigestId,
  ChatId,
  DuplicateCharacterPairId,
  DuplicateChatPairId,
  KeywordCooccurrenceId,
  ThemeClusterId,
  UserId,
} from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  // biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use primaryKey({ columns }).
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { vector32 } from "../custom-types";
import { characters } from "./character";
import { chats } from "./chat";
import { chatDigests } from "./embeddings";
import { users } from "./users";

// The dedup `relation` axis — a near-duplicate look-alike (`duplicate`) vs a shared-fork-root family
// member (`forked`, via the path-compressed lineage walk). Declared LOCALLY: `@orb/contracts/discovery`
// is empty today (see header). A CHECK list is built from the same tuple (never a re-spelled union); a
// `.int` test-mirror pins `relation.enumValues` to it.
const RELATIONS = ["duplicate", "forked"] as const;
const RELATION_CHECK_LIST = RELATIONS.map((relation) => `'${relation}'`).join(", ");

// The one 1024-dim space (Qwen3-VL — knowledge-cluster.md §1). A theme centroid is a MEAN of digest
// embeddings in that space, so it matches the embeddings dim exactly.
const CENTROID_DIM = 1024;

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// duplicate_character_pairs — near-duplicate cards (all-pairs cosine ≥ threshold, CSLS-ranked). Per-type
// FK (D24): characterIdA + characterIdB both FK `characters.id`, CASCADE. DERIVE ownerId (D23 — owner
// reachable via either character's `ownerId`). Canonical A<B (the unique index + the CHECK).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const duplicateCharacterPairs = sqliteTable(
  "duplicate_character_pairs",
  {
    // TypeID PK (`duplicate_character_pair_…`); brand is type-only, SQL is plain TEXT. App-minted.
    id: text("id").$type<DuplicateCharacterPairId>().primaryKey(),
    // The two sides of the pair — both real FKs (D24), both CASCADE (a deleted character removes every
    // pair it is in, BY PHYSICS — no delete-time sweep). Canonical A<B (the CHECK below).
    characterIdA: text("character_id_a")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    characterIdB: text("character_id_b")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    // The CSLS hub-adjusted similarity (the rank key) + the raw cosine — both floats (`real`).
    cslsScore: real("csls_score").notNull(),
    similarity: real("similarity").notNull(),
    // NO `relation` column — characters have no fork lineage (forks are a CHAT concept, D27; characters use
    // snapshots, D28). A character pair is ALWAYS an accidental look-alike, so a `duplicate|forked` label
    // would be a dead constant. `relation` lives ONLY on `duplicate_chat_pairs`. (Vestige of neo's single
    // polymorphic `duplicate_pairs`, dissolved by D24 into these per-type tables.)
    // The embedding-space tag the pair was computed in (a pair is only meaningful within one space).
    model: text("model").notNull(),
    // Provenance: the epoch-MS stamp of the recompute that wrote this row.
    computedAt: integer("computed_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The unordered pair is unique once canonicalized A<B (the recompute writes the smaller id as A).
    uniqueIndex("duplicate_character_pairs_pair_unique").on(t.characterIdA, t.characterIdB),
    // Browse "what are <X>'s near-duplicates" from either side.
    index("duplicate_character_pairs_a_idx").on(t.characterIdA),
    index("duplicate_character_pairs_b_idx").on(t.characterIdB),
    // Canonical ordering A<B (lexicographic on TEXT) — also forbids a self-pair (a == b).
    check("duplicate_character_pairs_canonical_check", sql`character_id_a < character_id_b`),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// duplicate_chat_pairs — near-duplicate chats (Jaccard of segment content-hashes, NOT centroid cosine —
// a per-chat centroid is dominated by the character's persistent voice). Per-type FK (D24): chatIdA +
// chatIdB both FK `chats.id`, CASCADE. DERIVE ownerId (D23 — owner reachable via chat → host). `forked`
// labels a shared-fork-root family vs an independent `duplicate` look-alike. Canonical A<B.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const duplicateChatPairs = sqliteTable(
  "duplicate_chat_pairs",
  {
    // TypeID PK (`duplicate_chat_pair_…`); brand is type-only, SQL is plain TEXT.
    id: text("id").$type<DuplicateChatPairId>().primaryKey(),
    // The two sides — both real FKs (D24), both CASCADE.
    chatIdA: text("chat_id_a")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    chatIdB: text("chat_id_b")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // The CSLS-adjusted score + the raw similarity (Jaccard for chats) — floats.
    cslsScore: real("csls_score").notNull(),
    similarity: real("similarity").notNull(),
    // `duplicate | forked` — derives RELATIONS (+ the CHECK below).
    relation: text("relation", { enum: RELATIONS }).notNull(),
    model: text("model").notNull(),
    computedAt: integer("computed_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    uniqueIndex("duplicate_chat_pairs_pair_unique").on(t.chatIdA, t.chatIdB),
    index("duplicate_chat_pairs_a_idx").on(t.chatIdA),
    index("duplicate_chat_pairs_b_idx").on(t.chatIdB),
    // Canonical ordering A<B — also forbids a self-pair.
    check("duplicate_chat_pairs_canonical_check", sql`chat_id_a < chat_id_b`),
    check("duplicate_chat_pairs_relation_check", sql.raw(`relation in (${RELATION_CHECK_LIST})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// keyword_cooccurrence — owner × keyword-PAIR tallies (keyword×keyword within a tier-0 digest's
// `keywords[]`, hub-token-filtered, content-collapsed). KEEP ownerId (D23 — a parentless per-user
// aggregate: owner × a non-entity dimension, no owning-entity parent, so `ownerId` IS its own key, not a
// mirror). Canonical A<B for the keyword pair (the unique index).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const keywordCooccurrence = sqliteTable(
  "keyword_cooccurrence",
  {
    // TypeID PK (`keyword_cooccurrence_…`).
    id: text("id").$type<KeywordCooccurrenceId>().primaryKey(),
    // KEEP ownerId (D23) — the row's own key dimension, not a derivable mirror. CASCADE: a deleted owner
    // drops their rollup.
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The two co-occurring keywords (free-form strings, normalized upstream). Canonical A<B per the unique.
    keywordA: text("keyword_a").notNull(),
    keywordB: text("keyword_b").notNull(),
    // How many tier-0 digests the pair co-occurred in (the co-occurrence weight).
    count: integer("count").notNull(),
    computedAt: integer("computed_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // One row per (owner, keyword-pair) — the idempotent recompute upsert key.
    uniqueIndex("keyword_cooccurrence_owner_pair_unique").on(t.ownerId, t.keywordA, t.keywordB),
    index("keyword_cooccurrence_owner_idx").on(t.ownerId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// character_keyword_profiles — per-character keyword weights (the keywords a card's chats anchor on).
// DERIVE ownerId (D23 — reach the owner via `characterId → characters.ownerId`; no `ownerId` column). FK
// `characters.id`, CASCADE.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const characterKeywordProfiles = sqliteTable(
  "character_keyword_profiles",
  {
    // TypeID PK (`character_keyword_profile_…`).
    id: text("id").$type<CharacterKeywordProfileId>().primaryKey(),
    // The producer FK + the ONLY ownership link (owner derives via characters.ownerId). CASCADE.
    characterId: text("character_id")
      .$type<CharacterId>()
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    count: integer("count").notNull(),
    computedAt: integer("computed_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // One row per (character, keyword) — the idempotent recompute upsert key.
    uniqueIndex("character_keyword_profiles_character_keyword_unique").on(t.characterId, t.keyword),
    index("character_keyword_profiles_character_idx").on(t.characterId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// character_summaries — the guided-decode distillation of each card into FILTERABLE facets (powers
// browse/catalog/archetype + `search.resolveCharacterDisplay`). DERIVE ownerId (D23 — via characterId →
// characters.ownerId). Keyed BY `characterId` (a natural PK + FK `characters.id` CASCADE; no own TypeID
// brand — distill upserts one summary per current card, D28). `genre`/`tone` are plain TEXT here: the
// enum constraint is the discovery-local guided-decode GRAMMAR (the GENRES/TONES tuples drive the JSON
// schema), NOT a db column enum. `tags` are discovery FACETS (not tag-domain labels).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const characterSummaries = sqliteTable("character_summaries", {
  // Natural PK = the producer FK (D28 — one summary per current card; a re-run refreshes in place).
  // CASCADE: a deleted character drops its summary. No own TypeID brand (keyed by characterId).
  characterId: text("character_id")
    .$type<CharacterId>()
    .primaryKey()
    .references(() => characters.id, { onDelete: "cascade" }),
  // The distilled facets. Enum-constrained by the guided-decode grammar (discovery-local), not the db.
  genre: text("genre"),
  tone: text("tone"),
  subGenres: text("sub_genres", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  setting: text("setting"),
  // Discovery FACETS (auto-suggest source), NOT tag-domain labels.
  tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
  elevatorPitch: text("elevator_pitch"),
  overview: text("overview"),
  // The summarize-model id + the recompute provenance stamp.
  model: text("model").notNull(),
  computedAt: integer("computed_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// theme_clusters — emergent themes (k-means over digest embeddings, LLM-named). KEEP ownerId (D23 — a
// parentless per-user aggregate: owner × cluster). `centroid` is a `vector32` k-means MEAN rollup (NOT a
// primary vector store). `level` (`scene | arc`, the ThemeLevel union) is plain TEXT — its canonical home
// is the server-tier `domain/discovery/contract/params.ts`, which db may not import (the domain validates).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const themeClusters = sqliteTable(
  "theme_clusters",
  {
    // TypeID PK (`theme_cluster_…`).
    id: text("id").$type<ThemeClusterId>().primaryKey(),
    // KEEP ownerId (D23) — the row's own key dimension. CASCADE: a deleted owner drops their clusters.
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The clustering level (`scene` = tier-0, `arc` = tier-1+). Plain TEXT — domain-validated (see header).
    level: text("level").notNull(),
    // The cluster index within (owner, level) — the stable address used by `themeDetail(clusterIdx, level)`.
    clusterIdx: integer("cluster_idx").notNull(),
    // The LLM-assigned name — nullable until the naming pass runs (clusters exist before they are named).
    name: text("name"),
    // The k-means MEAN centroid (F32_BLOB(1024), ../custom-types) — a discovery rollup, NOT a primary
    // vector. Re-normalized by the clusterer so a downstream cosineDistance ranks as the argmin did.
    centroid: vector32("centroid", { dimensions: CENTROID_DIM }).notNull(),
    // The FULL-space member count (the "is this cluster worth naming?" gate uses this, NOT the collapsed
    // rep count — a fork-of-50 collapsing to one rep should still be named; discovery esoteric #3).
    size: integer("size").notNull(),
    model: text("model").notNull(),
    computedAt: integer("computed_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // One cluster per (owner, level, clusterIdx) — the idempotent recompute upsert key.
    uniqueIndex("theme_clusters_owner_level_idx_unique").on(t.ownerId, t.level, t.clusterIdx),
    index("theme_clusters_owner_idx").on(t.ownerId),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// digest_theme_assignments — which theme cluster each digest belongs to (every digest assigned — full
// coverage). DERIVE ownerId (D23 — reach the owner via digest → chat → host; no `ownerId` column).
// COMPOSITE PK (digestId, themeClusterId) — no own TypeID brand. Both FKs CASCADE: a deleted digest OR a
// recomputed/deleted cluster removes the assignment by physics.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const digestThemeAssignments = sqliteTable(
  "digest_theme_assignments",
  {
    // The producer FK + the ownership-derivation link (digest → chat → host). CASCADE.
    digestId: text("digest_id")
      .$type<ChatDigestId>()
      .notNull()
      .references(() => chatDigests.id, { onDelete: "cascade" }),
    // The cluster the digest is assigned to. CASCADE: a recompute deletes the owner's clusters, which
    // clears every assignment, then reinserts (the atomic per-owner-set replace on recompute).
    themeClusterId: text("theme_cluster_id")
      .$type<ThemeClusterId>()
      .notNull()
      .references(() => themeClusters.id, { onDelete: "cascade" }),
    // The story-time axis: the createdAt of the position-MEDIAN message in the digest's seq-span (where
    // the writing happened) — NOT the time-interval midpoint (discovery esoteric #7). Epoch-MS NUMBER.
    // Backfilled idempotently for all tiers, so nullable until the backfill runs.
    msgMidAt: integer("msg_mid_at"),
    computedAt: integer("computed_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // Composite PK: one row per (digest, cluster) — no TypeID brand (the pair IS the identity).
    primaryKey({ columns: [t.digestId, t.themeClusterId] }),
    // Browse the members of a cluster.
    index("digest_theme_assignments_cluster_idx").on(t.themeClusterId),
  ],
);
