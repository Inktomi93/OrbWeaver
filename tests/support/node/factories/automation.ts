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

export async function seedAutomationRule(
  db: Db,
  createRule: AutomationService["createRule"],
  params: Parameters<AutomationService["createRule"]>[0],
): Promise<AutomationRuleRow> {
  const view = await createRule(params);
  const row = await db.select().from(automationRules).where(eq(automationRules.id, view.id)).get();
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
  const row = await db
    .select()
    .from(globalVariables)
    .where(and(eq(globalVariables.ownerId, params.principal.userId), eq(globalVariables.key, params.key)))
    .get();
  if (row === undefined) {
    throw new Error("production global-variable write left no canonical row");
  }
  return row;
}

/** The dry run executes no action, but its actual provenance ledger is not empty. */
export async function seedAutomationTestFires(
  db: Db,
  testRule: AutomationService["testRule"],
  params: Parameters<AutomationService["testRule"]>[0],
): Promise<SeededAutomationTestFires> {
  const result = await testRule(params);
  const fires = await db.select().from(automationFires).where(eq(automationFires.ruleId, params.ruleId)).orderBy(automationFires.id);
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
  const fires = await db.select().from(automationFires).where(eq(automationFires.ruleId, params.ruleId)).orderBy(automationFires.id);
  const state = await db.select().from(automationRuleState).where(eq(automationRuleState.ruleId, params.ruleId)).get();
  return { result, fires, state };
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
