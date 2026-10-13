// A connection actor may name only an automation rule held by that same owner.
import type { Db } from "@orb/db";
import { automationRules } from "@orb/db";
import { fetchOwned } from "@orb/db/query";
import type { RuleOwnedBy } from "../contract/rule-owned.ts";

export function createRuleOwnedBy(db: Db): RuleOwnedBy {
  return async (ruleId, userId): Promise<boolean> => (await fetchOwned(db, automationRules, ruleId, userId)) !== undefined;
}
