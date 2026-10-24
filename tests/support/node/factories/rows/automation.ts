// Automation rows a production verb left, read behind the rows door for persistence-tier and corpus captures.

import { confirmSuggestionResultSchema, ruleViewSchema } from "@orb/contracts/automation";
import type { Db } from "@orb/db";
import { automationFires, automationOwnerBudgets, automationRuleState, automationRules, globalVariables } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type {
  AutomationOwnerBudgetRow,
  AutomationRuleRow,
  AutomationService,
  GlobalVariableRow,
  SeededAutomationConfirmation,
  SeededAutomationRun,
  SeededAutomationTestFires,
  SeededCreatedAutomationRule,
} from "../automation.ts";

/** Capture the exact production-returned rule identity, including later enablement and fire stamps. */
export async function captureAutomationRule(db: Db, ruleId: AutomationRuleRow["id"]): Promise<AutomationRuleRow | undefined> {
  return await db.select().from(automationRules).where(eq(automationRules.id, ruleId)).get();
}

/** Retain the native public birth beside its separate author/request-bearing row. */
export async function seedCreatedAutomationRule(
  root: ServerProducerRoot,
  params: Parameters<AutomationService["createRule"]>[0],
): Promise<SeededCreatedAutomationRule> {
  const db = root.db;
  const createRule = root.services.automation.createRule;
  const view = ruleViewSchema.parse(await createRule(params));
  const row = await captureAutomationRule(db, view.id);
  if (row === undefined) {
    throw new Error("production rule creation left no canonical automation-rule row");
  }
  return { view, row };
}

/** Consume a genuinely raised rule ask and preserve its native outcome with the resulting provenance. */
export async function seedAutomationConfirmation(
  root: ServerProducerRoot,
  params: Parameters<AutomationService["confirmSuggestion"]>[0],
  ruleId: AutomationRuleRow["id"],
): Promise<SeededAutomationConfirmation> {
  const db = root.db;
  const confirm = root.services.automation.confirmSuggestion;
  const result = confirmSuggestionResultSchema.parse(await confirm(params));
  return { result, ...(await captureAutomationExecution(db, ruleId)) };
}

export async function seedAutomationOwnerBudget(
  root: ServerProducerRoot,
  params: Parameters<AutomationService["setOwnerBudgets"]>[0],
): Promise<AutomationOwnerBudgetRow> {
  const db = root.db;
  const setOwnerBudgets = root.services.automation.setOwnerBudgets;
  await setOwnerBudgets(params);
  const row = await db.select().from(automationOwnerBudgets).where(eq(automationOwnerBudgets.ownerId, params.principal.userId)).get();
  if (row === undefined) {
    throw new Error("production budget write left no canonical automation-owner-budget row");
  }
  return row;
}

export async function seedGlobalVariable(root: ServerProducerRoot, params: Parameters<AutomationService["setGlobalVariable"]>[0]): Promise<GlobalVariableRow> {
  const db = root.db;
  const setGlobalVariable = root.services.automation.setGlobalVariable;
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

/** Paused/suggested runs may write no fire; analysis state exists only after its genuine producer runs. */
export async function seedAutomationRun(root: ServerProducerRoot, params: Parameters<AutomationService["runRuleNow"]>[0]): Promise<SeededAutomationRun> {
  const db = root.db;
  const runRuleNow = root.services.automation.runRuleNow;
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

export async function seedAutomationRuleRows(root: ServerProducerRoot, params: Parameters<AutomationService["createRule"]>[0]): Promise<AutomationRuleRow> {
  return (await seedCreatedAutomationRule(root, params)).row;
}

/** The dry run executes no action, but its actual provenance ledger is not empty. */
export async function seedAutomationTestFiresRows(
  root: ServerProducerRoot,
  params: Parameters<AutomationService["testRule"]>[0],
): Promise<SeededAutomationTestFires> {
  const db = root.db;
  const testRule = root.services.automation.testRule;
  const result = await testRule(params);
  const { fires } = await captureAutomationExecution(db, params.ruleId);
  if (fires.length === 0) {
    throw new Error("production rule dry run left no canonical automation fire rows");
  }
  return { result, fires };
}
