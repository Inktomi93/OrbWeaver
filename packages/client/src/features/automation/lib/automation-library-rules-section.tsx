// The Automation LIBRARY-WIDE RULES config-section CONTRIBUTION — C5's
// owner-global rule list + picker as the Automation group's first row. Distinct from `automationRulesSection`
// (the per-CHAT rules section chat's "This chat" tab renders): same components, chat-less scope. No `owns`:
// rule verbs, not settings.

import type { ConfigSectionContribution } from "#state";
import { OwnerRulesSection } from "../components/owner-automation-sections.tsx";
import { AUTOMATION_RULES_SUBCATEGORY } from "./automation-nav.ts";

export const automationLibraryRulesSection: ConfigSectionContribution = {
  id: "automation-library-rules",
  anchor: "automation",
  nav: AUTOMATION_RULES_SUBCATEGORY,
  body: () => <OwnerRulesSection />,
};
