// domain/automation/persistence/rules — all `automation_rules` db access (queries only; the verbs own
// validation + authority). The stored `actions` json is LAZY-PARSED at the read seam with the chat-metadata
// fault-isolation pattern: a corrupt blob degrades that ONE rule to an empty arm list (never throws, never
// nukes the chat's rule list — 04 §1).
//
// POSITION IS ALLOCATED BY THE DB, NEVER BY A CALLER (#1427). It is a total order per scope, so every write
// that mints it does so inside its own statement — the INSERT carries a `max+1` scalar subquery over the
// rule's scope, and `applyReorder` rewrites the whole order in one batch. There is no exported way to hand a
// position in: a caller that could would be a caller that can duplicate one.

import type { AutomationAction, AutomationTrigger } from "@orb/contracts/automation";
import { automationActionsSchema } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationRules } from "@orb/db";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PlannedRuleInsert, RuleRow } from "../contract/ops.ts";
import type { RuleView } from "../contract/results.ts";

const LIMIT_ONE = 1;

/** The editable columns `updateRule` replaces (a PUT — the id/chat/owner are immutable). Resets the error
 *  ledger (a fresh authoring pass clears the auto-disable countdown — 04 §2). */
interface RuleUpdate {
  readonly name: string;
  readonly description: string | null;
  readonly triggerBus: AutomationTrigger["bus"];
  readonly triggerType: AutomationTrigger["type"];
  readonly predicateCel: string | null;
  readonly actions: readonly AutomationAction[];
  /** ALWAYS null on an update — an edit clears the mint provenance (the row is no longer exactly what
   *  the preset mints; v1 knob-edit stays re-mint, §3-S3). Spelled here rather than defaulted inside
   *  `applyRuleUpdate` so the clearing is part of the verb's stated patch, not a hidden side effect. */
  readonly rulePresetId: null;
  readonly rulePresetKnobs: null;
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
 *  A5) AND sets `actionsCorrupt` (#1422).
 *
 *  THE FLAG IS THE HALF THAT WAS MISSING. The fault isolation is right and stays: one unreadable blob must not
 *  cost a host their whole rule list. But `[]` alone is a LIE the surface cannot see through — an unreadable
 *  rule projected identically to a rule whose author had simply not added an arm yet, with `enabled` still
 *  true and the error ledger still clean, because the disable-on-corrupt only happens the next time an event
 *  DISPATCHES it. So a rule that can never do anything read as benign in management, indefinitely, until an
 *  event happened to arrive. The list is still empty (there is nothing honest to put in it) and the flag says
 *  the emptiness is a FAILURE rather than a configuration. */
export function toRuleView(row: RuleRow): RuleView {
  const parsed = automationActionsSchema.safeParse(row.actions);
  return {
    actionsCorrupt: !parsed.success,
    id: row.id,
    chatId: row.chatId,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    position: row.position,
    trigger: toTrigger(row),
    predicateCel: row.predicateCel,
    actions: parsed.success ? parsed.data : [],
    rulePresetId: row.rulePresetId,
    rulePresetKnobs: row.rulePresetKnobs,
    matchAutomationEvents: row.matchAutomationEvents,
    suggestOnRefusal: row.suggestOnRefusal,
    cooldownSeconds: row.cooldownSeconds,
    maxFiresPerHour: row.maxFiresPerHour,
    consecutiveErrors: row.consecutiveErrors,
    lastError: row.lastError,
    lastFiredAt: row.lastFiredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** `position = max + 1` WITHIN ONE SCOPE, as a scalar subquery on the INSERT itself (#1427) — never a JS read
 *  followed by a write. `-1` for an empty scope, so the first rule lands at 0.
 *
 *  IT IS A SUBQUERY BECAUSE THE ALLOCATION IS THE RACE. Read-then-insert is two statements, and two creates
 *  in one scope that interleave between them both read the same max and both write `max+1` — a duplicate in a
 *  column whose order is SEMANTICS (a chat's arms mutate one shared write-through env in position order, and
 *  the `reorder` verb's totality check assumes a total order). Computed inside the INSERT, the allocation is
 *  atomic with the write; inside a `db.batch` each statement also sees the rows the ones before it wrote, so a
 *  whole preset SET allocates ascending positions from one snapshot without a read.
 *
 *  THE OWNER PREDICATE IS LOAD-BEARING ON THE GLOBAL ARM, not defensive scoping: `chat_id IS NULL` alone
 *  spans EVERY user's global lane, so without it the first global rule a second user creates would be handed
 *  a position past the first user's — one shared, ever-climbing counter across a partition that is supposed
 *  to be per-owner. (SQL's `= NULL` is never true either, which is why the null arm cannot reuse `eq`.) */
function nextPositionInScope(chatId: ChatId | null, ownerId: UserId): SQL<number> {
  const highest = sql`coalesce(max(${automationRules.position}), -1) + 1`;
  return chatId === null
    ? sql<number>`(select ${highest} from ${automationRules} where ${automationRules.chatId} is null and ${automationRules.ownerId} = ${ownerId})`
    : sql<number>`(select ${highest} from ${automationRules} where ${automationRules.chatId} = ${chatId})`;
}

/** The unexecuted INSERT for one planned rule — BORN DISABLED, position db-allocated. File-local builder; the
 *  two executors below own the run (the single-rule write and the all-or-nothing set write). */
function buildInsertRule(db: Db, row: PlannedRuleInsert): BatchStmt {
  return batchStmt(
    db.insert(automationRules).values({
      ...row,
      actions: row.actions as RuleRow["actions"],
      enabled: false,
      position: nextPositionInScope(row.chatId, row.ownerId),
    }),
  );
}

/** C5 — an OWNER's chat-less rules in list order, `position` then `created_at` (the `listRuleRowsForChat`
 *  posture, one scope over). The Automation settings pane's read. */
export function listRuleRowsForOwnerGlobal(db: Db, ownerId: UserId): Promise<RuleRow[]> {
  return db
    .select()
    .from(automationRules)
    .where(and(isNull(automationRules.chatId), eq(automationRules.ownerId, ownerId)))
    .orderBy(asc(automationRules.position), asc(automationRules.createdAt));
}

export async function insertRule(db: Db, row: PlannedRuleInsert): Promise<void> {
  await insertRules(db, [row]);
}

/** ALL-OR-NOTHING: one `db.batch`, so a preset's rule set is committed whole or not at all (#1427) — and the
 *  per-statement position subquery sees the rows the earlier statements wrote, so the set lands at ascending
 *  positions in the order given, off ONE snapshot and with no read. An empty set writes nothing (libsql
 *  resolves an empty batch, but there is no statement to build). */
export async function insertRules(db: Db, rows: readonly PlannedRuleInsert[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await db.batch(batchMany(rows.map((row) => buildInsertRule(db, row))));
}

/** The rows for a just-written SET, in the order the db allocated them. `inArray` over app-minted ids the
 *  caller just inserted — the `selectRuleRow` posture, one read instead of N. */
// @orb-waive owner-scoped-reads(automationRules): the ids are the caller's OWN freshly-minted ones (`createRuleFromPreset` passes exactly what it just wrote under its own host gate) — the same proof `selectRuleRow` cites. Ends if a caller ever passes ids it did not mint in the same call.
export async function selectRuleRowsByIds(db: Db, ruleIds: readonly AutomationRuleId[]): Promise<RuleRow[]> {
  if (ruleIds.length === 0) {
    return [];
  }
  return await db
    .select()
    .from(automationRules)
    .where(inArray(automationRules.id, [...ruleIds]))
    .orderBy(asc(automationRules.position), asc(automationRules.createdAt));
}

// @orb-waive owner-scoped-reads(automationRules): every caller has already passed `requireRuleHost(ctx, principal, ruleId)` — the D18 host rung, which is STRICTER than the ownerId stamp (a rule's owner is its author, but only the room's host may touch it). Re-adding `eq(ownerId, …)` here would encode the weaker check. Ends if a caller ever reaches this without the guard (create-rule reads back its own freshly-minted id, which is the same proof).
export async function selectRuleRow(db: Db, ruleId: AutomationRuleId): Promise<RuleRow | undefined> {
  const rows = await db.select().from(automationRules).where(eq(automationRules.id, ruleId)).limit(LIMIT_ONE);
  return rows[0];
}

/** JUST the ids of a chat's rules — the reorder verb's totality check (#1429), which compares the requested
 *  set against the chat's complete current one and needs nothing else off the rows. */
export async function listRuleIdsForChat(db: Db, chatId: ChatId): Promise<AutomationRuleId[]> {
  const rows = await db.select({ id: automationRules.id }).from(automationRules).where(eq(automationRules.chatId, chatId));
  return rows.map((row) => row.id);
}

/** A chat's rules in dispatch/list order — `position` then `created_at` (stable tie-break, 04 §3). */
export function listRuleRowsForChat(db: Db, chatId: ChatId): Promise<RuleRow[]> {
  return db.select().from(automationRules).where(eq(automationRules.chatId, chatId)).orderBy(asc(automationRules.position), asc(automationRules.createdAt));
}

// @orb-waive owner-scoped-writes(automationRules): the D18 HOST rung, not the stamp — `requireRuleHost(ctx, principal, ruleId)` runs in every calling verb (`update-rule`) and is STRICTER than `eq(ownerId, …)` (a rule's owner is its author, but only the room's host may touch it), so an owner predicate here would encode the WEAKER check. Ends the day a verb writes a rule without that guard.
export async function applyRuleUpdate(db: Db, ruleId: AutomationRuleId, patch: RuleUpdate): Promise<void> {
  await db
    .update(automationRules)
    .set({ ...patch, actions: patch.actions as RuleRow["actions"], consecutiveErrors: 0, lastError: null })
    .where(eq(automationRules.id, ruleId));
}

// @orb-waive owner-scoped-writes(automationRules): the D18 HOST rung, not the stamp — `requireRuleHost(ctx, principal, ruleId)` runs in every calling verb (`set-rule-enabled`) and is STRICTER than `eq(ownerId, …)` (a rule's owner is its author, but only the room's host may touch it), so an owner predicate here would encode the WEAKER check. Ends the day a verb writes a rule without that guard.
export async function setRuleEnabledRow(db: Db, ruleId: AutomationRuleId, enabled: boolean, now: number): Promise<void> {
  await db.update(automationRules).set({ enabled, updatedAt: now }).where(eq(automationRules.id, ruleId));
}

/** RULED F4's per-rule opt-out (spec row B4) — flip whether a rate refusal of this rule still offers the
 *  "run it now?" invitation. A ONE-COLUMN write, deliberately not folded into `applyRuleUpdate`: that patch
 *  is the PUT and it NULLS the mint provenance, so routing a preference flip through it would destroy the
 *  saved-cast provenance a host never asked to lose. The `setRuleEnabledRow` posture exactly. */
// @orb-waive owner-scoped-writes(automationRules): the D18 HOST rung, not the stamp — `requireRuleAuthority(ctx, principal, ruleId)` runs in the calling verb (`set-rule-suggest-on-refusal`) and is STRICTER than `eq(ownerId, …)` (a rule's owner is its author, but only the room's host may touch it), so an owner predicate here would encode the WEAKER check. Ends the day a verb writes a rule without that guard.
export async function setRuleSuggestOnRefusalRow(db: Db, ruleId: AutomationRuleId, suggestOnRefusal: boolean, now: number): Promise<void> {
  await db.update(automationRules).set({ suggestOnRefusal, updatedAt: now }).where(eq(automationRules.id, ruleId));
}

// @orb-waive owner-scoped-writes(automationRules): the D18 HOST rung, not the stamp — `requireRuleHost(ctx, principal, ruleId)` runs in every calling verb (`delete-rule`) and is STRICTER than `eq(ownerId, …)` (a rule's owner is its author, but only the room's host may touch it), so an owner predicate here would encode the WEAKER check. Ends the day a verb writes a rule without that guard.
export async function deleteRuleRow(db: Db, ruleId: AutomationRuleId): Promise<void> {
  await db.delete(automationRules).where(eq(automationRules.id, ruleId));
}

// ── the watcher/dispatch reads + writes ─────────────────────────────────────────────────────────────
/** Distinct chat ids with ≥1 enabled rule — the watcher's chat-Set (pre-check), rebuilt at boot +
 *  after each lifecycle mutation. Chat-scoped rows only, and the `null` filter is CORRECT rather than a
 *  leftover: an owner-global rule triggers on the DOMAIN bus, whose pre-check is `hasEnabledDomainRules`
 *  below — a chat-less row has no chat to put in a chat-keyed Set. */
export async function loadEnabledChatIds(db: Db): Promise<ChatId[]> {
  const rows = await db.selectDistinct({ chatId: automationRules.chatId }).from(automationRules).where(eq(automationRules.enabled, true));
  return rows.flatMap((r): ChatId[] => (r.chatId === null ? [] : [r.chatId]));
}

/** Whether ANY enabled rule triggers on the domain bus — the watcher's domain-bus fast path. */
export async function hasEnabledDomainRules(db: Db): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(automationRules)
    .where(and(eq(automationRules.enabled, true), eq(automationRules.triggerBus, "domain")))
    .limit(LIMIT_ONE);
  return rows.length > 0;
}

/** A chat's ENABLED chat-bus rules for one trigger, in dispatch order (the `automation_rules_chat_enabled`
 *  index). */
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

/** Every ENABLED chat-bus `turnStarted` rule, across all chats, in dispatch order — the prompt-transform
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

/** A clean fire (dispatch step 6): stamp `last_fired_at` (the cooldown source) + clear the error ledger. */
// @orb-waive owner-scoped-writes(automationRules): the DISPATCH plane (D20 un-principal) — the ruleId is one the engine itself loaded off `loadEnabledChatRules`/`loadEnabledDomainRules`, never caller input, and the write is the engine's own bookkeeping (the clean-fire stamp). There is no principal in scope to scope it to. Ends if a user-facing door ever calls this.
function stampRuleFiredStatement(db: Db, ruleId: AutomationRuleId, now: number): AwaitableBatchStmt<{ id: AutomationRuleId }[]> {
  return db
    .update(automationRules)
    .set({ lastFiredAt: now, consecutiveErrors: 0, lastError: null, updatedAt: now })
    .where(eq(automationRules.id, ruleId))
    .returning({ id: automationRules.id });
}

/**
 * A fire-terminal batch's SECOND statement — "stamp the rule iff the statement before me wrote its row".
 * SQLite `changes()` is connection-local and reports the immediately preceding statement, so the stamp is a
 * zero-row no-op exactly when that write did nothing, while both still commit atomically. TWO batches use it,
 * and both pass a write as statement 1: the autonomous dispatch's reservation finalization
 * (`commitReservedFire` — a vanished reservation must not stamp) and the CONFIRM path's fire insert
 * (`insertFireWithRuleStamp` — a rejected insert must not stamp).
 */
// @orb-waive owner-scoped-writes(automationRules): the DISPATCH plane (D20 un-principal) — the ruleId comes from the engine's loaded rule (or, on the confirm path, from the re-read rule row the verb's host gate already authorized), and the immediately preceding write in the same batch authorizes this bookkeeping stamp. The connection-local `changes()` condition prevents a stamp when that write did nothing. Ends if a user-facing door calls this with a caller-supplied ruleId, or if a statement stops preceding it in the same batch.
export function stampRuleFiredAfterReservationStatement(db: Db, ruleId: AutomationRuleId, now: number): AwaitableBatchStmt<{ id: AutomationRuleId }[]> {
  return db
    .update(automationRules)
    .set({ lastFiredAt: now, consecutiveErrors: 0, lastError: null, updatedAt: now })
    .where(and(eq(automationRules.id, ruleId), sql`changes() > 0`))
    .returning({ id: automationRules.id });
}

export async function stampRuleFired(db: Db, ruleId: AutomationRuleId, now: number): Promise<void> {
  await stampRuleFiredStatement(db, ruleId, now);
}

/** Record a rule error (predicate_error/action_error/authority_refused): increment `consecutive_errors` +
 *  store the skip reason. Returns the NEW count so the dispatch can auto-disable at the threshold. */
// @orb-waive owner-scoped-writes(automationRules): the DISPATCH plane (D20 un-principal) — the ruleId is one the engine itself loaded off `loadEnabledChatRules`/`loadEnabledDomainRules`, never caller input, and the write is the engine's own bookkeeping (the error ledger). There is no principal in scope to scope it to. Ends if a user-facing door ever calls this.
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
// @orb-waive owner-scoped-writes(automationRules): the A5 DISPATCH plane (D20 un-principal) — the ruleId is one the engine itself loaded off `loadEnabledChatRules`/`loadEnabledDomainRules`, never caller input, and the write is the engine's own bookkeeping (the auto-disable flip). There is no principal in scope to scope it to. Ends if a user-facing door ever calls this.
export async function disableRule(db: Db, ruleId: AutomationRuleId, reason: string, now: number): Promise<void> {
  await db.update(automationRules).set({ enabled: false, lastError: reason, updatedAt: now }).where(eq(automationRules.id, ruleId));
}

/** Rewrite `position` over the given ordered ids (host-reorder — a TOTAL order). Each update is scoped to
 *  the chat so a foreign id in the list can never touch another chat's row. One batch, atomic. */
// @orb-waive owner-scoped-writes(automationRules): the D18 HOST rung, not the stamp — `requireRuleHost(ctx, principal, ruleId)` runs in every calling verb (`reorder-rules`, via `requireChatHost`) and is STRICTER than `eq(ownerId, …)` (a rule's owner is its author, but only the room's host may touch it), so an owner predicate here would encode the WEAKER check. Ends the day a verb writes a rule without that guard. The chat predicate beside each id is the SECOND belt: a foreign rule id in the list touches no row.
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
