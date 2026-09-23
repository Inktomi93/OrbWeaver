// The Automation RATE-LIMIT config-section CONTRIBUTION — the owner ceiling
// every chat-less rule counts against, as the Automation group's second row. No `owns`: the belt lives in
// `automation_owner_budgets` (`setOwnerBudgets`), not in a settings tier.

import type { ConfigSectionContribution } from "#state";
import { OwnerBudgetSection } from "../components/owner-automation-sections.tsx";
import { AUTOMATION_BUDGET_SUBCATEGORY } from "./automation-nav.ts";

export const automationBudgetSection: ConfigSectionContribution = {
  id: "automation-budget",
  anchor: "automation",
  nav: AUTOMATION_BUDGET_SUBCATEGORY,
  body: () => <OwnerBudgetSection />,
};
