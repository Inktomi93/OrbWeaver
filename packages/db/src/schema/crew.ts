// schema/crew — the chat-crew state (producer: domain/crew, D59; tables specced in
// chat-crew-design/02 §4 + 06 §2). Four tables born WHOLE into the `0000_baseline` (the D58
// decide-before-launch economics — chunks CW2+ add NO tables): crew_chats · crew_plots ·
// crew_edit_proposals · crew_guides. All D23-CLEAN: every row reaches its authority through
// `chatId → chat_participants` (chats are membership-scoped, D18 — no `ownerId` stamps anywhere here).
//
// THE LOAD-BEARING DECISIONS encoded here:
//   • Counters are COLUMNS, config is a BLOB (crew_chats): the counters mutate per-turn and must be
//     atomic `sql` increments (the buddy `bondXp` lesson — never read-modify-write a blob across a
//     multi-second gap); the config mutates rarely and versions as ONE `crewConfigSchema` blob,
//     lazy-parsed at the read seam (the `chats.metadata` discipline).
//   • crew_plots is the director's HIDDEN HAND — host-ring data (the member/host projection split is
//     domain+transport law, not schema). Typed columns, not an agent-KV bag: queryable (the host plot
//     panel), schema-validated at the edges (the D58 "typed tables replace the metadata blob" delta).
//   • Edit proposals key on the VARIANT (swipe-safety): the partial unique index enforces ONE `pending`
//     proposal per variant (a re-run REPLACES — the buddy proposal-Map semantic made durable); the
//     `superseded`/`stale` flips are LAZY accept-time checks against `selectedVariantId`/`auditedHash`
//     (chat-crew-design/02 §9), never eager swipe listeners.
//   • crew_guides is DEFINITION ONLY — the guide CONTENT's one home is the `chat_injections` row linked
//     by `injectionId` (a real branded FK, never a magic-id format — design-review CREW-1). NULL
//     injectionId ⇔ no content yet / flushed. `role` derives MESSAGE_ROLES (D32 — no re-spell).
//
// Enum columns derive their ONE canonical tuple (`CREW_EDIT_PROPOSAL_STATUSES` ←
// `@orb/contracts/crew`; `MESSAGE_ROLES` ← `@orb/kit/message-role`) with a tuple-built CHECK
// (a CHECK is static DDL — no bound parameters; users.ts pattern).

import type { CrewConfig, CrewEditNote } from "@orb/contracts/crew";
import { CREW_EDIT_PROPOSAL_STATUSES } from "@orb/contracts/crew";
import type {
  ChatId,
  ChatInjectionId,
  CrewEditProposalId,
  MessageId,
  MessageVariantId,
} from "@orb/kit/ids";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  // biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use the supported primaryKey({ columns }) object form below.
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { chatInjections, chats, messages, messageVariants } from "./chat";

// CHECK list derived from the canonical tuple (NOT re-spelled) — static DDL fragment.
function checkList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(", ");
}

// The default injection role for a guide (gg: `injectionEndRole` — chat-crew-design/06 §2).
const DEFAULT_GUIDE_ROLE = "system";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// crew_chats — one row per crew-enabled chat (created on first `setConfig`). The config blob + the three
// cadence cursors: high-water seq marks (keeper/card-evolution — advance ONLY on run success, inside the
// applier's transaction) and the director's assistant-turn counter (scheduler-bumped atomic increment).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const crewChats = sqliteTable("crew_chats", {
  // NATURAL PK: the chat's own id (one crew per chat) + CASCADE FK (brand flows the FK) — the
  // chat_locks pattern.
  chatId: text("chat_id")
    .$type<ChatId>()
    .primaryKey()
    .references(() => chats.id, { onDelete: "cascade" }),
  // The versioned crew config — zod-parsed on read against `crewConfigSchema` (the `chats.metadata`
  // lazy-parse discipline; a malformed blob falls back to defaults, never nukes the row).
  config: text("config", { mode: "json" }).$type<CrewConfig>(),
  // High-water mark: last message seq the keeper has processed. Advances ONLY on run success.
  keeperLastSeq: integer("keeper_last_seq").notNull().default(0),
  // Same, for the card-evolution auditor.
  cardEvolutionLastSeq: integer("card_evolution_last_seq").notNull().default(0),
  // Assistant turns since the last director pass (scheduler-bumped, atomic `sql` increment).
  directorTurnCounter: integer("director_turn_counter").notNull().default(0),
  createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// crew_plots — the director's hidden hand (one row per chat, created on first director pass). Advisory-
// only: the director holds no canon claims, only intent — `lastPassSeq` is a cursor, not a truth claim,
// so a swipe can never contradict it (chat-crew-design/02 §9).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const crewPlots = sqliteTable("crew_plots", {
  chatId: text("chat_id")
    .$type<ChatId>()
    .primaryKey()
    .references(() => chats.id, { onDelete: "cascade" }),
  // The secret story arc (model-authored, host-ring).
  arc: text("arc").notNull(),
  // The active twist bank (≤ TWIST_CAP — the applier enforces the cap, not the schema).
  twists: text("twists", { mode: "json" }).$type<readonly string[]>(),
  // Fired/abandoned twists — audit trail; feeds the next pass so twists don't resurrect.
  retiredTwists: text("retired_twists", { mode: "json" }).$type<readonly string[]>(),
  // The CURRENT injection content the director authored — GATHER reads it VERBATIM (no per-turn
  // recompute; freshness is the cadence's job).
  guidance: text("guidance").notNull(),
  // Max message seq the last pass saw.
  lastPassSeq: integer("last_pass_seq").notNull(),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// crew_edit_proposals — the prose auditor's queue. Keys on the VARIANT (swipe-safety); `auditedHash` is
// the stale-accept guard; `originalContent` is stamped AT ACCEPT (backs "restore original" — the
// marinara restore-original lesson).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const crewEditProposals = sqliteTable(
  "crew_edit_proposals",
  {
    // TypeID PK (`crewprop_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<CrewEditProposalId>().primaryKey(),
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // The audited slot.
    messageId: text("message_id")
      .$type<MessageId>()
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    // The audited variant (the swipe-safety key — chat-crew-design/02 §9).
    variantId: text("variant_id")
      .$type<MessageVariantId>()
      .notNull()
      .references(() => messageVariants.id, { onDelete: "cascade" }),
    // The full replacement text.
    proposedContent: text("proposed_content").notNull(),
    // The rationale chips — `{kind: prose|continuity, note}[]`, parsed at the read seam.
    notes: text("notes", { mode: "json" }).$type<readonly CrewEditNote[]>(),
    // SHA-256 of the variant content AT audit time (the stale-accept guard).
    auditedHash: text("audited_hash").notNull(),
    // Stamped AT ACCEPT with the pre-edit text. Null until accepted.
    originalContent: text("original_content"),
    // pending | accepted | dismissed | superseded | stale — derives CREW_EDIT_PROPOSAL_STATUSES.
    status: text("status", { enum: CREW_EDIT_PROPOSAL_STATUSES }).notNull().default("pending"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    resolvedAt: integer("resolved_at"),
  },
  (t) => [
    // ONE pending proposal per variant — a re-run REPLACES (the buddy replace-on-new semantic, durable).
    uniqueIndex("crew_edit_proposals_pending_variant_unique")
      .on(t.variantId)
      .where(sql`status = 'pending'`),
    check(
      "crew_edit_proposals_status_check",
      sql.raw(`status in (${checkList(CREW_EDIT_PROPOSAL_STATUSES)})`),
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// crew_guides — the persistent-guide DEFINITIONS (chat-crew-design/06 §2). Composite PK (chatId,
// guideKey); the CONTENT lives only in the linked chat_injections row. `injectionId` SET NULL: deleting
// the injection (flush) never deletes the definition.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const crewGuides = sqliteTable(
  "crew_guides",
  {
    chatId: text("chat_id")
      .$type<ChatId>()
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    // The definition slug (`thinking`, `clothes`, custom slugs).
    guideKey: text("guide_key").notNull(),
    // The guide's content row (CREW-1 linkage — a real branded FK). NULL ⇔ no content yet / flushed.
    injectionId: text("injection_id")
      .$type<ChatInjectionId>()
      .references(() => chatInjections.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    // The side-generation prompt (user-editable; packaged guides SEED it — editing never mutates the
    // packaged constant).
    template: text("template").notNull(),
    // Injection depth (per-guide — the extension's per-guide depthPrompt* knobs, kept).
    depth: integer("depth").notNull(),
    // FLEXIBLE role (some APIs mistreat mid-conversation `system`) — the canonical MESSAGE_ROLES axis
    // (D32, no re-spell); default `system`.
    role: text("role", { enum: MESSAGE_ROLES }).notNull().default(DEFAULT_GUIDE_ROLE),
    // 1 = wrap output in the guide's label frame; 0 = raw injection (raw-vs-labeled on the OUTPUT).
    labeled: integer("labeled", { mode: "boolean" }).notNull().default(true),
    // Re-run after each completed assistant turn (+1 completion per turn — packaged guides ship false).
    autoRefresh: integer("auto_refresh", { mode: "boolean" }).notNull().default(false),
    // Disabled = definition kept, injection flushed.
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    // Display + staleness hint.
    lastRefreshSeq: integer("last_refresh_seq"),
    lastRefreshAt: integer("last_refresh_at"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.chatId, t.guideKey] }),
    check("crew_guides_role_check", sql.raw(`role in (${checkList(MESSAGE_ROLES)})`)),
  ],
);
