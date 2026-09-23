// domain/automation — COMPOSITION ROOT. Wires the A3 global-var verbs + the A4 rule/budget/fire/lifecycle
// verbs + the A5 `handleEvent` dispatch front door over the injected `AutomationContext` (db + clock + prng +
// id minters + the `can()` seam + the A5 ops/runArm/enabled-index/notify seams). ZERO logic — it only
// calls the factories and assembles the `AutomationService`. The context is built at the entry composition
// root and passed in; automation sideways-imports nothing. A6 (arms) wires the injected `runArm` dispatcher.

import type { AutomationContext, AutomationService } from "./contract/service.ts";
import { createHandleEvent } from "./substrate/handle-event.ts";
import { createConfirmSuggestion } from "./verbs/confirm-suggestion.ts";
import { createCreateRule, createPlanRule } from "./verbs/create-rule.ts";
import { createCreateRuleFromPreset } from "./verbs/create-rule-from-preset.ts";
import { createDeleteGlobalVariable } from "./verbs/delete-global-variable.ts";
import { createDeleteRule } from "./verbs/delete-rule.ts";
import { createDismissSuggestion } from "./verbs/dismiss-suggestion.ts";
import { createGetGlobalVariable } from "./verbs/get-global-variable.ts";
import { createGetOwnerBudgets } from "./verbs/get-owner-budgets.ts";
import { createListChatActivity } from "./verbs/list-chat-activity.ts";
import { createListFires } from "./verbs/list-fires.ts";
import { createListGlobalVariables } from "./verbs/list-global-variables.ts";
import { createListOwnerRules } from "./verbs/list-owner-rules.ts";
import { createListRulePresets } from "./verbs/list-rule-presets.ts";
import { createListRules } from "./verbs/list-rules.ts";
import { createReorderRules } from "./verbs/reorder-rules.ts";
import { createResolveStreamAuthority } from "./verbs/resolve-stream-authority.ts";
import { createRunRuleNow } from "./verbs/run-rule-now.ts";
import { createSetGlobalVariable } from "./verbs/set-global-variable.ts";
import { createSetOwnerBudgets } from "./verbs/set-owner-budgets.ts";
import { createSetRuleEnabled } from "./verbs/set-rule-enabled.ts";
import { createSetRuleSuggestOnRefusal } from "./verbs/set-rule-suggest-on-refusal.ts";
import { createTestRule } from "./verbs/test-rule.ts";
import { createUpdateRule } from "./verbs/update-rule.ts";

export function createAutomationService(ctx: AutomationContext): AutomationService {
  // Built ONCE and injected into BOTH mints: a preset's rule set is validated and shaped by the SAME planner
  // a hand-authored rule goes through (one validation, one row shape), and the dependency stays visible at
  // the composition root instead of hiding inside a verb→verb import. The two differ only in how they
  // COMMIT — one row, or one all-or-nothing batch (#1427).
  const planRule = createPlanRule(ctx);
  const createRule = createCreateRule(ctx, planRule);
  return {
    getGlobalVariable: createGetGlobalVariable(ctx),
    setGlobalVariable: createSetGlobalVariable(ctx),
    deleteGlobalVariable: createDeleteGlobalVariable(ctx),
    listGlobalVariables: createListGlobalVariables(ctx),
    createRule,
    createRuleFromPreset: createCreateRuleFromPreset(ctx, planRule),
    listRulePresets: createListRulePresets(),
    updateRule: createUpdateRule(ctx),
    setRuleEnabled: createSetRuleEnabled(ctx),
    setRuleSuggestOnRefusal: createSetRuleSuggestOnRefusal(ctx),
    deleteRule: createDeleteRule(ctx),
    reorderRules: createReorderRules(ctx),
    listRules: createListRules(ctx),
    listOwnerRules: createListOwnerRules(ctx),
    listFires: createListFires(ctx),
    listChatActivity: createListChatActivity(ctx),
    getOwnerBudgets: createGetOwnerBudgets(ctx),
    setOwnerBudgets: createSetOwnerBudgets(ctx),
    testRule: createTestRule(ctx),
    runRuleNow: createRunRuleNow(ctx),
    confirmSuggestion: createConfirmSuggestion(ctx),
    dismissSuggestion: createDismissSuggestion(ctx),
    resolveStreamAuthority: createResolveStreamAuthority(ctx),
    handleEvent: createHandleEvent(ctx),
  };
}
