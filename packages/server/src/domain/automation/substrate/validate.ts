// domain/automation/substrate/validate — the read-free write-edge bounds: the authored rule name, and
// `assertFireRateCap`, the authoritative bound on the owner BUDGET plane. A belt's ceiling belongs beside the
// per-rule ceiling it has to cohere with (`persistence/validate.ts`), not only on the wire.

import { AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR, automationRuleEditableSchema } from "@orb/contracts/automation";
import { z } from "zod";
import { BudgetValidationError, RuleValidationError } from "../contract/errors.ts";

/** Direct service callers meet the same authored name bound as the wire and storage. */
export function assertRuleName(name: string): void {
  const parsed = automationRuleEditableSchema.shape.name.safeParse(name);
  if (!parsed.success) {
    throw new RuleValidationError("name", z.prettifyError(parsed.error));
  }
}

/** THE AUTHORITATIVE BOUND on the editable fire-rate BELT — the per-owner cap (`setOwnerBudgets`).
 *
 *  A rule's OWN `maxFiresPerHour` has been 0..240 since v1 (`validateRuleInput` in `persistence/validate.ts`); the budget plane
 *  had no ceiling at all, and the wire's `int().min(0)` let an owner set a nine-digit "cap" that bounds nothing
 *  while the panel reads as configured. The belt exists to make a runaway rule stop hammering a paid API, so a
 *  cap that cannot be exceeded is not a cap.
 *
 *  IT LIVES AT THE VERB, not only on the wire, because the wire is not the only door: compose can reach the
 *  verb directly, and the transport schema's `int()`/`min(0)` half is a MIRROR of this one (the header of
 *  `AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR` states the pairing). `undefined` is the "keep the current value"
 *  patch and is admitted untouched. */
export function assertFireRateCap(maxFiresPerHour: number | undefined): void {
  if (maxFiresPerHour === undefined) {
    return;
  }
  if (!Number.isInteger(maxFiresPerHour) || maxFiresPerHour < 0 || maxFiresPerHour > AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR) {
    throw new BudgetValidationError(`maxFiresPerHour must be a whole number in 0..${AUTOMATION_BUDGET_MAX_FIRES_PER_HOUR}`);
  }
}
