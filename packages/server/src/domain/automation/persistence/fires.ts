// domain/automation/persistence/fires — the `automation_fires` ledger: audit + atomic budget admission +
// testRun provenance. The rule-lifecycle slice writes the `test_run` row (from `testRule`) and reads the log
// (`listFires`); the dispatch terminals (fired/predicate_*/budget_refused/…) are the engine's writes through
// the same `insertFire`. Autonomous arms first write the storage-only `reserved` state; every ordinary read
// filters it before projection. `detail` is open JSON, read-seam parsed onto the view.

import type { AutomationFireOutcome } from "@orb/contracts/automation";
import { AUTOMATION_CHAT_MAX_FIRES_PER_HOUR, AUTOMATION_OWNER_BUDGET_DEFAULTS } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationFires, automationRules } from "@orb/db";
import type { AwaitableBatchStmt } from "@orb/db/kit";
import type { AutomationFireId, AutomationRuleId, ChatId, UserId } from "@orb/kit/ids";
import { and, desc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import type { FireView } from "../contract/results.ts";
import { stampRuleFiredAfterReservationStatement } from "./rules.ts";

const DEFAULT_FIRE_LIMIT = 50;

type FireRow = typeof automationFires.$inferSelect;

/** The columns a fire write supplies (the app-minted id + the injected clock stamp `fired_at`). */
interface FireInsert {
  readonly id: AutomationFireId;
  readonly ruleId: AutomationRuleId;
  readonly chatId: ChatId | null;
  readonly triggerType: string;
  readonly outcome: AutomationFireOutcome;
  readonly detail: Record<string, unknown> | null;
  readonly automationDepth: number;
  readonly firedAt: number;
}

interface FireReservationInsert {
  readonly id: AutomationFireId;
  readonly ruleId: AutomationRuleId;
  readonly automationDepth: number;
  readonly firedAt: number;
}

const BUDGET_ADMISSION_OUTCOMES = ["fired", "reserved"] as const;
const MS_PER_SECOND = 1000;
const HOUR_MS = 3_600_000;

function toFireView(row: FireRow): FireView {
  if (row.outcome === "reserved") {
    throw new Error("automation: internal fire reservation reached the public terminal projection");
  }
  return {
    id: row.id,
    ruleId: row.ruleId,
    chatId: row.chatId,
    triggerType: row.triggerType,
    outcome: row.outcome,
    detail: row.detail ?? null,
    firedAt: row.firedAt,
  };
}

function insertFireStatement(db: Db, row: FireInsert): AwaitableBatchStmt<{ id: AutomationFireId }[]> {
  // `triggerType` is denormalized as a plain string on the log; the column types it to the closed tuple
  // (the CHECK is the guard). The write always passes a real tuple member (the rule's own trigger).
  return db
    .insert(automationFires)
    .values({ ...row, triggerType: row.triggerType as FireRow["triggerType"] })
    .returning({ id: automationFires.id });
}

export async function insertFire(db: Db, row: FireInsert): Promise<void> {
  await insertFireStatement(db, row);
}

/**
 * THE CONFIRM PATH'S TERMINAL, written ATOMICALLY — the fire row, and (only for a clean `fired`) the rule's
 * cooldown/error stamp beside it. The confirm twin of {@link commitReservedFire}, which does the same job for
 * the reservation the autonomous dispatch holds.
 *
 * It exists because a confirmed act has ALREADY HAPPENED by the time either write runs (the arm ran, the prose
 * landed), and the ask is spent take-once — so a failure between two sequential writes leaves an applied
 * effect with no terminal in the one log that answers "why did this run", and, worse, a `last_fired_at` stamp
 * with no fire row (or a fire row the cooldown never saw). One batch makes both visible together or neither.
 *
 * THE STAMP RIDES `changes() > 0` and the INSERT is statement 1: SQLite's `changes()` is connection-local and
 * reports the immediately preceding statement, so the stamp lands IF AND ONLY IF the fire row did. That is the
 * invariant this seam wants stated in SQL rather than assumed. (Writes only — no SELECT ahead of them; see
 * `@orb/db/kit`'s transaction-mode note.)
 */
export async function insertFireWithRuleStamp(db: Db, row: FireInsert, stampFiredAt: number | null): Promise<void> {
  const insert = insertFireStatement(db, row);
  if (stampFiredAt === null) {
    await insert;
    return;
  }
  await db.batch([insert, stampRuleFiredAfterReservationStatement(db, row.ruleId, stampFiredAt)]);
}

/**
 * Atomically reserve one autonomous admission against cooldown + rule/hour + scope/hour. The conditional
 * INSERT is the decision: every count includes already-held reservations, so competing writers cannot both
 * authorize effects from stale reads. Rule scope/trigger/caps are selected from the stored row, never trusted
 * from a caller-carried snapshot.
 */
export async function reserveFireBudget(db: Db, row: FireReservationInsert): Promise<boolean> {
  const windowStart = row.firedAt - HOUR_MS;
  const result = await db.run(sql`
    INSERT INTO automation_fires (id, rule_id, chat_id, trigger_type, outcome, detail, automation_depth, fired_at)
    SELECT ${row.id}, rule.id, rule.chat_id, rule.trigger_type, 'reserved', NULL, ${row.automationDepth}, ${row.firedAt}
    FROM automation_rules AS rule
    WHERE rule.id = ${row.ruleId}
      AND (
        rule.cooldown_seconds <= 0
        OR NOT EXISTS (
          SELECT 1 FROM automation_fires AS cooldown_fire
          WHERE cooldown_fire.rule_id = rule.id
            AND cooldown_fire.outcome IN ('fired', 'reserved')
            AND cooldown_fire.fired_at > ${row.firedAt} - (rule.cooldown_seconds * ${MS_PER_SECOND})
        )
      )
      AND (
        SELECT count(*) FROM automation_fires AS rule_fire
        WHERE rule_fire.rule_id = rule.id
          AND rule_fire.outcome IN ('fired', 'reserved')
          AND rule_fire.fired_at > ${windowStart}
      ) < rule.max_fires_per_hour
      AND (
        (
          rule.chat_id IS NOT NULL
          AND (
            SELECT count(*) FROM automation_fires AS chat_fire
            WHERE chat_fire.chat_id = rule.chat_id
              AND chat_fire.outcome IN ('fired', 'reserved')
              AND chat_fire.fired_at > ${windowStart}
          ) < ${AUTOMATION_CHAT_MAX_FIRES_PER_HOUR}
        )
        OR (
          rule.chat_id IS NULL
          AND (
            SELECT count(*)
            FROM automation_fires AS owner_fire
            INNER JOIN automation_rules AS owner_rule ON owner_rule.id = owner_fire.rule_id
            WHERE owner_rule.owner_id = rule.owner_id
              AND owner_rule.chat_id IS NULL
              AND owner_fire.outcome IN ('fired', 'reserved')
              AND owner_fire.fired_at > ${windowStart}
          ) < COALESCE(
            (SELECT budget.max_fires_per_hour FROM automation_owner_budgets AS budget WHERE budget.owner_id = rule.owner_id),
            ${AUTOMATION_OWNER_BUDGET_DEFAULTS.maxFiresPerHour}
          )
        )
      )
  `);
  return result.rowsAffected > 0;
}

function finalizeReservedFireStatement(
  db: Db,
  fireId: AutomationFireId,
  outcome: AutomationFireOutcome,
  detail: Record<string, unknown> | null,
): AwaitableBatchStmt<{ id: AutomationFireId }[]> {
  return db
    .update(automationFires)
    .set({ outcome, detail })
    .where(and(eq(automationFires.id, fireId), eq(automationFires.outcome, "reserved")))
    .returning({ id: automationFires.id });
}

/** Resolve a held reservation to an error terminal, releasing its rate capacity. */
export async function finalizeReservedFire(
  db: Db,
  fireId: AutomationFireId,
  outcome: Exclude<AutomationFireOutcome, "fired">,
  detail: Record<string, unknown> | null,
): Promise<void> {
  const rows = await finalizeReservedFireStatement(db, fireId, outcome, detail);
  if (rows.length !== 1) {
    throw new Error(`automation: fire reservation ${fireId} was not held during ${outcome} finalization`);
  }
}

/** A clean terminal atomically becomes visible as fired with the rule cooldown/error stamp beside it. */
export async function commitReservedFire(db: Db, fireId: AutomationFireId, ruleId: AutomationRuleId, now: number): Promise<void> {
  const [finalized] = await db.batch([finalizeReservedFireStatement(db, fireId, "fired", null), stampRuleFiredAfterReservationStatement(db, ruleId, now)]);
  if (finalized.length !== 1) {
    throw new Error(`automation: fire reservation ${fireId} was not held during success finalization`);
  }
}

/** Suggest-only / mid-dispatch pause consumes no terminal or budget, so remove the held row. */
export async function releaseFireReservation(db: Db, fireId: AutomationFireId): Promise<void> {
  await db.delete(automationFires).where(and(eq(automationFires.id, fireId), eq(automationFires.outcome, "reserved")));
}

/** A rule's recent fire log, newest first (the indexed `(rule_id, fired_at)` read — 04 §1). */
export async function listFiresForRule(db: Db, ruleId: AutomationRuleId, limit: number = DEFAULT_FIRE_LIMIT): Promise<FireView[]> {
  const rows = await db
    .select()
    .from(automationFires)
    .where(and(eq(automationFires.ruleId, ruleId), ne(automationFires.outcome, "reserved")))
    .orderBy(desc(automationFires.firedAt))
    .limit(limit);
  return rows.map(toFireView);
}

/** B11 — a CHAT's recent fire log across ALL its rules, newest first (the room Activity read). Reads the
 *  `automation_fires_chat_idx` (`chat_id`) index; every automation dispatch/confirm/notice/plugin-tool run
 *  for the room is a row here (the ONE-HOME store), so this returns the room's out-of-band history in ONE
 *  read — no client-side fan-out over the chat's rules (the per-rule `listFiresForRule` would force that).
 *  A deleted rule's fires CASCADE with it (`automation_fires.rule_id` FK is `onDelete: cascade`), so the
 *  log reflects the chat's currently-live rules' activity. */
export async function listFiresForChat(db: Db, chatId: ChatId, limit: number = DEFAULT_FIRE_LIMIT): Promise<FireView[]> {
  const rows = await db
    .select()
    .from(automationFires)
    .where(and(eq(automationFires.chatId, chatId), ne(automationFires.outcome, "reserved")))
    .orderBy(desc(automationFires.firedAt))
    .limit(limit);
  return rows.map(toFireView);
}

/** Count completed + held admissions for a rule since `sinceMs` — the indexed per-rule/hour budget source. */
export async function countRuleBudgetAdmissionsSince(db: Db, ruleId: AutomationRuleId, sinceMs: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(automationFires)
    .where(and(eq(automationFires.ruleId, ruleId), inArray(automationFires.outcome, BUDGET_ADMISSION_OUTCOMES), gt(automationFires.firedAt, sinceMs)));
  return rows[0]?.count ?? 0;
}

/** Count completed + held admissions for a chat — the per-chat/hour loop-safety belt. */
export async function countChatBudgetAdmissionsSince(db: Db, chatId: ChatId, sinceMs: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(automationFires)
    .where(and(eq(automationFires.chatId, chatId), inArray(automationFires.outcome, BUDGET_ADMISSION_OUTCOMES), gt(automationFires.firedAt, sinceMs)));
  return rows[0]?.count ?? 0;
}

/** C5 — count an OWNER's chat-less completed + held admissions since `sinceMs`: the per-owner/hour cap source
 *  (`automation_owner_budgets.max_fires_per_hour`), the global lane's twin of the per-chat belt above.
 *
 *  IT JOINS THE RULE ROW, and it has to: `automation_fires` carries a nullable `chat_id` but no owner column,
 *  so the only place a fire's author is written down is the rule it came from. The predicate is BOTH halves —
 *  the rule's owner AND `chat_id IS NULL` — because an owner's ROOM fires are already bounded by their rooms'
 *  own belts; counting them here would let a busy chat exhaust the global lane's ceiling and silently stop a
 *  library rule that had not fired at all. (The join reads `automation_rules_owner_idx`; the fire side reads
 *  `automation_fires_rule_time`.) */
export async function countOwnerGlobalBudgetAdmissionsSince(db: Db, ownerId: UserId, sinceMs: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(automationFires)
    .innerJoin(automationRules, eq(automationRules.id, automationFires.ruleId))
    .where(
      and(
        eq(automationRules.ownerId, ownerId),
        isNull(automationRules.chatId),
        inArray(automationFires.outcome, BUDGET_ADMISSION_OUTCOMES),
        gt(automationFires.firedAt, sinceMs),
      ),
    );
  return rows[0]?.count ?? 0;
}

/** Whether a completed or held admission occupies this rule's cooldown window. */
export async function hasRuleBudgetAdmissionSince(db: Db, ruleId: AutomationRuleId, sinceMs: number): Promise<boolean> {
  const rows = await db
    .select({ one: sql<number>`1` })
    .from(automationFires)
    .where(and(eq(automationFires.ruleId, ruleId), inArray(automationFires.outcome, BUDGET_ADMISSION_OUTCOMES), gt(automationFires.firedAt, sinceMs)))
    .limit(1);
  return rows.length > 0;
}
