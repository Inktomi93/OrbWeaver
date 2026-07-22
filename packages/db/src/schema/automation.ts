// schema/automation — the D46 automation slice (producer: domain/automation, Phase 8; DDL specced in
// automation-design/04 §1 + 02 §4). Four tables born into the `0000_baseline` (decide-before-launch —
// the domain lands later with NO table rebuilds): automation_rules · automation_budgets ·
// automation_fires · global_variables.
//
// THE LOAD-BEARING DECISIONS encoded here (automation-design/04 §1):
//   • `automation_rules.chat_id` is NULLABLE FROM BIRTH; v1 verbs refuse NULL. An owner-global rule is a
//     plausible v2 — the nullable column makes it additive (the D37 born-whole posture).
//   • Rules are born DISABLED (`enabled` default 0) — enabling is the consent act.
//   • Actions are ONE json column, not a child table: an ordered value-object list (1..8) with no
//     independent identity. Zod-validated at write, LAZY-parsed at read with the chat-metadata
//     fault-isolation pattern (a corrupt row disables that rule with `last_error`, never nukes the
//     chat's rule list). Typed opaque here — the `AutomationAction` union lands with the domain (doc 03).
//   • The fire log is a REAL TABLE, not counters: it IS the per-hour budget source (indexed COUNT), the
//     host's "why didn't my rule fire" answer, and testRun provenance — three consumers, one table.
//   • `global_variables` has NO TypeID/surrogate id: nothing FKs it; the natural key (owner_id, key) IS
//     the identity (02 §4). Single-owned `fetchOwned` plane — a user can never read another's globals.
//
// The `trigger_bus`/`trigger_type` pair derives the closed trigger taxonomy from
// `@orb/contracts/automation` (the D34 promotion — db deps are kit + contracts only): a PAIRED CHECK
// binds each bus to ITS tuple (the chat_participants kind-shape pattern), so a domain-trigger name on
// the chat bus is unrepresentable. `outcome` derives AUTOMATION_FIRE_OUTCOMES the same way. CHECKs are
// static DDL built from the tuples — never re-spelled (users.ts pattern).

import type { ChatTriggerType, DomainTriggerType } from "@orb/contracts/automation";
import {
  AUTOMATION_CHAT_BUDGET_DEFAULTS,
  AUTOMATION_FIRE_OUTCOMES,
  AUTOMATION_TRIGGER_BUSES,
  CHAT_TRIGGER_TYPES,
  DOMAIN_TRIGGER_TYPES,
  GLOBAL_VARIABLE_KEY_MAX_CHARS,
  GLOBAL_VARIABLE_VALUE_MAX_BYTES,
} from "@orb/contracts/automation";
import type { AutomationFireId, AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  // biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use the supported primaryKey({ columns }) object form below.
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { chats } from "./chat";
import { users } from "./users";

// CHECK list derived from the canonical tuple (NOT re-spelled) — static DDL fragment.
function checkList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(", ");
}

// Named numeric bounds/defaults (`noMagicNumbers`) — automation-design/04 §1 + 02 §4 values.
const RULE_NAME_MAX_CHARS = 120;
const RULE_MAX_FIRES_PER_HOUR_DEFAULT = 30;
// The chat budget + global-variable caps derive from @orb/contracts/automation (the ONE home — the
// app-validation verb and this CHECK-DDL/column-default share the same bound, so they can't drift).
// SQLite `length()` on TEXT counts CHARACTERS — the BLOB cast in the value CHECK below makes the
// 64 KiB cap byte-accurate.

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// automation_rules — one row per host-authored rule: trigger + CEL predicate + ordered action arms.
// Ordering is the explicit `position` (host-reorderable total order — ST users reason positionally);
// `consecutive_errors`/`last_error` back the auto-disable-at-20 + the host debug surface (04 §3).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const automationRules = sqliteTable(
  "automation_rules",
  {
    // TypeID PK (`automation_rule_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<AutomationRuleId>().primaryKey(),
    // The AUTHOR (v1: the host). Rules run as their author (03 §2) — authority is re-checked per fire.
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // NULL = owner-global (BORN nullable, NOT wired v1 — v1 verbs refuse NULL; see header).
    chatId: text("chat_id")
      .$type<ChatId>()
      .references(() => chats.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Born disabled — enabling is the consent act.
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    // Explicit order among a chat's rules (list-reorderable; order is SEMANTICS — arms mutate the
    // shared variable env, 04 §3).
    position: integer("position").notNull(),
    // chat | domain — derives AUTOMATION_TRIGGER_BUSES; the paired CHECK below binds bus ↔ type tuple.
    triggerBus: text("trigger_bus", { enum: AUTOMATION_TRIGGER_BUSES }).notNull(),
    // A member of the bus's trigger tuple (the source event discriminator — 01 §0: no third
    // vocabulary). Typed to the union; the paired CHECK is the SQL-side guard (no single-tuple `enum`
    // fits a two-tuple column).
    triggerType: text("trigger_type").$type<ChatTriggerType | DomainTriggerType>().notNull(),
    // NULL = always fire (trigger + budgets still gate). Parse-validated at write (02 §1).
    predicateCel: text("predicate_cel"),
    // The ordered action arms — `AutomationAction[]` (doc 03; the union lands with the domain).
    // Zod-validated at write + lazy-parsed at read (fault-isolation — see header).
    actions: text("actions", { mode: "json" }).$type<readonly Record<string, unknown>[]>().notNull(),
    // The cascade opt-in (03 §4) — without it, automation-initiated events never re-trigger rules.
    matchAutomationEvents: integer("match_automation_events", { mode: "boolean" }).notNull().default(false),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(0),
    maxFiresPerHour: integer("max_fires_per_hour").notNull().default(RULE_MAX_FIRES_PER_HOUR_DEFAULT),
    // Increments on predicate_error/action_error, resets on a clean fire; auto-disable at 20 (02 §1).
    consecutiveErrors: integer("consecutive_errors").notNull().default(0),
    // The last skip reason (host debug surface).
    lastError: text("last_error"),
    lastFiredAt: integer("last_fired_at"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The dispatch hot path: enabled rules of a chat for one trigger (04 §1).
    index("automation_rules_chat_enabled").on(t.chatId, t.enabled, t.triggerType),
    check("automation_rules_name_check", sql.raw(`length(name) <= ${RULE_NAME_MAX_CHARS}`)),
    check("automation_rules_trigger_bus_check", sql.raw(`trigger_bus in (${checkList(AUTOMATION_TRIGGER_BUSES)})`)),
    // The bus↔tuple pairing (the kind-shape CHECK pattern): each bus admits ONLY its own tuple's
    // members, both derived from the contracts tuples — a cross-bus trigger name is unrepresentable.
    check(
      "automation_rules_trigger_type_check",
      sql.raw(
        `(trigger_bus = 'chat' AND trigger_type in (${checkList(CHAT_TRIGGER_TYPES)})) OR (trigger_bus = 'domain' AND trigger_type in (${checkList(DOMAIN_TRIGGER_TYPES)}))`,
      ),
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// automation_budgets — ONE row per chat with automation (host-editable — 03 §3). The per-chat spend
// ceilings; `usd_spent_today`/`spend_day` is the reset-on-rollover day accumulator (UTC yyyy-mm-dd from
// the injected clock).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const automationBudgets = sqliteTable("automation_budgets", {
  // NATURAL PK: the chat's own id + CASCADE FK (the chat_locks pattern).
  chatId: text("chat_id")
    .$type<ChatId>()
    .primaryKey()
    .references(() => chats.id, { onDelete: "cascade" }),
  maxFiresPerHour: integer("max_fires_per_hour").notNull().default(AUTOMATION_CHAT_BUDGET_DEFAULTS.maxFiresPerHour),
  maxSpendActionsPerDay: integer("max_spend_actions_per_day").notNull().default(AUTOMATION_CHAT_BUDGET_DEFAULTS.maxSpendActionsPerDay),
  // NULL = no dollar ceiling (local-only setups).
  maxUsdPerDay: real("max_usd_per_day").default(AUTOMATION_CHAT_BUDGET_DEFAULTS.maxUsdPerDay),
  usdSpentToday: real("usd_spent_today").notNull().default(0),
  // UTC yyyy-mm-dd from the injected clock; reset-on-rollover. '' = never spent.
  spendDay: text("spend_day").notNull().default(""),
  updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// automation_fires — the fire log: audit + budget counting + testRun provenance. Reaped by a retention
// sweep (domain concern, not schema). `outcome` derives AUTOMATION_FIRE_OUTCOMES; `detail` carries the
// per-arm results / the error / the rendered previews (test_run), parsed at the read seam.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const automationFires = sqliteTable(
  "automation_fires",
  {
    // TypeID PK (`automation_fire_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<AutomationFireId>().primaryKey(),
    ruleId: text("rule_id")
      .$type<AutomationRuleId>()
      .notNull()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    // Nullable — mirrors the rule's own chat scope (an owner-global rule's fire has no chat).
    chatId: text("chat_id")
      .$type<ChatId>()
      .references(() => chats.id, { onDelete: "cascade" }),
    // The trigger that fired — denormalized for the debug surface (the rule row may since be edited).
    triggerType: text("trigger_type").$type<ChatTriggerType | DomainTriggerType>().notNull(),
    // The dispatch terminal — derives AUTOMATION_FIRE_OUTCOMES (04 §1).
    outcome: text("outcome", { enum: AUTOMATION_FIRE_OUTCOMES }).notNull(),
    // Per-arm results / the error / the rendered previews (test_run) — open JSON, read-seam parsed.
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
    // 0 = human-initiated; the cascade-depth ledger (03 §4).
    automationDepth: integer("automation_depth").notNull().default(0),
    firedAt: integer("fired_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The per-hour budget COUNT + the host's per-rule fire history, one indexed read (04 §1).
    index("automation_fires_rule_time").on(t.ruleId, t.firedAt),
    check("automation_fires_outcome_check", sql.raw(`outcome in (${checkList(AUTOMATION_FIRE_OUTCOMES)})`)),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// global_variables — the per-user cross-chat KV plane (automation-design/02 §4). String plane;
// JSON-in-a-string for structure. NO chat/variant/fork semantics by D46 law — a swipe never rewinds a
// global. `fetchOwned` scoping (ownerId in WHERE); no admin bypass surface (the D18 single-owned posture).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const globalVariables = sqliteTable(
  "global_variables",
  {
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The natural key IS the identity — no TypeID, no surrogate (02 §4).
    primaryKey({ columns: [t.ownerId, t.key] }),
    check("global_variables_key_check", sql.raw(`length(key) <= ${GLOBAL_VARIABLE_KEY_MAX_CHARS}`)),
    // ≤ 64 KiB of BYTES — length() on TEXT counts characters, so cast to BLOB for the byte cap.
    check("global_variables_value_check", sql.raw(`length(cast(value as blob)) <= ${GLOBAL_VARIABLE_VALUE_MAX_BYTES}`)),
  ],
);
