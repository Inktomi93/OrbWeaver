// domain/automation — COMPOSITION ROOT. Wires the A3 global-var verbs + the A4 rule/budget/fire/lifecycle
// verbs + the A5 `handleEvent` dispatch front door over the injected `AutomationContext` (db + clock + prng +
// id minters + the `can()` seam + the A5 ops/runArm/enabled-index/notify seams). ZERO logic — it only
// calls the factories and assembles the `AutomationService`. The context is built at the entry composition
// root and passed in; automation sideways-imports nothing. A6 (arms) wires the injected `runArm` dispatcher.

import type { AutomationContext, AutomationService } from "./contract/service";
import { createHandleEvent } from "./substrate/handle-event";
import { createCreateRule } from "./verbs/create-rule";
import { createDeleteGlobalVariable } from "./verbs/delete-global-variable";
import { createDeleteRule } from "./verbs/delete-rule";
import { createGetBudgets } from "./verbs/get-budgets";
import { createGetGlobalVariable } from "./verbs/get-global-variable";
import { createListFires } from "./verbs/list-fires";
import { createListGlobalVariables } from "./verbs/list-global-variables";
import { createListRules } from "./verbs/list-rules";
import { createReorderRules } from "./verbs/reorder-rules";
import { createResolveStreamAuthority } from "./verbs/resolve-stream-authority";
import { createSetBudgets } from "./verbs/set-budgets";
import { createSetGlobalVariable } from "./verbs/set-global-variable";
import { createSetRuleEnabled } from "./verbs/set-rule-enabled";
import { createTestRule } from "./verbs/test-rule";
import { createUpdateRule } from "./verbs/update-rule";

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
