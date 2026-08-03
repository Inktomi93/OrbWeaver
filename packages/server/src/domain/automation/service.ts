// domain/automation — COMPOSITION ROOT. Wires the A3 global-var verbs + the A4 rule/budget/fire/lifecycle
// verbs + the A5 `handleEvent` dispatch front door over the injected `AutomationContext` (db + clock + prng +
// id minters + the `can()` seam + the A5 ops/runArm/enabled-index/notify seams). ZERO logic — it only
// calls the factories and assembles the `AutomationService`. The context is built at the entry composition
// root and passed in; automation sideways-imports nothing. A6 (arms) wires the injected `runArm` dispatcher.

import type { AutomationContext, AutomationService } from "./contract/service.ts";
import { createHandleEvent } from "./substrate/handle-event.ts";
import { createCreateRule } from "./verbs/create-rule.ts";
import { createDeleteGlobalVariable } from "./verbs/delete-global-variable.ts";
import { createDeleteRule } from "./verbs/delete-rule.ts";
import { createGetBudgets } from "./verbs/get-budgets.ts";
import { createGetGlobalVariable } from "./verbs/get-global-variable.ts";
import { createListFires } from "./verbs/list-fires.ts";
import { createListGlobalVariables } from "./verbs/list-global-variables.ts";
import { createListRules } from "./verbs/list-rules.ts";
import { createReorderRules } from "./verbs/reorder-rules.ts";
import { createResolveStreamAuthority } from "./verbs/resolve-stream-authority.ts";
import { createSetBudgets } from "./verbs/set-budgets.ts";
import { createSetGlobalVariable } from "./verbs/set-global-variable.ts";
import { createSetRuleEnabled } from "./verbs/set-rule-enabled.ts";
import { createTestRule } from "./verbs/test-rule.ts";
import { createUpdateRule } from "./verbs/update-rule.ts";

export function createAutomationService(ctx: AutomationContext): AutomationService {
  return {
    getGlobalVariable: createGetGlobalVariable(ctx),
    setGlobalVariable: createSetGlobalVariable(ctx),
    deleteGlobalVariable: createDeleteGlobalVariable(ctx),
    listGlobalVariables: createListGlobalVariables(ctx),
    createRule: createCreateRule(ctx),
    updateRule: createUpdateRule(ctx),
    setRuleEnabled: createSetRuleEnabled(ctx),
    deleteRule: createDeleteRule(ctx),
    reorderRules: createReorderRules(ctx),
    listRules: createListRules(ctx),
    listFires: createListFires(ctx),
    setBudgets: createSetBudgets(ctx),
    getBudgets: createGetBudgets(ctx),
    testRule: createTestRule(ctx),
    resolveStreamAuthority: createResolveStreamAuthority(ctx),
    handleEvent: createHandleEvent(ctx),
  };
}
