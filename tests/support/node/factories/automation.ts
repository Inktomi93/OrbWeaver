// Automation seeds run the production verbs and return their outcomes; rows-tier twins in `rows/automation.ts` read the rows.

import { automationRuleToolsSchema, fireViewSchema, rulePresetViewSchema, ruleViewSchema } from "@orb/contracts/automation";
import type { automationFires, automationOwnerBudgets, automationRuleState, automationRules, globalVariables } from "@orb/db";
import type { ServicesResult } from "@orb/server/entry/compose";
import type { ServerProducerRoot } from "../server.ts";

export type AutomationService = ServicesResult["services"]["automation"];

export type AutomationRuleRow = typeof automationRules.$inferSelect;
export type AutomationOwnerBudgetRow = typeof automationOwnerBudgets.$inferSelect;
export type GlobalVariableRow = typeof globalVariables.$inferSelect;
type AutomationFireRow = typeof automationFires.$inferSelect;
type AutomationRuleStateRow = typeof automationRuleState.$inferSelect;

/** Run the owner's rule creation; the public view it returns is the seed's whole result. */
export async function seedAutomationRule(
  root: ServerProducerRoot,
  params: Parameters<AutomationService["createRule"]>[0],
): Promise<Awaited<ReturnType<AutomationService["createRule"]>>> {
  return await root.services.automation.createRule(params);
}

export interface SeededCreatedAutomationRule {
  readonly view: Awaited<ReturnType<AutomationService["createRule"]>>;
  readonly row: AutomationRuleRow;
}

type AutomationViewParams = Parameters<AutomationService["listRules"]>[0] & Pick<Parameters<AutomationService["listFires"]>[0], "ruleId">;

export interface CapturedAutomationViews {
  readonly rules: Awaited<ReturnType<AutomationService["listRules"]>>;
  readonly ownerRules: Awaited<ReturnType<AutomationService["listOwnerRules"]>>;
  readonly presets: ReturnType<AutomationService["listRulePresets"]>;
  readonly tools: Awaited<ReturnType<AutomationService["listRuleTools"]>>;
  readonly fires: Awaited<ReturnType<AutomationService["listFires"]>>;
  readonly activity: Awaited<ReturnType<AutomationService["listChatActivity"]>>;
}

/** Read the actual management projections without deriving them from private rule or fire rows. */
export async function captureAutomationViews(root: ServerProducerRoot, params: AutomationViewParams): Promise<CapturedAutomationViews> {
  const automation = root.services.automation;
  const presets = automation.listRulePresets();
  const [rules, ownerRules, tools, fires, activity] = await Promise.all([
    automation.listRules(params),
    automation.listOwnerRules(params),
    automation.listRuleTools(params),
    automation.listFires(params),
    automation.listChatActivity(params),
  ]);
  return {
    rules: rules.map((view) => ruleViewSchema.parse(view)),
    ownerRules: ownerRules.map((view) => ruleViewSchema.parse(view)),
    presets: presets.map((view) => rulePresetViewSchema.parse(view)),
    tools: automationRuleToolsSchema.parse(tools),
    fires: fires.map((view) => fireViewSchema.parse(view)),
    activity: activity.map((view) => fireViewSchema.parse(view)),
  };
}

export interface SeededAutomationConfirmation extends Omit<SeededAutomationRun, "result"> {
  readonly result: Awaited<ReturnType<AutomationService["confirmSuggestion"]>>;
}

/** Run the rule dry run; the verb's own result is the seed's whole result. */
export async function seedAutomationTestFires(
  root: ServerProducerRoot,
  params: Parameters<AutomationService["testRule"]>[0],
): Promise<Awaited<ReturnType<AutomationService["testRule"]>>> {
  return await root.services.automation.testRule(params);
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
