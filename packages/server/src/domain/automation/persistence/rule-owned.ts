// A connection actor may name only an automation rule held by that same owner.

import { automationRules } from "@orb/db";
import { fetchOwned } from "@orb/db/query";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { RuleOwnedBy } from "../contract/rule-owned.ts";

export function createRuleOwnedBy(handle: DatabaseHandle): RuleOwnedBy {
  const db = databaseForOwner(handle);
  return async (ruleId, userId): Promise<boolean> => (await fetchOwned(db, automationRules, ruleId, userId)) !== undefined;
}
