// Rule admission, scope-local order, budget defaults and global-key validation stay with automation.
import type { Db } from "@orb/db";
import { automationFires, automationOwnerBudgets, automationRuleState, automationRules, globalVariables } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import { and, eq } from "drizzle-orm";

type AutomationService = ServicesResult["services"]["automation"];

export type AutomationRuleRow = typeof automationRules.$inferSelect;
export type AutomationOwnerBudgetRow = typeof automationOwnerBudgets.$inferSelect;
export type GlobalVariableRow = typeof globalVariables.$inferSelect;
export type AutomationFireRow = typeof automationFires.$inferSelect;
export type AutomationRuleStateRow = typeof automationRuleState.$inferSelect;

/** Capture the exact production-returned rule identity, including later enablement and fire stamps. */
export async function captureAutomationRule(db: Db, ruleId: AutomationRuleRow["id"]): Promise<AutomationRuleRow | undefined> {
  return await db.select().from(automationRules).where(eq(automationRules.id, ruleId)).get();
}

export async function seedAutomationRule(
  db: Db,
  createRule: AutomationService["createRule"],
  params: Parameters<AutomationService["createRule"]>[0],
): Promise<AutomationRuleRow> {
  const view = await createRule(params);
  const row = await captureAutomationRule(db, view.id);
  if (row === undefined) {
    throw new Error("production rule creation left no canonical automation-rule row");
  }
  return row;
}

export async function seedAutomationOwnerBudget(
  db: Db,
  setOwnerBudgets: AutomationService["setOwnerBudgets"],
  params: Parameters<AutomationService["setOwnerBudgets"]>[0],
): Promise<AutomationOwnerBudgetRow> {
  await setOwnerBudgets(params);
  const row = await db.select().from(automationOwnerBudgets).where(eq(automationOwnerBudgets.ownerId, params.principal.userId)).get();
  if (row === undefined) {
    throw new Error("production budget write left no canonical automation-owner-budget row");
  }
  return row;
}

export async function seedGlobalVariable(
  db: Db,
  setGlobalVariable: AutomationService["setGlobalVariable"],
  params: Parameters<AutomationService["setGlobalVariable"]>[0],
): Promise<GlobalVariableRow> {
  await setGlobalVariable(params);
  const row = await captureGlobalVariable(db, params.principal.userId, params.key);
  if (row === undefined) {
    throw new Error("production global-variable write left no canonical row");
  }
  return row;
}

/** Observe an actual arm's effect without rewriting the owner/key row to obtain it. */
export async function captureGlobalVariable(
  db: Db,
  ownerId: GlobalVariableRow["ownerId"],
  key: GlobalVariableRow["key"],
): Promise<GlobalVariableRow | undefined> {
  const row = await db
    .select()
    .from(globalVariables)
    .where(and(eq(globalVariables.ownerId, ownerId), eq(globalVariables.key, key)))
    .get();
  return row;
}

/** The dry run executes no action, but its actual provenance ledger is not empty. */
export async function seedAutomationTestFires(
  db: Db,
  testRule: AutomationService["testRule"],
  params: Parameters<AutomationService["testRule"]>[0],
): Promise<SeededAutomationTestFires> {
  const result = await testRule(params);
  const { fires } = await captureAutomationExecution(db, params.ruleId);
  if (fires.length === 0) {
    throw new Error("production rule dry run left no canonical automation fire rows");
  }
  return { result, fires };
}

/** Paused/suggested runs may write no fire; analysis state exists only after its genuine producer runs. */
export async function seedAutomationRun(
  db: Db,
  runRuleNow: AutomationService["runRuleNow"],
  params: Parameters<AutomationService["runRuleNow"]>[0],
): Promise<SeededAutomationRun> {
  const result = await runRuleNow(params);
  return { result, ...(await captureAutomationExecution(db, params.ruleId)) };
}

/** Capture a real watcher/manual execution's complete rule-PK ledger; absent state remains absent. */
export async function captureAutomationExecution(db: Db, ruleId: AutomationRuleRow["id"]): Promise<Omit<SeededAutomationRun, "result">> {
  const [fires, state] = await Promise.all([
    db.select().from(automationFires).where(eq(automationFires.ruleId, ruleId)).orderBy(automationFires.id),
    db.select().from(automationRuleState).where(eq(automationRuleState.ruleId, ruleId)).get(),
  ]);
  return { fires, state };
}

export interface SeededAutomationTestFires {
  readonly result: Awaited<ReturnType<AutomationService["testRule"]>>;
  readonly fires: readonly AutomationFireRow[];
}
export interface SeededAutomationRun {
  readonly result: Awaited<ReturnType<AutomationService["runRuleNow"]>>;
  readonly fires: readonly AutomationFireRow[];
  readonly state: AutomationRuleStateRow | undefined;
}
