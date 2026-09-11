// Gate: table-scoping-class — EVERY schema table declares HOW a caller's tenancy reaches it (AGENTS §1
// "ownership is INHERITED, not stamped"; D18/D20/D23). Five classes: ownerId · membership · junction ·
// parent · global. A new table with no row is RED AT BIRTH; a row naming no live table is RED (stale); a row
// whose class CONTRADICTS the derived schema shape (an `ownerId` class with no ownerId column, a
// `membership` class with no chatId) is RED. HARD authority, no exemption vocabulary: the only way to change
// the verdict is a reviewed edit to TABLE_SCOPING_CLASSES. DECLARED LIMIT: this gate proves the DECLARATION
// is coherent with the schema — it does NOT prove any read actually applies the class's predicate (the
// membership rung is control-flow-dependent; the cross-tenant behavioral sweep stays that proof).
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { ReadySchemaFact, SchemaModel, SchemaTable } from "../contract/schema-fact.ts";
import { recordReadySchemaFact } from "../contract/schema-fact.ts";
import { DRIZZLE_SCHEMA_POPULATION, drizzleSchemaFact } from "../lib/schema-fact.ts";
import type { TableShape } from "../lib/tenancy-scope.ts";
import { schemaTableIdents as deriveAllTables, ownerScopedTableIdents as deriveOwnerScoped, tableShapeOf } from "../lib/tenancy-scope.ts";

const SCHEMA_BARREL = "packages/db/src/schema/index.ts";
/** The room table is its OWN membership anchor — it carries `id`, not `chatId`. Name-keyed, so this gate
 *  carries a tripwire: if the real tree stops declaring it, this gate has gone blind (§4.6). */
export const ROOM_TABLE = "chats";

/** How a caller's tenancy reaches a row. The classes are ordered strongest-predicate first; a table that
 *  satisfies two takes the one whose predicate an authorization check actually spells. */
export type ScopingClass =
  /** (a) carries an `ownerId` column — `fetchOwned(id, principal.userId)` / an ownerId in the WHERE. */
  | "ownerId"
  /** (b) chat-anchored — authority is `chat_participants` membership on the row's own `chatId` (D18). */
  | "membership"
  /** (c) a pure LINK row between two independently-scoped entities — BOTH parents must be reachable. */
  | "junction"
  /** (d) scope inherits ONE owning FK; the read joins up to the parent (derive-don't-stamp, D23). */
  | "parent"
  /** (e) no tenancy: a system/global table (config, the identity root, transport state, the audit log). */
  | "global";

/** The registry row: the class + the mandatory reason. Deliberately not a reusable "exemption" shape (the
 *  own-tables-only `OwnershipRuling` precedent): this decides whether a table's scope predicate IS what the
 *  row says, never whether an existing finding is suppressed. */
export interface ScopingRow {
  readonly scope: ScopingClass;
  readonly why: string;
}

/** EVERY table in `packages/db/src/schema/**`, classified. TOTAL and TWO-SIDED: an unlisted table is RED,
 *  a listed table the schema no longer declares is RED. The (a) rows mirror `ownerid-registry`'s
 *  OWNERID_CLASSIFICATIONS (that gate owns WHETHER the stamp is legal; this one owns what the stamp MEANS for a
 *  read), so their reasons stay short and cite it. Verified against the schema 2026-08-08 (refinery R0 —
 *  which also corrected a two-row drift the previous census missed): 87 tables — 23 ownerId ·
 *  19 membership · 16 junction · 24 parent · 5 global. NOT moved to `lib/tenancy-scope.ts`: it is
 *  snake_case-SQL-name-keyed RULING DATA, and `biome.json` only turns `useNamingConvention` off for
 *  `tooling/src/verify/gates/**`, not `lib/**` — the WALK moved, the DATA stays where its keys are legal. */
export const TABLE_SCOPING_CLASSES: Readonly<Record<string, ScopingRow>> = {
  // ── (a) ownerId-scoped — the D23 stamp. Reasons live in ownerid-registry's OWNERID_CLASSIFICATIONS. ──────────
  assets: { scope: "ownerId", why: "D21 single-owned; reads go through `fetchOwned` (ownerid-registry owns the stamp's justification)." },
  automation_rules: { scope: "ownerId", why: "D46 host-authored rule — runs as its author; the ownerId is the funding/authority subject." },
  characters: { scope: "ownerId", why: "D23 true producer — the card library is single-owned." },
  refinery_schemas: {
    scope: "ownerId",
    why: "R3/SF0 custom payload-schema LIBRARY — authored library tooling with no owning parent (the presets shape; ownerid-registry owns the stamp's justification).",
  },
  chat_tags: {
    scope: "ownerId",
    why: "D30 per-user overlay on an OWNERLESS chat — the tagger IS the scope subject, so the chatId does NOT make it membership-scoped.",
  },
  daily_stats: { scope: "ownerId", why: "D23 parentless per-user aggregate (×day)." },
  documents: { scope: "ownerId", why: "D49 databank producer — top-level owned canon." },
  global_documents: { scope: "ownerId", why: "D49 personal-bank scope junction — the ownerId IS the scope subject (not the documentId's owner)." },
  global_variables: { scope: "ownerId", why: "D46 per-user cross-chat KV — a user can never read another's globals." },
  keyword_cooccurrence: { scope: "ownerId", why: "D23 parentless per-user aggregate (×keyword-pair)." },
  model_stats: { scope: "ownerId", why: "D23 parentless per-user aggregate (×model)." },
  owner_stats: { scope: "ownerId", why: "D23 parentless per-user aggregate." },
  stats_canon_versions: { scope: "ownerId", why: "D23 parentless per-user aggregate — monotonic rebuild ownership token." },
  personas: { scope: "ownerId", why: "D23 true producer — personas are single-owned." },
  roster_presets: {
    scope: "ownerId",
    why: "D61 B6 true producer — a saved party is the user's authored artifact; its character references are a LIST via the members junction, so there is no single owning FK to derive through (ownerid-registry owns the stamp's justification).",
  },
  plugin_kv: {
    scope: "ownerId",
    why: "D46 denormalized belt on the plugin_id partition — the (plugin_id, owner_id) WHERE makes a cross-owner KV read structurally impossible.",
  },
  plugins: { scope: "ownerId", why: "D46 true producer — a plugin runs as its installing principal." },
  presets: {
    scope: "ownerId",
    why: "D23 true producer; NULLABLE ownerId is the shared system default (a null owner matches no `fetchOwned` caller — that is what makes it read-only).",
  },
  tags: { scope: "ownerId", why: "D23 true producer — a tag has no owning parent to derive through." },
  theme_clusters: { scope: "ownerId", why: "D23 parentless per-user aggregate (×cluster)." },
  themes: { scope: "ownerId", why: "D44/D63 user theme library; seed palettes are null-owner rows, non-editable by construction." },
  user_credentials: { scope: "ownerId", why: "D23 true producer — the credential vault is single-owned." },
  workload_schedules: { scope: "ownerId", why: "D23 true producer — a user-authored recurring-run config with no owned anchor to derive from." },
  workloads: { scope: "ownerId", why: "D23 true producer — the per-user execution queue." },
  world_books: { scope: "ownerId", why: "D23 true producer — books are top-level single-owned." },

  // ── (b) membership-scoped — D18: the chat is OWNERLESS, authority is the participant roster. ───────────
  automation_budgets: { scope: "membership", why: "D46 per-chat spend ledger — the chat's members are its scope; there is no owner column by design." },
  automation_owner_budgets: {
    scope: "ownerId",
    why: "C5's owner-GLOBAL fire-rate ceiling — the SIBLING of automation_budgets, and the reason the two are separate tables rather than one nullable key: that table's PK IS chat_id, so a chat-less rule's belt has nowhere to live on it. An authorization check here predicates on the caller's own userId and nothing else (the single-owned plane — there is no id to pass, so there is no other lane to name).",
  },
  automation_fires: { scope: "membership", why: "D46 per-chat fire log — chat-anchored, read through the room." },
  chat_books: {
    scope: "membership",
    why: "the room's attached books: the CHAT side gates the read (a member sees the room's lore even when the book is the host's property, D18/D64); the world_books parent gates the EDIT.",
  },
  chat_regex_scripts: {
    scope: "membership",
    why: "the room's attached regex scripts (the chat_books twin, D121-E): the CHAT side gates the read (a member sees the room's transforms even though the script is the host's property, D18/D64); the regex_scripts parent gates the EDIT.",
  },
  chat_digests: { scope: "membership", why: "the room's memory digests — chat-anchored derived data, read only by the room's members." },
  chat_documents: {
    scope: "membership",
    why: "the room's active databank set — room-public by design (`loadMetaByIds`'s header: a member views the HOST's active documents).",
  },
  chat_events: {
    scope: "membership",
    why: "the durable chat-bus log — the replay ring is room-public to members (the contract's allowlist makes secrets unrepresentable).",
  },
  chat_handoff_resumptions: {
    scope: "membership",
    why: "the accepted-host completion marker is room workflow state; its chatId anchors authority in the participant roster.",
  },
  chat_import_claims: {
    scope: "membership",
    why: "the import idempotency claim is born with and derives authority through its chat; characterId narrows operation identity rather than creating a second read surface.",
  },
  chat_injections: { scope: "membership", why: "per-chat positional injections — room state, membership-gated." },
  chat_invites: { scope: "membership", why: "the membership chokepoint — issued by the host, redeemed by token; scope is the chat." },
  chat_locks: { scope: "membership", why: "the per-chat turn lock, PK = the chat's own id — a concurrency primitive co-located with the room it guards." },
  chat_participants: { scope: "membership", why: "the roster IS the membership predicate every other (b) read resolves through (D18)." },
  chat_segments: { scope: "membership", why: "the room's embedded transcript segments — chat-anchored derived data." },
  chat_stream_events: { scope: "membership", why: "the resumable SSE token log — room-public to members, chat-anchored." },
  chats: {
    scope: "membership",
    why: "D18: NO ownerId — the host participant is the authority and 'list my chats' is pure membership. Its OWN id is the anchor other (b) rows carry as chatId.",
  },
  imagery_generations: {
    scope: "membership",
    why: "chat-anchored image-generation provenance — the room it fired in scopes it (the asset parent scopes the blob).",
  },
  messages: {
    scope: "membership",
    why: "canon slots — a member sees the room's admitted history (the `joinHistoryVisibility` floor is a host OPTION over this, not a second scope).",
  },
  pending_turns: {
    scope: "membership",
    why: "a host-offline deferred turn — chat-anchored; `triggeredBy`/`runAsUserId` are turn IDENTITY (D19), not the read scope.",
  },
  rpg_games: { scope: "membership", why: "the rpg plane hangs off the room — `gmUserId` is a ROLE within the room, not an ownership stamp." },
  session_entries: { scope: "membership", why: "the agent-sdk session cache is chat-anchored (D8/D25); produced by infra, never a user-facing read." },

  // ── (c) junction-derived — a pure LINK; BOTH parents must be reachable by the caller. ──────────────────
  character_books: { scope: "junction", why: "character ↔ world_book attachment; both parents are (a) ownerId tables, so the caller must own both ends." },
  character_documents: { scope: "junction", why: "character ↔ document attachment; both parents are (a) ownerId tables." },
  character_regex_scripts: {
    scope: "junction",
    why: "D121-E character ↔ regex_script attachment; both parents are (a) ownerId tables, so the caller must own both ends.",
  },
  character_personas: { scope: "junction", why: "the M:N character ↔ persona association (producer: persona); both parents are (a) ownerId tables." },
  character_tags: { scope: "junction", why: "D23 derive-don't-stamp precedent — a required FK to an owned row on BOTH ends makes the owner always derivable." },
  chat_digest_speakers: { scope: "junction", why: "digest ↔ character speaker stamp; the digest side is (b) membership, the character side is (a)." },
  digest_theme_assignments: { scope: "junction", why: "digest ↔ theme_cluster analytics link; theme_clusters is per-owner, the digest is chat-anchored." },
  duplicate_character_pairs: { scope: "junction", why: "a derived near-duplicate PAIR — both characters must be the caller's (discovery computes per owner)." },
  duplicate_chat_pairs: { scope: "junction", why: "a derived near-duplicate PAIR over two chats — the caller must be a member of both." },
  message_assets: {
    scope: "junction",
    why: "the structural message ↔ asset link (#67) — the message side is (b), the asset side is (a); it exists so the ref registry can SEE an inline chat image.",
  },
  persona_books: { scope: "junction", why: "persona ↔ world_book attachment; both parents are (a) ownerId tables." },
  plugin_assets: {
    scope: "junction",
    why: "#802 plugin ↔ asset fetch link (`net.fetchAsset`); both parents are (a) ownerId tables and the write closes over BOTH — the pluginId from the bridge, the assetId minted by the CAS store under the installer — so neither end is guest-nameable. Like `message_assets` it exists so the asset-GC ref registry can SEE the reference; `fetched_at` is provenance riding the link, never a read key.",
  },
  roster_preset_members: {
    scope: "junction",
    why: "D61 B6 — roster_preset ↔ character seat; both parents are (a) ownerId tables (same owner, gated at the write verb), and the read joins through the preset. position/talkativeness/disabled are seat DATA riding the link, never a read key (the message_reactions posture).",
  },
  persona_tags: { scope: "junction", why: "persona ↔ tag attachment; both parents are (a) ownerId tables." },
  preset_tags: { scope: "junction", why: "preset ↔ tag attachment; both parents are (a) ownerId tables." },
  world_book_tags: { scope: "junction", why: "world_book ↔ tag attachment; both parents are (a) ownerId tables." },
  preset_regex_scripts: {
    scope: "junction",
    why: "D121-E preset ↔ regex_script attachment; both parents are (a) ownerId tables (a null-owner system preset matches no caller, so it is un-attachable by construction).",
  },

  // ── (d) parent-derived — scope inherits ONE owning FK; the read joins up. ──────────────────────────────
  roster_preset_rules: {
    scope: "parent",
    why: "B10's rules rider — a cast's captured automation RULE PRESETS. NOT `junction` even though it links two concepts: a rule preset is a CODE-catalogue id (`RULE_PRESET_IDS`), not a row, so there is no second independently-scoped parent to reach (the message_reactions reasoning) — scope derives through the ONE owning FK, presetId → roster_presets.ownerId (D23). rule_preset_id/position/knobs are captured DATA riding the link, never a read key.",
  },
  automation_rule_state: {
    scope: "parent",
    why: "S5 (C1) the run_analysis arm's plot state — scope derives ruleId → automation_rules (ownerId, chatId); D23-clean, no member/plugin read surface (interaction-direction-spec §3-S5.2).",
  },
  message_reactions: {
    scope: "parent",
    why: "B6/MR0 — scope derives variantId → message_variants → messages → chats → the roster (D23 derive-don't-stamp). It is NOT `junction`: both FKs land in the SAME room, so there is no second independently-scoped parent to reach; and NOT `membership`, because the row carries no chatId of its own. `reactorParticipantId` is DATA (which seat reacted, D80), never the read key (MA-2 §3/§4).",
  },
  character_embeddings: {
    scope: "parent",
    why: "derived vectors for a character — scope is `characters.ownerId` via the FK (embeddings stamps no owner, D23).",
  },
  character_keyword_profiles: { scope: "parent", why: "discovery's per-card keyword profile — scope derives through `characters`." },
  character_snapshots: { scope: "parent", why: "D28 the character history log — scope derives through `characters`; it gates nothing itself." },
  character_stats: { scope: "parent", why: "per-card economics — scope derives through `characters` (distinct from the (a) per-USER stats aggregates)." },
  character_summaries: { scope: "parent", why: "discovery's distillation — scope derives through `characters` (its verbs' headers state the owner join)." },
  document_chunks: { scope: "parent", why: "databank chunk vectors — scope derives through `documents.ownerId`." },
  gallery_items: {
    scope: "parent",
    why: "ownership DERIVES via `asset_id → assets.ownerId` (Nate ruling 2026-07-01, stated in the schema header); `subject_character_id` is a nullable label, not a second parent.",
  },
  global_regex_scripts: { scope: "parent", why: "D121-E: the always-on script set — a single PK/FK to `regex_scripts`, so scope is the script's owner." },
  regex_scripts: {
    scope: "ownerId",
    why: "D23 true producer — a script is the user's authored artifact with no owning parent to derive through (the world_books twin).",
  },
  global_books: { scope: "parent", why: "the always-on book set — a single PK/FK to `world_books`, so scope is the book's owner." },
  image_embeddings: { scope: "parent", why: "derived image vectors — scope derives through `assets.ownerId`." },
  image_index_skips: {
    scope: "parent",
    why: "the indexer's admission-floor skip-log — a single PK/FK to `assets`, so scope derives through `assets.ownerId` (no stamped owner, D20).",
  },
  message_variants: {
    scope: "parent",
    why: "D26 the generation record — scope derives through `messages` to the room; a variant carries no attribution of its own.",
  },
  notifications: {
    scope: "parent",
    why: "the per-user durable inbox — `recipientUserId` IS the single owning FK (a differently-spelled owner column, so it is not on the D23 stamp allowlist).",
  },
  refinery_runs: {
    scope: "parent",
    why: "refinery append-only run log — scope derives through `refinery_sessions` → `characters.ownerId` (two required FKs; docs/history/design/refinery-r0.md §3.1).",
  },
  refinery_sessions: {
    scope: "parent",
    why: "refinery session — anchored `character_id NOT NULL → characters.ownerId`; the D23 DERIVE class (no stamp), the gallery_items/imagery_generations precedent.",
  },
  rpg_checkpoints: { scope: "parent", why: "scope derives through `rpg_games` to the room; the snapshot FK is intra-aggregate." },
  rpg_journal: { scope: "parent", why: "scope derives through `rpg_games` to the room." },
  rpg_sheets: { scope: "parent", why: "scope derives through `rpg_games` to the room; `userId`/`characterId` are the sheet's SUBJECT, not the read scope." },
  rpg_snapshots: { scope: "parent", why: "scope derives through `rpg_games` to the room; empty anchor slots are snapshot FKs, never lost completions." },
  rpg_turn_tool_calls: {
    scope: "parent",
    why: "scope derives through `rpg_games` to the room — the read verb resolves MEMBERSHIP (a tool call is the record of a turn everyone at the table watched, not a GM secret), so the predicate is the game's chat, never an ownerId.",
  },
  sessions: {
    scope: "parent",
    why: "auth/BFF sessions — the single `userId` FK is the scope; reads are the session-resolution path, never a user-facing surface.",
  },
  user_settings: { scope: "parent", why: "the per-user config tier — natural-key PK `user_id` IS the FK and the scope." },
  world_entries: { scope: "parent", why: "book entries — scope derives through `world_books.ownerId`; entries stamp no owner (D23)." },

  // ── (e) global / system — no tenancy predicate exists. ─────────────────────────────────────────────────
  admin_distributed_plugins: {
    scope: "global",
    why: "D147(d) DEPLOYMENT POLICY — the set of plugin bundles an admin publishes to everyone. It has no tenant: `distributedBy` is a publisher-attribution stamp (and the CASCADE that lets that account be deleted), not a read scope, and the per-user INSTALLS it fans out to are ordinary owner-scoped `plugins` rows. Its authorization is the `requireAdmin` gate on the three distribution verbs, not a column.",
  },
  audit_logs: {
    scope: "global",
    why: "the append-only system log (writer: foundation/observability's `logAudit`); `actorUserId` is a SET-NULL attribution stamp, not a read scope — the log outlives its actor by design (D24).",
  },
  oidc_transactions: { scope: "global", why: "transient pre-identity auth state — there is no principal yet when it is written or read." },
  rate_limit_buckets: { scope: "global", why: "transport-tier counters (producer: transport/rate-limit.ts) — keyed by bucket, never by tenant." },
  settings: {
    scope: "global",
    why: "the global KV escape hatch (the reserved `app` AppSettings row + the OR catalog snapshot); the per-USER tier is the separate `user_settings` table.",
  },
  users: {
    scope: "global",
    why: "the tenancy ROOT — it is not scoped BY anything: reads are self (principal.userId) or admin-gated, enforced by `no-direct-users-read`, not by a scope column.",
  },
};

/** The drizzle table IDENTIFIERS whose SQL table is class (a) — a thin wrapper over the shared reader that
 *  bakes in THIS registry, so a sibling gate never re-derives the walk (`lib/tenancy-scope.ts`). */
export function ownerScopedTableIdents(model: SchemaModel): ReadonlySet<string> {
  return deriveOwnerScoped(model, (sqlName) => TABLE_SCOPING_CLASSES[sqlName]?.scope === "ownerId");
}

/** EVERY drizzle table identifier the schema declares — the sibling gates' denominator. */
export function schemaTableIdents(model: SchemaModel): ReadonlySet<string> {
  return deriveAllTables(model);
}

const MESSAGE =
  "every schema table must declare HOW a caller's tenancy reaches it — the scoping class (ownerId / " +
  "membership / junction / parent / global) that an authorization predicate is built from. Ownership is " +
  "INHERITED, not stamped (AGENTS §1): a table without an `ownerId` is not unscoped, its scope derives " +
  "through the FK chain — but WHICH chain has to be written down, once, where a reader and a gate can both " +
  "see it. Add a row to TABLE_SCOPING_CLASSES in tooling/src/verify/gates/table-scoping-class.ts. " +
  'A bare `"table"` token = UNCLASSIFIED (no row yet). Any other message = an INCOHERENCE: the row ' +
  "exists but the schema shape contradicts it — either the column/FK shape changed (re-classify the row) or " +
  "the declaration was always wrong.";

const FIX =
  "classify the table: `ownerId` (it carries the D23 stamp) · `membership` (it carries a chatId — authority " +
  "is chat_participants, D18) · `junction` (a pure link; BOTH parents must be reachable) · `parent` (scope " +
  "inherits ONE owning FK) · `global` (a system table with no tenancy). Write the reason — what an " +
  "authorization check for this table actually predicates on.";

const UNCLASSIFIED = "no TABLE_SCOPING_CLASSES row — classify it";

/** The INCOHERENCE KINDS — a closed vocabulary naming the SHAPE FACT that contradicts the declared class, so
 *  it does not move when a table gains an unrelated column. */
const INCOHERENCE_KINDS = ["no-owner-id", "stamped", "no-chat-id", "room-gated", "too-few-fks"] as const;
type IncoherenceKind = (typeof INCOHERENCE_KINDS)[number];

const INCOHERENCE_MESSAGE: Readonly<Record<IncoherenceKind, string>> = {
  "no-owner-id": "declared ownerId-scoped but declares no `ownerId` column",
  stamped: "carries an `ownerId` column, so its scope is the stamp, not the roster / two parents / a parent",
  "no-chat-id": "declared membership-scoped but carries no `chatId` column and is not the room table itself",
  "room-gated": "carries a `chatId` column, so the room gates it and it is `membership`-scoped",
  "too-few-fks": "a junction needs TWO independently-scoped parents (a parent needs one), and it declares fewer",
};

/** Which shape fact contradicts this table's declared class — or undefined when they agree. The check is
 *  FALSIFIABILITY, not derivation: `junction` vs `parent` is a judgment the row's reason carries, but a class
 *  whose defining column/FK is absent is a lie the machine CAN catch. */
function incoherence(sqlName: string, cls: ScopingClass, s: TableShape): IncoherenceKind | undefined {
  const checks: Readonly<Record<ScopingClass, () => IncoherenceKind | undefined>> = {
    ownerId: () => (s.hasOwnerId ? undefined : "no-owner-id"),
    membership: () => {
      if (s.hasOwnerId) {
        return "stamped";
      }
      return s.hasChatId || sqlName === ROOM_TABLE ? undefined : "no-chat-id";
    },
    junction: () => {
      if (s.hasOwnerId) {
        return "stamped";
      }
      if (s.hasChatId) {
        return "room-gated";
      }
      return s.fkCount >= 2 ? undefined : "too-few-fks";
    },
    parent: () => {
      if (s.hasOwnerId) {
        return "stamped";
      }
      if (s.hasChatId) {
        return "room-gated";
      }
      return s.fkCount >= 1 ? undefined : "too-few-fks";
    },
    global: () => {
      if (s.hasOwnerId) {
        return "stamped";
      }
      return s.hasChatId ? "room-gated" : undefined;
    },
  };
  return checks[cls]();
}

const BLIND =
  'table-scoping-class is keyed on the room table name "chats", which the schema no longer declares — the ' +
  "`membership` arm has gone blind (a name-keyed gate that resolves to nothing reports ✓ forever). Re-point " +
  "ROOM_TABLE in tooling/src/verify/gates/table-scoping-class.ts";

function stale(name: string): string {
  return `TABLE_SCOPING_CLASSES names "${name}" but the schema declares no such table — delete the stale row (two-direction ratchet).`;
}

/** Judge one schema table's row against its shape; reports and returns nothing — the caller only needs the
 *  `seen` bookkeeping, which it already has via `table.sqlName`. */
function judgeTable(ctx: GatePolicyContext, table: SchemaTable): void {
  const nameArg = table.call.getArguments()[0];
  if (nameArg === undefined) {
    return;
  }
  const token = nameArg.getText();
  const row = TABLE_SCOPING_CLASSES[table.sqlName];
  if (row === undefined) {
    ctx.report.node(nameArg, { token, offset: 0, message: UNCLASSIFIED });
    return;
  }
  const bad = incoherence(table.sqlName, row.scope, tableShapeOf(table));
  if (bad !== undefined) {
    ctx.report.node(nameArg, { token, offset: 0, message: `${bad} — ${INCOHERENCE_MESSAGE[bad]}` });
  }
}

/** The stale + blindness arms are WHOLE-SCHEMA claims, name-keyed against the LIVE registry: a conformance
 *  mini-project declares one table and would "prove" 86 rows dead. Guard on the real schema barrel actually
 *  being in the loaded population (own-tables-only's precedent). */
function reportStaleRows(ctx: GatePolicyContext, schemaFact: ReadySchemaFact<SchemaModel>, seen: ReadonlySet<string>): void {
  if (!schemaFact.receipt.paths.includes(SCHEMA_BARREL)) {
    return;
  }
  const anchor = ctx.files[0];
  if (anchor === undefined) {
    throw new Error("table-scoping-class received an empty effective population");
  }
  const anchorPath = ctx.relativePath(anchor);
  if (!seen.has(ROOM_TABLE)) {
    ctx.report.file(anchorPath, { message: BLIND });
  }
  for (const name of Object.keys(TABLE_SCOPING_CLASSES)) {
    if (!seen.has(name)) {
      ctx.report.file(anchorPath, { message: stale(name) });
    }
  }
}

export const gate = defineGate({
  id: "table-scoping-class",
  family: "tenancy-scope",
  authority: "hard",
  severity: "error",
  population: DRIZZLE_SCHEMA_POPULATION,
  analysis: "types",
  execution: "entire-population",
  facts: [drizzleSchemaFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const schemaFact = ctx.fact(drizzleSchemaFact).schema();
      recordReadySchemaFact(ctx, schemaFact);
      const seen = new Set<string>();
      for (const table of schemaFact.value.tables) {
        seen.add(table.sqlName);
        judgeTable(ctx, table);
      }
      reportStaleRows(ctx, schemaFact, seen);
    },
  }),

  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/x.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("brand_new_table", { id: text("id").primaryKey() });\n',
      },
      expect: { count: 1, token: '"brand_new_table"', messageIncludes: "classify it" },
      why: "the founding shape — a NEW table is unauthorizable until someone writes down which predicate scopes it. RED at birth, exactly like ownerid-registry's stamp arm",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("characters", { id: text("id").primaryKey() });\n',
      },
      expect: { count: 1, token: '"characters"', messageIncludes: "no-owner-id" },
      why: "the COHERENCE arm: `characters` is declared ownerId-scoped, so losing the stamp column must RED — a class map that only checked NAMES would silently keep asserting a dead predicate",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("messages", { id: text("id").primaryKey(), ownerId: text("owner_id") });\n',
      },
      expect: { count: 1, token: '"messages"', messageIncludes: "stamped" },
      why: "the D18 inversion: stamping an owner onto a membership-scoped chat child changes WHAT authorizes a read — the declaration and the schema must not silently disagree",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const characters = sqliteTable("characters", { id: text("id").primaryKey(), ownerId: text("owner_id") });\n',
        "packages/db/src/schema/tag.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nimport { characters } from "./character.ts";\nexport const t = sqliteTable("character_tags", { id: text("id").primaryKey(), characterId: text("character_id").references(() => characters.id) });\n',
      },
      expect: { count: 1, token: '"character_tags"', messageIncludes: "too-few-fks" },
      why: "a junction that lost a parent FK is no longer a junction — the derived arm catches the class drifting away from the shape",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/db/src/schema/character.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("characters", { id: text("id").primaryKey(), ownerId: text("owner_id") });\n',
      },
      why: "the (a) shape agreeing with its row — a stamped table declared ownerId-scoped",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("chats", { id: text("id").primaryKey() });\n',
      },
      why: "the ROOM table is its own membership anchor — it carries `id`, not `chatId`, and must NOT red (the name-keyed special case; its blindness tripwire only fires when the real schema barrel is loaded)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/chat.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const chats = sqliteTable("chats", { id: text("id").primaryKey() });\n',
        "packages/db/src/schema/message.ts":
          'import { chats } from "./chat.ts";\nexport const t = sqliteTable("messages", { id: text("id").primaryKey(), chatId: text("chat_id").references(() => chats.id) });\n',
      },
      why: "the (b) shape agreeing with its row — a chatId-bearing child is membership-scoped (D18)",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("settings", { key: text("key").primaryKey() });\n',
      },
      why: "the (e) shape — a system table with no owner column, no chatId and no FK is legitimately un-scoped",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/tag.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const t = sqliteTable("chat_tags", { chatId: text("chat_id"), tagId: text("tag_id"), ownerId: text("owner_id") });\n',
      },
      why: "DECLARED LIMIT / precedence: a row satisfying TWO classes takes the one an auth check actually spells. chat_tags carries BOTH chatId and ownerId and is (a) — D30 makes the tagger the scope subject, so the `membership` coherence check must not claim it",
    },
    {
      mode: "types",
      files: {
        "packages/db/src/schema/settings.ts":
          'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\nexport const settings = sqliteTable("settings", { key: text("key").primaryKey() });\n',
        "packages/db/src/schema/x.ts": "export const notATable = someOtherFn({ ownerId: 1 });\n",
      },
      why: "only `sqliteTable(name, {…})` calls are tables — no other call shape may enter the registry (the shared schema fact's own discovery, not this gate's, is what proves this); a real classified table rides along so the fact's own zero-member floor is not what this row is testing",
    },
  ],
});
