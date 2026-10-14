// The caller's absent-row read uses the same canonical default as the production budget writer.
import type { OwnerBudgetView } from "@orb/contracts/automation";
import { AUTOMATION_OWNER_BUDGET_DEFAULTS, ownerBudgetViewSchema } from "@orb/contracts/automation";

export function makeOwnerBudgetView(overrides: Partial<OwnerBudgetView> = {}): OwnerBudgetView {
  return ownerBudgetViewSchema.parse({ ...AUTOMATION_OWNER_BUDGET_DEFAULTS, ...overrides });
}
