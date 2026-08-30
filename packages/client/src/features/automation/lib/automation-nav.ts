// The Automation group's nav entries (config-revamp-design.md §6.8) — the ONE home for both ends of the
// anchor wiring: each contribution def spells its `nav` from these and each section body stamps
// `configAnchorId("automation", …)` from the same constant, so a LIST row can never address an anchor no
// section stamps (the `OWNER_*_ANCHOR` constants the surface used to export, re-homed as navs).

import type { ConfigSubcategory } from "#state";

export const AUTOMATION_RULES_SUBCATEGORY: ConfigSubcategory = {
  id: "rules",
  label: "Library-wide rules",
  keywords: ["automation", "rule", "trigger", "global"],
};

export const AUTOMATION_BUDGET_SUBCATEGORY: ConfigSubcategory = {
  id: "budget",
  label: "Rate limit",
  keywords: ["budget", "limit", "runs per hour", "spend"],
};
