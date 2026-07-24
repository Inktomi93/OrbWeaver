// domain/automation/persistence/fires — the `automation_fires` log: audit + budget counting + testRun
// provenance (04 §1). A4 writes the `test_run` row (from `testRule`) and reads the log (`listFires`); the
// dispatch terminals (fired/predicate_*/budget_refused/…) are the A5 engine's writes through the same
// `insertFire`. `detail` is open JSON, read-seam parsed onto the view.

import type { AutomationFireOutcome } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationFires } from "@orb/db";
import type { AutomationFireId, AutomationRuleId, ChatId } from "@orb/kit/ids";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { FireView } from "../contract/results";

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

function toFireView(row: FireRow): FireView {
  return {
    id: row.id,
    ruleId: row.ruleId,
    chatId: row.chatId,
    triggerType: row.triggerType,
    outcome: row.outcome,
    detail: row.detail ?? null,
    automationDepth: row.automationDepth,
    firedAt: row.firedAt,
  };
}

export async function insertFire(db: Db, row: FireInsert): Promise<void> {
  // `triggerType` is denormalized as a plain string on the log; the column types it to the closed tuple
  // (the CHECK is the guard). The write always passes a real tuple member (the rule's own trigger).
  await db.insert(automationFires).values({ ...row, triggerType: row.triggerType as FireRow["triggerType"] });
}

/** A rule's recent fire log, newest first (the indexed `(rule_id, fired_at)` read — 04 §1). */
export async function listFiresForRule(db: Db, ruleId: AutomationRuleId, limit: number = DEFAULT_FIRE_LIMIT): Promise<FireView[]> {
  const rows = await db.select().from(automationFires).where(eq(automationFires.ruleId, ruleId)).orderBy(desc(automationFires.firedAt)).limit(limit);
  return rows.map(toFireView);
}

/** Count the actual FIRES (`outcome='fired'`) for a rule since `sinceMs` — the per-rule/hour budget source
 *  (04 §1: the fire log IS the count source, on the `(rule_id, fired_at)` index). */
export async function countRuleFiresSince(db: Db, ruleId: AutomationRuleId, sinceMs: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(automationFires)
    .where(and(eq(automationFires.ruleId, ruleId), eq(automationFires.outcome, "fired"), gt(automationFires.firedAt, sinceMs)));
  return rows[0]?.count ?? 0;
}

/** Count the actual FIRES for a chat since `sinceMs` — the per-chat/hour fire-RATE cap source (the
 *  `automation_budgets.max_fires_per_hour` ceiling; the loop-safety belt). */
export async function countChatFiresSince(db: Db, chatId: ChatId, sinceMs: number): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(automationFires)
    .where(and(eq(automationFires.chatId, chatId), eq(automationFires.outcome, "fired"), gt(automationFires.firedAt, sinceMs)));
  return rows[0]?.count ?? 0;
}
