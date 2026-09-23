// schema/automation — the D46 automation slice (producer: domain/automation). Five tables, born in the
// `0000_baseline` (decide-before-launch — the domain lands with NO table rebuilds):
// automation_rules · automation_owner_budgets · automation_fires · automation_rule_state ·
// global_variables (a sixth, the per-chat `automation_budgets`, was dropped by the
// `drop_automation_budgets` forward migration: the per-chat fire-rate cap is the fixed
// `AUTOMATION_CHAT_MAX_FIRES_PER_HOUR`, with no stored override).
//
// THE LOAD-BEARING DECISIONS encoded here:
//   • `automation_rules.chat_id` is NULLABLE FROM BIRTH, and C5 WIRED IT: NULL = an owner-global rule,
//     admitted by `createRule` under an owner check and dispatched by the domain-bus lane. The column was
//     born nullable for exactly this (the D37 born-whole posture) — the widening was additive, as promised.
//   • Rules are born DISABLED (`enabled` default 0) — enabling is the consent act.
//   • Actions are ONE json column, not a child table: an ordered value-object list (1..8) with no
//     independent identity. Zod-validated at write, LAZY-parsed at read with the chat-metadata
//     fault-isolation pattern (a corrupt row disables that rule with `last_error`, never nukes the
//     chat's rule list). Typed opaque here — the `AutomationAction` union lands with the domain.
//   • The fire log is a REAL TABLE, not counters: it IS the per-hour budget source (indexed COUNT), the
//     host's "why didn't my rule fire" answer, and testRun provenance — three consumers, one table.
//   • `global_variables` has NO TypeID/surrogate id: nothing FKs it; the natural key (owner_id, key) IS
//     the identity. Single-owned `fetchOwned` plane — a user can never read another's globals.
//
// The `trigger_bus`/`trigger_type` pair derives the closed trigger taxonomy from
// `@orb/contracts/automation` (the D34 promotion — db deps are kit + contracts only): a PAIRED CHECK
// binds each bus to ITS tuple (the chat_participants kind-shape pattern), so a domain-trigger name on
// the chat bus is unrepresentable. Public fire terminals derive from AUTOMATION_FIRE_OUTCOMES; storage adds
// one internal `reserved` admission state that list projections never expose. CHECKs are static DDL built
// from the tuples — never re-spelled (users.ts pattern).

import type { ChatTriggerType, DomainTriggerType, RulePresetId, RulePresetKnobValues } from "@orb/contracts/automation";
import {
  ANALYSIS_GUIDANCE_MAX,
  AUTOMATION_FIRE_OUTCOMES,
  AUTOMATION_OWNER_BUDGET_DEFAULTS,
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
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { checkList } from "../kit/check-list.ts";
import { chats } from "./chat.ts";
import { users } from "./users.ts";

// Named numeric bounds/defaults (`noMagicNumbers`).
const RULE_NAME_MAX_CHARS = 120;
const RULE_MAX_FIRES_PER_HOUR_DEFAULT = 30;
/** Storage admits one in-flight state beyond the public terminal vocabulary. */
export const AUTOMATION_FIRE_STORAGE_OUTCOMES = [...AUTOMATION_FIRE_OUTCOMES, "reserved"] as const;
// The owner budget + global-variable caps derive from @orb/contracts/automation (the ONE home — the
// app-validation verb and this CHECK-DDL/column-default share the same bound, so they can't drift).
// SQLite `length()` on TEXT counts CHARACTERS — the BLOB cast in the value CHECK below makes the
// 64 KiB cap byte-accurate.

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// automation_rules — one row per host-authored rule: trigger + CEL predicate + ordered action arms.
// Ordering is the explicit `position` (host-reorderable total order — ST users reason positionally);
// `consecutive_errors`/`last_error` back the auto-disable-at-20 + the host debug surface.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const automationRules = sqliteTable(
  "automation_rules",
  {
    // TypeID PK (`automation_rule_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<AutomationRuleId>().primaryKey(),
    // The AUTHOR (v1: the host). Rules run as their author — authority is re-checked per fire.
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // NULL = owner-global — WIRED at C5 (`createRule` admits NULL under the owner check; the rate belt is
    // `automation_owner_budgets`). A global rule's arms are restricted to the chat-INDEPENDENT set.
    chatId: text("chat_id")
      .$type<ChatId>()
      .references(() => chats.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Born disabled — enabling is the consent act.
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
    // Explicit order among a chat's rules (list-reorderable; order is SEMANTICS — arms mutate the
    // shared variable env).
    position: integer("position").notNull(),
    // chat | domain — derives AUTOMATION_TRIGGER_BUSES; the paired CHECK below binds bus ↔ type tuple.
    triggerBus: text("trigger_bus", { enum: AUTOMATION_TRIGGER_BUSES }).notNull(),
    // A member of the bus's trigger tuple (the source event discriminator — no third vocabulary).
    // Typed to the union; the paired CHECK is the SQL-side guard (no single-tuple `enum` fits a
    // two-tuple column).
    triggerType: text("trigger_type").$type<ChatTriggerType | DomainTriggerType>().notNull(),
    // NULL = always fire (trigger + budgets still gate). Parse-validated at write.
    predicateCel: text("predicate_cel"),
    // ── MINT PROVENANCE (the §3-S3 flip shape, landed with B10's saved-cast rules rider) ──
    // Which RULE PRESET minted this rule, and with which RESOLVED knob bag. Stamped ONLY by
    // `createRuleFromPreset`; CLEARED by `updateRule` (a hand-edited rule is no longer the preset's mint);
    // both-or-neither by the paired CHECK below. NO FK and NO CHECK on the id — rule presets are a CODE
    // catalogue (`RULE_PRESET_IDS`, @orb/contracts/automation), not rows, and the tuple GROWS by design
    // (a DDL pin would turn every catalogue addition into a merge-window schema change). A stored id a
    // later catalogue removal orphans degrades at the read/apply seam (reported skip), never at rest.
    rulePresetId: text("rule_preset_id").$type<RulePresetId>(),
    // The complete resolved bag (`resolveRulePresetKnobs` output) — zod-validated at mint, typed opaque
    // here (the `actions` posture).
    rulePresetKnobs: text("rule_preset_knobs", { mode: "json" }).$type<RulePresetKnobValues>(),
    // The ordered action arms — `AutomationAction[]` (the union lands with the domain).
    // Zod-validated at write + lazy-parsed at read (fault-isolation — see header).
    actions: text("actions", { mode: "json" }).$type<readonly Record<string, unknown>[]>().notNull(),
    // The cascade opt-in — without it, automation-initiated events never re-trigger rules.
    matchAutomationEvents: integer("match_automation_events", { mode: "boolean" }).notNull().default(false),
    // RULED F4's per-rule OPT-OUT (interaction-direction-spec row B4). TRUE = a rate refusal of this rule
    // raises the "run it now?" INVITATION (the ruling's default — today's shipped behaviour, which is why
    // the column defaults on); FALSE = this one rule stays quiet when its budget refuses it. Read at the
    // dispatch gate (`engine/dispatch.ts::inviteOnRefusal`) BESIDE the arm-shape derivation, never instead
    // of it: the arms still decide whether a refusal COULD earn an ask, and this decides whether the host
    // still wants one. Operational state like `enabled` — its own targeted setter, so it is neither part of
    // the create/update PUT nor of the mint-provenance biconditional below.
    suggestOnRefusal: integer("suggest_on_refusal", { mode: "boolean" }).notNull().default(true),
    cooldownSeconds: integer("cooldown_seconds").notNull().default(0),
    maxFiresPerHour: integer("max_fires_per_hour").notNull().default(RULE_MAX_FIRES_PER_HOUR_DEFAULT),
    // Increments on predicate_error/action_error, resets on a clean fire; auto-disable at 20.
    consecutiveErrors: integer("consecutive_errors").notNull().default(0),
    // The last skip reason (host debug surface).
    lastError: text("last_error"),
    lastFiredAt: integer("last_fired_at"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The dispatch hot path: enabled rules of a chat for one trigger.
    index("automation_rules_chat_enabled").on(t.chatId, t.enabled, t.triggerType),
    // The owner CASCADE parent + the owner-global rule list: SQLite auto-indexes no child FK, so a user
    // hard-delete would scan every rule (`fk-columns-indexed` gate).
    index("automation_rules_owner_idx").on(t.ownerId),
    check("automation_rules_name_check", sql.raw(`length(name) <= ${RULE_NAME_MAX_CHARS}`)),
    // Provenance is both-or-neither — a half-stamped row (an id with no bag, a bag with no id) is
    // unrepresentable, so every reader may treat one field's presence as the pair's.
    check("automation_rules_rule_preset_check", sql.raw("(rule_preset_id IS NULL) = (rule_preset_knobs IS NULL)")),
    check("automation_rules_trigger_bus_check", sql.raw(`trigger_bus in (${checkList(AUTOMATION_TRIGGER_BUSES)})`)),
    // The bus↔tuple pairing (the kind-shape CHECK pattern): each bus admits ONLY its own tuple's
    // members, both derived from the contracts tuples — a cross-bus trigger name is unrepresentable.
    check(
      "automation_rules_trigger_type_check",
      sql.raw(
        `(trigger_bus = 'chat' AND trigger_type in (${checkList(CHAT_TRIGGER_TYPES)})) OR (trigger_bus = 'domain' AND trigger_type in (${checkList(DOMAIN_TRIGGER_TYPES)}))`,
      ),
    ),
    // #1378 item 2 — the rate/health counters. Zero references existed and all three are magnitudes: a
    // negative cooldown is a cooldown that already elapsed, a negative budget admits nothing coherent,
    // and a negative error count cannot be reached by an increment-or-reset counter. The physical floor
    // under what `engine/dispatch.ts` already maintains.
    check("automation_rules_counters_check", sql.raw("cooldown_seconds >= 0 and max_fires_per_hour >= 0 and consecutive_errors >= 0")),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// automation_owner_budgets — ONE row per OWNER with owner-global automation (C5). The per-chat belt counts
// a chat's fires against a fixed ceiling and so cannot bound a chat-less rule; this owner-keyed, owner-editable
// ceiling is the SCOPE belt for that lane. A runaway owner-global rule otherwise multiplies by the author's
// entire library rather than by one room — the exact hammering this belt exists to bound. A RATE cap only:
// the per-day $/spend ceilings were stripped 2026-07-24 and nothing here re-introduces them.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const automationOwnerBudgets = sqliteTable(
  "automation_owner_budgets",
  {
    // NATURAL PK: the owner's own id + CASCADE FK (the chat_locks pattern) — the PK is also the child-FK
    // index in one column (`fk-columns-indexed` satisfied).
    ownerId: text("owner_id")
      .$type<UserId>()
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    maxFiresPerHour: integer("max_fires_per_hour").notNull().default(AUTOMATION_OWNER_BUDGET_DEFAULTS.maxFiresPerHour),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  // #1378 item 2 — the owner-wide budget is a magnitude like the per-rule one above.
  () => [check("automation_owner_budgets_budget_check", sql.raw("max_fires_per_hour >= 0"))],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// automation_fires — the fire ledger: audit + atomic budget admission + testRun provenance. Public terminals
// derive AUTOMATION_FIRE_OUTCOMES; `reserved` is storage-only and hidden at the read seam. `detail` carries
// the per-arm results / the error / the rendered previews (test_run), parsed at that seam.
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
    // Public dispatch terminal OR the internal in-flight budget reservation.
    outcome: text("outcome", { enum: AUTOMATION_FIRE_STORAGE_OUTCOMES }).notNull(),
    // Per-arm results / the error / the rendered previews (test_run) — open JSON, read-seam parsed.
    detail: text("detail", { mode: "json" }).$type<Record<string, unknown>>(),
    // 0 = human-initiated; the cascade-depth ledger.
    automationDepth: integer("automation_depth").notNull().default(0),
    firedAt: integer("fired_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // The per-hour budget COUNT + the host's per-rule fire history, one indexed read.
    index("automation_fires_rule_time").on(t.ruleId, t.firedAt),
    // The chat CASCADE parent — a chat delete would scan the whole fire log without it, and the
    // (ruleId, firedAt) index cannot serve a chatId-only predicate (`fk-columns-indexed` gate).
    index("automation_fires_chat_idx").on(t.chatId),
    check("automation_fires_outcome_check", sql.raw(`outcome in (${checkList(AUTOMATION_FIRE_STORAGE_OUTCOMES)})`)),
    // #1378 item 3 — the HISTORICAL table was looser than the live one. `automation_rules.trigger_type`
    // is bus-paired above; the fire ledger's denormalized copy had no CHECK at all, so the audit trail
    // could record a trigger name the rules table would refuse. It carries no `trigger_bus` column of its
    // own, so the pairing is not available here — the honest constraint is membership of the UNION of
    // both tuples, which is still the whole vocabulary and closes the gap between the two tables.
    check("automation_fires_trigger_type_check", sql.raw(`trigger_type in (${checkList([...CHAT_TRIGGER_TYPES, ...DOMAIN_TRIGGER_TYPES])})`)),
    // #1378 item 2 (the fire ledger's half) — the cascade-depth ledger is a count of nested automation
    // hops. 0 is human-initiated and it only ever increments.
    check("automation_fires_depth_check", sql.raw("automation_depth >= 0")),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// automation_rule_state — ONE row per rule with a `run_analysis` arm (S5, interaction-direction-spec §3-S5):
// the arm's durable per-chat plot state (arc + twist banks + the settled-span HIGH-WATER MARK, inside the
// `state` JSON) and the ONE narrator-facing `guidance` line the S2 teaching contribution delivers VERBATIM.
// Authority DERIVES ruleId → rule (ownerId, chatId) — no ownerId here (D23-clean; the D18 inherited-scope
// posture), no member or plugin read surface, and NOT swipe-folded (authored DIRECTION, never a function of
// canon — the #29 fence: a rebuild from canon could not reproduce it, so it is never rebuilt).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const automationRuleState = sqliteTable(
  "automation_rule_state",
  {
    // NATURAL PK: the rule's own id + CASCADE FK (the `automation_owner_budgets` ownerId-PK pattern above) — the
    // PK is also the spec's UNIQUE and the child-FK index in one column (`fk-columns-indexed` satisfied).
    ruleId: text("rule_id")
      .$type<AutomationRuleId>()
      .primaryKey()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    // The analysis state blob — `{arc, twists, retiredTwists, settledThroughSeq}`. Typed opaque here (the
    // shape lands with the domain — the `automation_rules.actions` posture); zod parse-on-read with
    // corrupt→EMPTY fault isolation (losing analysis state costs one cold pass, never a disabled rule).
    // `settledThroughSeq` is the C2 high-water mark: the settled-span cursor DURABLE-WRITE routes advance
    // ONLY on a successful apply, so a failed/unconfirmed pass re-covers its span (the retryability law).
    // VERSION POSTURE (orchestrator ruling 2026-08-24): "corrupt" means UNPARSEABLE, never merely OLD —
    // every field of the read schema carries a default, so a row written before a field existed reads
    // with that field defaulted and its WATERMARK PRESERVED. Only non-JSON / non-object garbage resets to
    // empty (watermark 0 = re-cover, which duplicates work but never SKIPS a span). A reader that treated
    // a schema-version mismatch as corruption would discard a valid watermark and re-distill an
    // already-covered span into duplicate lore — pinned in the domain's rule-state tests.
    state: text("state", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    // ONE narrator-facing instruction, stored VERBATIM (machine-authored DATA — macro-inert by authoring
    // law 6; it never passes renderArmTemplate/processMacros). "" = no standing guidance (the common case).
    // Sliced to ANALYSIS_GUIDANCE_MAX at the write boundary; the CHECK below mirrors the same const.
    guidance: text("guidance").notNull().default(""),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  () => [check("automation_rule_state_guidance_check", sql.raw(`length(guidance) <= ${ANALYSIS_GUIDANCE_MAX}`))],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// global_variables — the per-user cross-chat KV plane. String plane;
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
    // The natural key IS the identity — no TypeID, no surrogate.
    primaryKey({ columns: [t.ownerId, t.key] }),
    check("global_variables_key_check", sql.raw(`length(key) <= ${GLOBAL_VARIABLE_KEY_MAX_CHARS}`)),
    // ≤ 64 KiB of BYTES — length() on TEXT counts characters, so cast to BLOB for the byte cap.
    check("global_variables_value_check", sql.raw(`length(cast(value as blob)) <= ${GLOBAL_VARIABLE_VALUE_MAX_BYTES}`)),
  ],
);
