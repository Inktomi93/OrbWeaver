import type { AutomationRuleToolView } from "@orb/contracts/automation";
import type { AutomationContext, AutomationService } from "../contract/service.ts";

export function createListRuleTools(ctx: AutomationContext): AutomationService["listRuleTools"] {
  return ({ principal }): Promise<AutomationRuleToolView[]> => Promise.resolve(ctx.listRuleTools(principal.userId));
}
