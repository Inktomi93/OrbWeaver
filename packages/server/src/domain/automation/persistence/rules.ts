// domain/automation/persistence/rules — all `automation_rules` db access (queries only; the verbs own
// validation + authority). The stored `actions` json is LAZY-PARSED at the read seam with the chat-metadata
// fault-isolation pattern: a corrupt blob degrades that ONE rule to an empty arm list (never throws, never
// nukes the chat's rule list — 04 §1). Position is a total order per chat; `applyReorder` rewrites it in one
// batch.

import type { AutomationAction, AutomationTrigger } from "@orb/contracts/automation";
import { automationActionsSchema } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationRules } from "@orb/db";
import { batchMany } from "@orb/db/kit";
import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { and, asc, eq, sql } from "drizzle-orm";
import type { RuleRow } from "../contract/ops.ts";
import type { RuleView } from "../contract/results.ts";

const LIMIT_ONE = 1;

/** The columns a `createRule` write supplies (the app-minted id + the injected clock stamp both fields). */
interface RuleInsert {
  readonly id: AutomationRuleId;
  readonly ownerId: UserId;
  readonly chatId: ChatId;
  readonly name: string;
  readonly description: string | null;
  readonly position: number;
  readonly triggerBus: AutomationTrigger["bus"];
  readonly triggerType: AutomationTrigger["type"];
  readonly predicateCel: string | null;
  readonly actions: readonly AutomationAction[];
  readonly matchAutomationEvents: boolean;
  readonly cooldownSeconds: number;
  readonly maxFiresPerHour: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** The editable columns `updateRule` replaces (a PUT — the id/chat/owner are immutable). Resets the error
 *  ledger (a fresh authoring pass clears the auto-disable countdown — 04 §2). */
interface RuleUpdate {
  readonly name: string;
  readonly description: string | null;
  readonly triggerBus: AutomationTrigger["bus"];
  readonly triggerType: AutomationTrigger["type"];
  readonly predicateCel: string | null;
  readonly actions: readonly AutomationAction[];
  readonly matchAutomationEvents: boolean;
  readonly cooldownSeconds: number;
  readonly maxFiresPerHour: number;
  readonly updatedAt: number;
}

/** Recompose the stored `{bus, type}` columns into the closed `AutomationTrigger`. The db CHECK guarantees
 *  the pair is a valid tuple member, so the cast is sound. */
function toTrigger(row: RuleRow): AutomationTrigger {
  return { bus: row.triggerBus, type: row.triggerType } as AutomationTrigger;
}

/** Project a row onto `RuleView`, LAZY-PARSING `actions` with fault isolation: a corrupt blob yields `[]`
 *  (the read never throws; the chat's rule list survives — the active disable-on-corrupt is dispatch-time,
 *  A5). */
export function toRuleView(row: RuleRow): RuleView {
  const parsed = automationActionsSchema.safeParse(row.actions);
  return {
    id: row.id,
    chatId: row.chatId,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    position: row.position,
    trigger: toTrigger(row),
    predicateCel: row.predicateCel,
    actions: parsed.success ? parsed.data : [],
    matchAutomationEvents: row.matchAutomationEvents,
    cooldownSeconds: row.cooldownSeconds,
    maxFiresPerHour: row.maxFiresPerHour,
    consecutiveErrors: row.consecutiveErrors,
    lastError: row.lastError,
    lastFiredAt: row.lastFiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The highest `position` among a chat's rules, or -1 when it has none (so `+1` yields 0 for the first). */
export async function maxPosition(db: Db, chatId: ChatId): Promise<number> {
  const rows = await db
    .select({ max: sql<number | null>`max(${automationRules.position})` })
    .from(automationRules)
    .where(eq(automationRules.chatId, chatId));
  return rows[0]?.max ?? -1;
}

export async function insertRule(db: Db, row: RuleInsert): Promise<void> {
  await db.insert(automationRules).values({ ...row, actions: row.actions as RuleRow["actions"], enabled: false });
}

// @owner-scope-ok: every caller has already passed `requireRuleHost(ctx, principal, ruleId)` — the D18 host
// rung, which is STRICTER than the ownerId stamp (a rule's owner is its author, but only the room's host may
// touch it). Re-adding `eq(ownerId, …)` here would encode the weaker check. Ends if a caller ever reaches
// this without the guard (create-rule reads back its own freshly-minted id, which is the same proof).
export async function selectRuleRow(db: Db, ruleId: AutomationRuleId): Promise<RuleRow | undefined> {
  const rows = await db.select().from(automationRules).where(eq(automationRules.id, ruleId)).limit(LIMIT_ONE);
  return rows[0];
}

/** A chat's rules in dispatch/list order — `position` then `created_at` (stable tie-break, 04 §3). */
export function listRuleRowsForChat(db: Db, chatId: ChatId): Promise<RuleRow[]> {
  return db.select().from(automationRules).where(eq(automationRules.chatId, chatId)).orderBy(asc(automationRules.position), asc(automationRules.createdAt));
}

// @owner-scope-write-ok: the D18 HOST rung, not the stamp — `requireRuleHost(ctx, principal, ruleId)` runs
// in every calling verb (`update-rule`) and is STRICTER than `eq(ownerId, …)` (a rule's owner
// is its author, but only the room's host may touch it), so an owner predicate here would encode the
// WEAKER check. Ends the day a verb writes a rule without that guard.
export async function applyRuleUpdate(db: Db, ruleId: AutomationRuleId, patch: RuleUpdate): Promise<void> {
  await db
    .update(automationRules)
    .set({ ...patch, actions: patch.actions as RuleRow["actions"], consecutiveErrors: 0, lastError: null })
    .where(eq(automationRules.id, ruleId));
}

// @owner-scope-write-ok: the D18 HOST rung, not the stamp — `requireRuleHost(ctx, principal, ruleId)` runs
// in every calling verb (`set-rule-enabled`) and is STRICTER than `eq(ownerId, …)` (a rule's owner
// is its author, but only the room's host may touch it), so an owner predicate here would encode the
// WEAKER check. Ends the day a verb writes a rule without that guard.
export async function setRuleEnabledRow(db: Db, ruleId: AutomationRuleId, enabled: boolean, now: number): Promise<void> {
  await db.update(automationRules).set({ enabled, updatedAt: now }).where(eq(automationRules.id, ruleId));
}

// @owner-scope-write-ok: the D18 HOST rung, not the stamp — `requireRuleHost(ctx, principal, ruleId)` runs
// in every calling verb (`delete-rule`) and is STRICTER than `eq(ownerId, …)` (a rule's owner
// is its author, but only the room's host may touch it), so an owner predicate here would encode the
// WEAKER check. Ends the day a verb writes a rule without that guard.
export async function deleteRuleRow(db: Db, ruleId: AutomationRuleId): Promise<void> {
  await db.delete(automationRules).where(eq(automationRules.id, ruleId));
}

// ── the A5 watcher/dispatch reads + writes ──────────────────────────────────────────────────────────
/** Distinct chat ids with ≥1 enabled rule — the watcher's chat-Set (01 §3 pre-check), rebuilt at boot +
 *  after each lifecycle mutation. Only chat-scoped rows (v1 refuses the owner-global chat-less shape). */
export async function loadEnabledChatIds(db: Db): Promise<ChatId[]> {
  const rows = await db.selectDistinct({ chatId: automationRules.chatId }).from(automationRules).where(eq(automationRules.enabled, true));
  return rows.flatMap((r): ChatId[] => (r.chatId === null ? [] : [r.chatId]));
}

/** Whether ANY enabled rule triggers on the domain bus — the watcher's domain-bus fast path (01 §3). */
export async function hasEnabledDomainRules(db: Db): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(automationRules)
    .where(and(eq(automationRules.enabled, true), eq(automationRules.triggerBus, "domain")))
    .limit(LIMIT_ONE);
  return rows.length > 0;
}

/** A chat's ENABLED chat-bus rules for one trigger, in dispatch order (the `automation_rules_chat_enabled`
 *  index — 04 §1/§3). */
export function loadEnabledChatRules(db: Db, chatId: ChatId, triggerType: AutomationTrigger["type"]): Promise<RuleRow[]> {
  return db
    .select()
    .from(automationRules)
    .where(
      and(
        eq(automationRules.chatId, chatId),
        eq(automationRules.enabled, true),
        eq(automationRules.triggerBus, "chat"),
        eq(automationRules.triggerType, triggerType),
      ),
    )
    .orderBy(asc(automationRules.position), asc(automationRules.createdAt));
}

/** Every ENABLED domain-bus rule for one trigger, across all chats (a domain event has no chat scope — each
 *  matched rule runs in its OWN chat's context). Ordered by chat then position for a stable dispatch. */
export function loadEnabledDomainRules(db: Db, triggerType: AutomationTrigger["type"]): Promise<RuleRow[]> {
  return db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.enabled, true), eq(automationRules.triggerBus, "domain"), eq(automationRules.triggerType, triggerType)))
    .orderBy(asc(automationRules.chatId), asc(automationRules.position), asc(automationRules.createdAt));
}

/** Every ENABLED chat-bus `turnStarted` rule, across all chats, in dispatch order — the A7 prompt-transform
 *  index's source (a `transform_draft` rule registers into the turn pipeline, it does NOT watcher-dispatch;
 *  the index filters these to the transform-only rows and syncs the registry). Ordered by chat then position
 *  so a chat's transforms register in the host-authored order that IS their `PromptTransform.order`. */
export function loadEnabledTurnStartedRules(db: Db): Promise<RuleRow[]> {
  return db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.enabled, true), eq(automationRules.triggerBus, "chat"), eq(automationRules.triggerType, "turnStarted")))
    .orderBy(asc(automationRules.chatId), asc(automationRules.position), asc(automationRules.createdAt));
}

/** A clean fire (04 §3 step 6): stamp `last_fired_at` (the cooldown source) + clear the error ledger. */
// @owner-scope-write-ok: the A5 DISPATCH plane (D20 un-principal) — the ruleId is one the engine itself
// loaded off `loadEnabledChatRules`/`loadEnabledDomainRules`, never caller input, and the write is the
// engine's own bookkeeping (the clean-fire stamp). There is no principal in scope to scope it to. Ends if a
// user-facing door ever calls this.
export async function stampRuleFired(db: Db, ruleId: AutomationRuleId, now: number): Promise<void> {
  await db.update(automationRules).set({ lastFiredAt: now, consecutiveErrors: 0, lastError: null, updatedAt: now }).where(eq(automationRules.id, ruleId));
}

/** Record a rule error (predicate_error/action_error/authority_refused): increment `consecutive_errors` +
 *  store the skip reason. Returns the NEW count so the dispatch can auto-disable at the threshold (02 §1). */
// @owner-scope-write-ok: the A5 DISPATCH plane (D20 un-principal) — the ruleId is one the engine itself
// loaded off `loadEnabledChatRules`/`loadEnabledDomainRules`, never caller input, and the write is the
// engine's own bookkeeping (the error ledger). There is no principal in scope to scope it to. Ends if a
// user-facing door ever calls this.
export async function recordRuleError(db: Db, ruleId: AutomationRuleId, reason: string, now: number): Promise<number> {
  const rows = await db
    .update(automationRules)
    .set({ consecutiveErrors: sql`${automationRules.consecutiveErrors} + 1`, lastError: reason, updatedAt: now })
    .where(eq(automationRules.id, ruleId))
    .returning({ consecutiveErrors: automationRules.consecutiveErrors });
  return rows[0]?.consecutiveErrors ?? 0;
}

/** Auto-disable a rule (the 20-error ceiling, or a corrupt actions blob) — records the reason + flips
 *  `enabled` off. The caller then reloads the enabled index. */
// @owner-scope-write-ok: the A5 DISPATCH plane (D20 un-principal) — the ruleId is one the engine itself
// loaded off `loadEnabledChatRules`/`loadEnabledDomainRules`, never caller input, and the write is the
// engine's own bookkeeping (the auto-disable flip). There is no principal in scope to scope it to. Ends if a
// user-facing door ever calls this.
export async function disableRule(db: Db, ruleId: AutomationRuleId, reason: string, now: number): Promise<void> {
  await db.update(automationRules).set({ enabled: false, lastError: reason, updatedAt: now }).where(eq(automationRules.id, ruleId));
}

/** Rewrite `position` over the given ordered ids (host-reorder — a TOTAL order). Each update is scoped to
 *  the chat so a foreign id in the list can never touch another chat's row. One batch, atomic. */
// @owner-scope-write-ok: the D18 HOST rung, not the stamp — `requireRuleHost(ctx, principal, ruleId)` runs
// in every calling verb (`reorder-rules`, via `requireChatHost`) and is STRICTER than `eq(ownerId, …)` (a rule's owner
// is its author, but only the room's host may touch it), so an owner predicate here would encode the
// WEAKER check. Ends the day a verb writes a rule without that guard.
// The chat predicate beside each id is the SECOND belt: a foreign rule id in the list touches no row.
export async function applyReorder(db: Db, chatId: ChatId, orderedIds: readonly AutomationRuleId[], now: number): Promise<void> {
  if (orderedIds.length === 0) {
    return;
  }
  await db.batch(
    batchMany(
      orderedIds.map((ruleId, position) =>
        db
          .update(automationRules)
          .set({ position, updatedAt: now })
          .where(and(eq(automationRules.id, ruleId), eq(automationRules.chatId, chatId))),
      ),
    ),
  );
}
