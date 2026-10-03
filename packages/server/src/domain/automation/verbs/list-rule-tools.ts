import type { AutomationRuleTools } from "@orb/contracts/automation";
import type { AutomationContext, AutomationService } from "../contract/service.ts";

export function createListRuleTools(ctx: AutomationContext): AutomationService["listRuleTools"] {
  return ({ principal }): Promise<AutomationRuleTools> => Promise.resolve(ctx.listRuleTools(principal.userId));
}
