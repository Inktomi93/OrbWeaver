import type { AutomationRuleId, UserId } from "@orb/kit/ids";

export type RuleOwnedBy = (ruleId: AutomationRuleId, userId: UserId) => Promise<boolean>;
