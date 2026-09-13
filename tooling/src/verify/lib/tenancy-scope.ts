// Shared TENANCY-CLASS reader: reads the drizzle schema fact's already-resolved `SchemaModel` for the two
// questions `table-scoping-class` (its own coherence check) and the `owner-scoped-{reads,writes,upserts}`
// family all need answered IDENTICALLY — "which drizzle table identifiers are ownerId-scoped" (answered from the
// registry below) and "every declared table identifier" (the denominator that tells a
// non-owner-scoped table from an UNREADABLE one, `tenancy-read.ts`'s `tableTargetOf`).
//
// Extracted 2026-09-11 (#1584, gate-runtime-standardization) from a raw `ctx.project.getSourceFiles()`
// walk that lived inside `gates/table-scoping-class.ts` and was imported by three sibling gates — forbidden
// under the final contract's shared-query boundary (no gate-owned Project walk, no gate-owned registry
// consumed by siblings through a re-walk). The walk now happens exactly ONCE per invocation, inside the
// shared `drizzleSchemaFact`, regardless of how many policies declare `facts: [drizzleSchemaFact]`.
//
// THE CLASSIFICATION REGISTRY IS NOW HERE, AND THE RULING THAT KEPT IT OUT SURVIVES — ITS INPUT CHANGED.
// This paragraph used to read: "THE CLASSIFICATION REGISTRY ITSELF STAYS IN `gates/table-scoping-class.ts`,
// DELIBERATELY, NOT HERE: it is RULING DATA (AGENTS §1 "ownership is INHERITED, not stamped"; D18/D20/D23)
// keyed by snake_case SQL table names, and `biome.json` turns `useNamingConvention` off for
// `tooling/src/verify/gates/**` but NOT for `tooling/src/verify/lib/**` — moving the table here would
// either rename 87 SQL-name keys away from the schema's own vocabulary or force a lib-wide lint carve-out
// for one table's data." It is kept verbatim rather than deleted because the REASONING was correct and is
// the record of why the data lived in a gate module at all.
//
// What dissolved it: the owner banned gate-to-gate imports on 2026-09-12 (#2096 / §12.3 — a shared
// predicate moves to `lib/<family>.ts`), which made the old arrangement unavailable, and the ruled repair
// (arm 3) changes the DATA SHAPE rather than the lint or the vocabulary. The table names are now VALUES on
// a record (`{ table: "automation_rules", … }`), not object KEYS, and `useNamingConvention` judges keys —
// so the SQL vocabulary is preserved exactly, no key is renamed, and no suppression or override widening
// was needed. Verified by a planted two-sided probe in this directory before the move: the key-shaped
// declaration errored on `automation_rules`, the record-array shape did not, in one invocation.
//
// CENSUS, RE-DERIVED 2026-09-12 AT THE MOVE — and the old one was STALE. The paragraph above claimed
// "87 tables — 23 ownerId · 19 membership · 16 junction · 24 parent · 5 global", dated 2026-08-08. The true
// figures today are **97 tables — 27 ownerId · 26 parent · 21 membership · 17 junction · 6 global**, and the
// registry matches the live schema EXACTLY: 97 `sqliteTable` declarations across 30 files in
// `packages/db/src/schema/**`, symmetric difference ZERO in both directions. The registry was right the
// whole time; only its prose count rotted, because the two-sided ratchet polices the SET and nothing
// policed the sentence describing it. That is why the pin in
// `tests/tooling/verify/gates/tenancy-scope-family.test.ts` asserts DERIVED-equals-DECLARED rather than a
// literal count — pinning 97 would make adding a table a red proof.
//
// AND THIS NUMBER HAS NOW ROTTED TWICE. The 2026-08-08 sentence described itself as a repair: "refinery R0
// — which also corrected a two-row drift the previous census missed". So the count drifted, was corrected,
// and has drifted again by ten. Twice is not an accident; it is a maintenance model that does not work,
// and the root cause is structural rather than anybody's carelessness: the two-sided ratchet polices the
// SET, and NOTHING polices a hand-written prose count OF that set. A number describing something a machine
// already knows exactly will rot on a schedule set by how often the machine's answer changes. That is why
// this paragraph now carries its METHOD and DATE rather than only its value — a reader who needs the
// number runs the derivation, and a reader who needs to trust it can see when and how it was taken.
//
// THE FAMILY'S POPULATION PORT IS DERIVED ONCE HERE (§5b.5), so the three call-shape members cite one
// measurement instead of copying it three times — the `DRIZZLE_SCHEMA_POPULATION` precedent, which this
// family's fourth member consumes directly. All four converted in ONE commit, `b54b2c34e`, so the legacy
// sha is its parent `40223a0915eda72dd8ab35fbdeaf9e9892089717` for every member.
//   `owner-scoped-{reads,writes,upserts}`: legacy `scanRoot: (p) => p.includes("packages/server/src/")`
//   becomes `@server`, which IS `packages/server/src/` — the same set. The only difference is that
//   `includes(` matched the segment ANYWHERE in a path while the population root is ANCHORED at its start,
//   and on this tree that distinction is empty: 1560 tracked paths contain `packages/server/src/` and the
//   same 1560 begin with it.
//   `table-scoping-class`: legacy `scanRoot: (p) => p.includes("packages/db/src/schema/")` becomes
//   `DRIZZLE_SCHEMA_POPULATION` (`{ in: ["@db"], under: ["packages/db/src/schema/**"] }`), again the same
//   set under the same anchoring difference — 30 tracked paths contain the segment and the same 30 begin
//   with it. That member therefore declares the DRIZZLE-SCHEMA family's shared population while belonging
//   to THIS family: the classification data is tenancy's, the files it reads are the schema's, and the two
//   are deliberately not merged.
import type { GatePolicyContext } from "../contract/policy.ts";
import type { ReadySchemaFact, SchemaModel, SchemaTable } from "../contract/schema-fact.ts";
import type { ScopingRow, TableShape } from "../contract/tenancy-scope.ts";

/** EVERY table in `packages/db/src/schema/**`, classified. TOTAL and TWO-SIDED: an unlisted table is RED,
 *  a listed table the schema no longer declares is RED. The (a) rows mirror `ownerid-registry`'s
 *  OWNERID_CLASSIFICATIONS (that gate owns WHETHER the stamp is legal; this one owns what the stamp MEANS
 *  for a read), so their reasons stay short and cite it. The census and its re-derivation are in this
 *  file's header. */
export const TABLE_SCOPING_ROWS: readonly ScopingRow[] = [
  // ── (a) ownerId-scoped — the D23 stamp. Reasons live in ownerid-registry's OWNERID_CLASSIFICATIONS. ──────────
  { table: "assets", scope: "ownerId", why: "D21 single-owned; reads go through `fetchOwned` (ownerid-registry owns the stamp's justification)." },
  { table: "automation_rules", scope: "ownerId", why: "D46 host-authored rule — runs as its author; the ownerId is the funding/authority subject." },
  { table: "characters", scope: "ownerId", why: "D23 true producer — the card library is single-owned." },
  {
    table: "refinery_schemas",
    scope: "ownerId",
    why: "R3/SF0 custom payload-schema LIBRARY — authored library tooling with no owning parent (the presets shape; ownerid-registry owns the stamp's justification).",
  },
  {
    table: "chat_tags",
    scope: "ownerId",
    why: "D30 per-user overlay on an OWNERLESS chat — the tagger IS the scope subject, so the chatId does NOT make it membership-scoped.",
  },
  { table: "daily_stats", scope: "ownerId", why: "D23 parentless per-user aggregate (×day)." },
  { table: "documents", scope: "ownerId", why: "D49 databank producer — top-level owned canon." },
  { table: "global_documents", scope: "ownerId", why: "D49 personal-bank scope junction — the ownerId IS the scope subject (not the documentId's owner)." },
  { table: "global_variables", scope: "ownerId", why: "D46 per-user cross-chat KV — a user can never read another's globals." },
  { table: "keyword_cooccurrence", scope: "ownerId", why: "D23 parentless per-user aggregate (×keyword-pair)." },
  { table: "model_stats", scope: "ownerId", why: "D23 parentless per-user aggregate (×model)." },
  { table: "owner_stats", scope: "ownerId", why: "D23 parentless per-user aggregate." },
  { table: "stats_canon_versions", scope: "ownerId", why: "D23 parentless per-user aggregate — monotonic rebuild ownership token." },
  { table: "personas", scope: "ownerId", why: "D23 true producer — personas are single-owned." },
  {
    table: "roster_presets",
    scope: "ownerId",
    why: "D61 B6 true producer — a saved party is the user's authored artifact; its character references are a LIST via the members junction, so there is no single owning FK to derive through (ownerid-registry owns the stamp's justification).",
  },
  {
    table: "plugin_kv",
    scope: "ownerId",
    why: "D46 denormalized belt on the plugin_id partition — the (plugin_id, owner_id) WHERE makes a cross-owner KV read structurally impossible.",
  },
  { table: "plugins", scope: "ownerId", why: "D46 true producer — a plugin runs as its installing principal." },
  {
    table: "presets",
    scope: "ownerId",
    why: "D23 true producer; NULLABLE ownerId is the shared system default (a null owner matches no `fetchOwned` caller — that is what makes it read-only).",
  },
  { table: "tags", scope: "ownerId", why: "D23 true producer — a tag has no owning parent to derive through." },
  { table: "theme_clusters", scope: "ownerId", why: "D23 parentless per-user aggregate (×cluster)." },
  { table: "themes", scope: "ownerId", why: "D44/D63 user theme library; seed palettes are null-owner rows, non-editable by construction." },
  { table: "user_credentials", scope: "ownerId", why: "D23 true producer — the credential vault is single-owned." },
  { table: "workload_schedules", scope: "ownerId", why: "D23 true producer — a user-authored recurring-run config with no owned anchor to derive from." },
  { table: "workloads", scope: "ownerId", why: "D23 true producer — the per-user execution queue." },
  { table: "world_books", scope: "ownerId", why: "D23 true producer — books are top-level single-owned." },

  // ── (b) membership-scoped — D18: the chat is OWNERLESS, authority is the participant roster. ───────────
  {
    table: "automation_budgets",
    scope: "membership",
    why: "D46 per-chat spend ledger — the chat's members are its scope; there is no owner column by design.",
  },
  {
    table: "automation_owner_budgets",
    scope: "ownerId",
    why: "C5's owner-GLOBAL fire-rate ceiling — the SIBLING of automation_budgets, and the reason the two are separate tables rather than one nullable key: that table's PK IS chat_id, so a chat-less rule's belt has nowhere to live on it. An authorization check here predicates on the caller's own userId and nothing else (the single-owned plane — there is no id to pass, so there is no other lane to name).",
  },
  { table: "automation_fires", scope: "membership", why: "D46 per-chat fire log — chat-anchored, read through the room." },
  {
    table: "chat_books",
    scope: "membership",
    why: "the room's attached books: the CHAT side gates the read (a member sees the room's lore even when the book is the host's property, D18/D64); the world_books parent gates the EDIT.",
  },
  {
    table: "chat_regex_scripts",
    scope: "membership",
    why: "the room's attached regex scripts (the chat_books twin, D121-E): the CHAT side gates the read (a member sees the room's transforms even though the script is the host's property, D18/D64); the regex_scripts parent gates the EDIT.",
  },
  { table: "chat_digests", scope: "membership", why: "the room's memory digests — chat-anchored derived data, read only by the room's members." },
  {
    table: "chat_documents",
    scope: "membership",
    why: "the room's active databank set — room-public by design (`loadMetaByIds`'s header: a member views the HOST's active documents).",
  },
  {
    table: "chat_events",
    scope: "membership",
    why: "the durable chat-bus log — the replay ring is room-public to members (the contract's allowlist makes secrets unrepresentable).",
  },
  {
    table: "chat_handoff_resumptions",
    scope: "membership",
    why: "the accepted-host completion marker is room workflow state; its chatId anchors authority in the participant roster.",
  },
  {
    table: "chat_import_claims",
    scope: "membership",
    why: "the import idempotency claim is born with and derives authority through its chat; characterId narrows operation identity rather than creating a second read surface.",
  },
  { table: "chat_injections", scope: "membership", why: "per-chat positional injections — room state, membership-gated." },
  { table: "chat_invites", scope: "membership", why: "the membership chokepoint — issued by the host, redeemed by token; scope is the chat." },
  {
    table: "chat_locks",
    scope: "membership",
    why: "the per-chat turn lock, PK = the chat's own id — a concurrency primitive co-located with the room it guards.",
  },
  { table: "chat_participants", scope: "membership", why: "the roster IS the membership predicate every other (b) read resolves through (D18)." },
  { table: "chat_segments", scope: "membership", why: "the room's embedded transcript segments — chat-anchored derived data." },
  { table: "chat_stream_events", scope: "membership", why: "the resumable SSE token log — room-public to members, chat-anchored." },
  {
    table: "chats",
    scope: "membership",
    why: "D18: NO ownerId — the host participant is the authority and 'list my chats' is pure membership. Its OWN id is the anchor other (b) rows carry as chatId.",
  },
  {
    table: "imagery_generations",
    scope: "membership",
    why: "chat-anchored image-generation provenance — the room it fired in scopes it (the asset parent scopes the blob).",
  },
  {
    table: "messages",
    scope: "membership",
    why: "canon slots — a member sees the room's admitted history (the `joinHistoryVisibility` floor is a host OPTION over this, not a second scope).",
  },
  {
    table: "pending_turns",
    scope: "membership",
    why: "a host-offline deferred turn — chat-anchored; `triggeredBy`/`runAsUserId` are turn IDENTITY (D19), not the read scope.",
  },
  { table: "rpg_games", scope: "membership", why: "the rpg plane hangs off the room — `gmUserId` is a ROLE within the room, not an ownership stamp." },
  { table: "session_entries", scope: "membership", why: "the agent-sdk session cache is chat-anchored (D8/D25); produced by infra, never a user-facing read." },

  // ── (c) junction-derived — a pure LINK; BOTH parents must be reachable by the caller. ──────────────────
  {
    table: "character_books",
    scope: "junction",
    why: "character ↔ world_book attachment; both parents are (a) ownerId tables, so the caller must own both ends.",
  },
  { table: "character_documents", scope: "junction", why: "character ↔ document attachment; both parents are (a) ownerId tables." },
  {
    table: "character_regex_scripts",
    scope: "junction",
    why: "D121-E character ↔ regex_script attachment; both parents are (a) ownerId tables, so the caller must own both ends.",
  },
  { table: "character_personas", scope: "junction", why: "the M:N character ↔ persona association (producer: persona); both parents are (a) ownerId tables." },
  {
    table: "character_tags",
    scope: "junction",
    why: "D23 derive-don't-stamp precedent — a required FK to an owned row on BOTH ends makes the owner always derivable.",
  },
  { table: "chat_digest_speakers", scope: "junction", why: "digest ↔ character speaker stamp; the digest side is (b) membership, the character side is (a)." },
  {
    table: "digest_theme_assignments",
    scope: "junction",
    why: "digest ↔ theme_cluster analytics link; theme_clusters is per-owner, the digest is chat-anchored.",
  },
  {
    table: "duplicate_character_pairs",
    scope: "junction",
    why: "a derived near-duplicate PAIR — both characters must be the caller's (discovery computes per owner).",
  },
  { table: "duplicate_chat_pairs", scope: "junction", why: "a derived near-duplicate PAIR over two chats — the caller must be a member of both." },
  {
    table: "message_assets",
    scope: "junction",
    why: "the structural message ↔ asset link (#67) — the message side is (b), the asset side is (a); it exists so the ref registry can SEE an inline chat image.",
  },
  { table: "persona_books", scope: "junction", why: "persona ↔ world_book attachment; both parents are (a) ownerId tables." },
  {
    table: "plugin_assets",
    scope: "junction",
    why: "#802 plugin ↔ asset fetch link (`net.fetchAsset`); both parents are (a) ownerId tables and the write closes over BOTH — the pluginId from the bridge, the assetId minted by the CAS store under the installer — so neither end is guest-nameable. Like `message_assets` it exists so the asset-GC ref registry can SEE the reference; `fetched_at` is provenance riding the link, never a read key.",
  },
  {
    table: "roster_preset_members",
    scope: "junction",
    why: "D61 B6 — roster_preset ↔ character seat; both parents are (a) ownerId tables (same owner, gated at the write verb), and the read joins through the preset. position/talkativeness/disabled are seat DATA riding the link, never a read key (the message_reactions posture).",
  },
  { table: "persona_tags", scope: "junction", why: "persona ↔ tag attachment; both parents are (a) ownerId tables." },
  { table: "preset_tags", scope: "junction", why: "preset ↔ tag attachment; both parents are (a) ownerId tables." },
  { table: "world_book_tags", scope: "junction", why: "world_book ↔ tag attachment; both parents are (a) ownerId tables." },
  {
    table: "preset_regex_scripts",
    scope: "junction",
    why: "D121-E preset ↔ regex_script attachment; both parents are (a) ownerId tables (a null-owner system preset matches no caller, so it is un-attachable by construction).",
  },

  // ── (d) parent-derived — scope inherits ONE owning FK; the read joins up. ──────────────────────────────
  {
    table: "roster_preset_rules",
    scope: "parent",
    why: "B10's rules rider — a cast's captured automation RULE PRESETS. NOT `junction` even though it links two concepts: a rule preset is a CODE-catalogue id (`RULE_PRESET_IDS`), not a row, so there is no second independently-scoped parent to reach (the message_reactions reasoning) — scope derives through the ONE owning FK, presetId → roster_presets.ownerId (D23). rule_preset_id/position/knobs are captured DATA riding the link, never a read key.",
  },
  {
    table: "automation_rule_state",
    scope: "parent",
    why: "S5 (C1) the run_analysis arm's plot state — scope derives ruleId → automation_rules (ownerId, chatId); D23-clean, no member/plugin read surface (interaction-direction-spec §3-S5.2).",
  },
  {
    table: "message_reactions",
    scope: "parent",
    why: "B6/MR0 — scope derives variantId → message_variants → messages → chats → the roster (D23 derive-don't-stamp). It is NOT `junction`: both FKs land in the SAME room, so there is no second independently-scoped parent to reach; and NOT `membership`, because the row carries no chatId of its own. `reactorParticipantId` is DATA (which seat reacted, D80), never the read key (MA-2 §3/§4).",
  },
  {
    table: "character_embeddings",
    scope: "parent",
    why: "derived vectors for a character — scope is `characters.ownerId` via the FK (embeddings stamps no owner, D23).",
  },
  { table: "character_keyword_profiles", scope: "parent", why: "discovery's per-card keyword profile — scope derives through `characters`." },
  { table: "character_snapshots", scope: "parent", why: "D28 the character history log — scope derives through `characters`; it gates nothing itself." },
  {
    table: "character_stats",
    scope: "parent",
    why: "per-card economics — scope derives through `characters` (distinct from the (a) per-USER stats aggregates).",
  },
  {
    table: "character_summaries",
    scope: "parent",
    why: "discovery's distillation — scope derives through `characters` (its verbs' headers state the owner join).",
  },
  { table: "document_chunks", scope: "parent", why: "databank chunk vectors — scope derives through `documents.ownerId`." },
  {
    table: "gallery_items",
    scope: "parent",
    why: "ownership DERIVES via `asset_id → assets.ownerId` (the owner ruling 2026-07-01, stated in the schema header); `subject_character_id` is a nullable label, not a second parent.",
  },
  {
    table: "global_regex_scripts",
    scope: "parent",
    why: "D121-E: the always-on script set — a single PK/FK to `regex_scripts`, so scope is the script's owner.",
  },
  {
    table: "regex_scripts",
    scope: "ownerId",
    why: "D23 true producer — a script is the user's authored artifact with no owning parent to derive through (the world_books twin).",
  },
  { table: "global_books", scope: "parent", why: "the always-on book set — a single PK/FK to `world_books`, so scope is the book's owner." },
  { table: "image_embeddings", scope: "parent", why: "derived image vectors — scope derives through `assets.ownerId`." },
  {
    table: "image_index_skips",
    scope: "parent",
    why: "the indexer's admission-floor skip-log — a single PK/FK to `assets`, so scope derives through `assets.ownerId` (no stamped owner, D20).",
  },
  {
    table: "message_variants",
    scope: "parent",
    why: "D26 the generation record — scope derives through `messages` to the room; a variant carries no attribution of its own.",
  },
  {
    table: "notifications",
    scope: "parent",
    why: "the per-user durable inbox — `recipientUserId` IS the single owning FK (a differently-spelled owner column, so it is not on the D23 stamp allowlist).",
  },
  {
    table: "refinery_runs",
    scope: "parent",
    why: "refinery append-only run log — scope derives through `refinery_sessions` → `characters.ownerId` (two required FKs; docs/history/design/refinery-r0.md §3.1).",
  },
  {
    table: "refinery_sessions",
    scope: "parent",
    why: "refinery session — anchored `character_id NOT NULL → characters.ownerId`; the D23 DERIVE class (no stamp), the gallery_items/imagery_generations precedent.",
  },
  { table: "rpg_checkpoints", scope: "parent", why: "scope derives through `rpg_games` to the room; the snapshot FK is intra-aggregate." },
  { table: "rpg_journal", scope: "parent", why: "scope derives through `rpg_games` to the room." },
  {
    table: "rpg_sheets",
    scope: "parent",
    why: "scope derives through `rpg_games` to the room; `userId`/`characterId` are the sheet's SUBJECT, not the read scope.",
  },
  {
    table: "rpg_snapshots",
    scope: "parent",
    why: "scope derives through `rpg_games` to the room; empty anchor slots are snapshot FKs, never lost completions.",
  },
  {
    table: "rpg_turn_tool_calls",
    scope: "parent",
    why: "scope derives through `rpg_games` to the room — the read verb resolves MEMBERSHIP (a tool call is the record of a turn everyone at the table watched, not a GM secret), so the predicate is the game's chat, never an ownerId.",
  },
  {
    table: "sessions",
    scope: "parent",
    why: "auth/BFF sessions — the single `userId` FK is the scope; reads are the session-resolution path, never a user-facing surface.",
  },
  { table: "user_settings", scope: "parent", why: "the per-user config tier — natural-key PK `user_id` IS the FK and the scope." },
  { table: "world_entries", scope: "parent", why: "book entries — scope derives through `world_books.ownerId`; entries stamp no owner (D23)." },

  // ── (e) global / system — no tenancy predicate exists. ─────────────────────────────────────────────────
  {
    table: "admin_distributed_plugins",
    scope: "global",
    why: "D147(d) DEPLOYMENT POLICY — the set of plugin bundles an admin publishes to everyone. It has no tenant: `distributedBy` is a publisher-attribution stamp (and the CASCADE that lets that account be deleted), not a read scope, and the per-user INSTALLS it fans out to are ordinary owner-scoped `plugins` rows. Its authorization is the `requireAdmin` gate on the three distribution verbs, not a column.",
  },
  {
    table: "audit_logs",
    scope: "global",
    why: "the append-only system log (writer: foundation/observability's `logAudit`); `actorUserId` is a SET-NULL attribution stamp, not a read scope — the log outlives its actor by design (D24).",
  },
  { table: "oidc_transactions", scope: "global", why: "transient pre-identity auth state — there is no principal yet when it is written or read." },
  { table: "rate_limit_buckets", scope: "global", why: "transport-tier counters (producer: transport/rate-limit.ts) — keyed by bucket, never by tenant." },
  {
    table: "settings",
    scope: "global",
    why: "the global KV escape hatch (the reserved `app` AppSettings row + the OR catalog snapshot); the per-USER tier is the separate `user_settings` table.",
  },
  {
    table: "users",
    scope: "global",
    why: "the tenancy ROOT — it is not scoped BY anything: reads are self (principal.userId) or admin-gated, enforced by `no-direct-users-read`, not by a scope column.",
  },
];

/** THE ONE READER. Built once per call into a Map so every consumer keys on the same object, and so the
 *  array stays the authored shape while lookups stay O(1). All four policies — `table-scoping-class` and
 *  the three `owner-scoped-*` — go through this or through the two derivations below; none of them sees
 *  the array directly, which is what keeps "what is this table's class" a single answer. */
export function tableScopingClasses(): ReadonlyMap<string, ScopingRow> {
  return new Map(TABLE_SCOPING_ROWS.map((row) => [row.table, row]));
}

const OWNER_COL = "ownerId";
const CHAT_COL = "chatId";

/** The shape facts `table-scoping-class`'s own coherence check judges a row's declared class against. */
export function tableShapeOf(table: SchemaTable): TableShape {
  let hasOwnerId = false;
  let hasChatId = false;
  let fkCount = 0;
  for (const column of table.columns) {
    hasOwnerId ||= column.identity.propertyName === OWNER_COL;
    hasChatId ||= column.identity.propertyName === CHAT_COL;
    if (column.foreignKey !== null) {
      fkCount += 1;
    }
  }
  return { hasOwnerId, hasChatId, fkCount };
}

function tableIdents(model: SchemaModel, keep: (table: SchemaTable) => boolean): ReadonlySet<string> {
  const idents = new Set<string>();
  for (const table of model.tables) {
    if (keep(table)) {
      idents.add(table.identity.declarationName);
    }
  }
  return idents;
}

/** The drizzle table IDENTIFIERS whose SQL table the caller's classifier accepts (`table-scoping-class`'s
 *  own (a)-class predicate) — derived per run from the schema model, never a hand-kept list, so a
 *  re-classification moves every consumer at once. ONE home for the WALK: `owner-scoped-reads`,
 *  `owner-scoped-writes`, and `owner-scoped-upserts` all key their (a)-set on this (through
 *  `table-scoping-class.ts`'s wrapper), and each keeps its OWN blindness tripwire (an empty set means the
 *  derivation went blind, never that the tree is clean). */
export function ownerScopedTableIdents(model: SchemaModel): ReadonlySet<string> {
  const classes = tableScopingClasses();
  return tableIdents(model, (table) => classes.get(table.sqlName)?.scope === "ownerId");
}

/** EVERY drizzle table identifier the schema declares, regardless of class — the DENOMINATOR the tenancy
 *  write halves need. Without it "this identifier is not an (a) table" and "I could not read this identifier
 *  at all" are the same answer, and the second one is a bypass wearing the first one's clothes. Same
 *  derivation, same home: a table that stops being declared leaves both sets at once. */
export function schemaTableIdents(model: SchemaModel): ReadonlySet<string> {
  return tableIdents(model, () => true);
}

const SCHEMA_BARREL = "packages/db/src/schema/index.ts";

/** The shared "blind derivation" arm all three owner-scoped-* gates carry: an empty (a)-class set means the
 *  schema shape or the registry moved and the gate now matches nothing, which would otherwise report ✓
 *  forever. Guarded on the real schema barrel actually being in the loaded population, exactly like
 *  `own-tables-only`'s real-tree anchor — a conformance mini-project carries neither the full schema nor the
 *  full server tree, and would "prove" the derivation blind. */
export function reportBlindWhenEmpty(
  ctx: GatePolicyContext,
  schemaFact: ReadySchemaFact<SchemaModel>,
  ownerTableIdents: ReadonlySet<string>,
  message: string,
): void {
  if (!schemaFact.receipt.paths.includes(SCHEMA_BARREL) || ownerTableIdents.size > 0) {
    return;
  }
  const anchor = ctx.files[0];
  if (anchor === undefined) {
    throw new Error("owner-scoped gate received an empty effective population");
  }
  ctx.report.file(ctx.relativePath(anchor), { message });
}
