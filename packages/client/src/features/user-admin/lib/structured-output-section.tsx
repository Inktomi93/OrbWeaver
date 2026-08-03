// The Structured-output admin-SECTION CONTRIBUTION (D126 / client-architecture-lockdown.md §6c) — the
// co-located def user-admin exports on its front door; main.tsx assembles it into the admin pane's
// settings-section registry at the `admin` anchor. user-admin owns it (admin-tier config).

import type { SettingsSectionContribution } from "#state";
import { StructuredOutputSection } from "../components/structured-output-section";
import { STRUCTURED_OUTPUT_SUBCATEGORY } from "./structured-output-nav";

// The contribution id has ONE home — this const. It is both the registry key and the id the body REPORTS its
// save status under (SET-SEAMS §3), so the body takes it as a prop rather than re-spelling the literal.
const SECTION_ID = "admin-structured-output";

export const structuredOutputSection: SettingsSectionContribution = {
  id: SECTION_ID,
  anchor: "admin",
  nav: STRUCTURED_OUTPUT_SUBCATEGORY,
  owns: { tier: "app", keys: ["structuredOutputShape"] },
  body: () => <StructuredOutputSection sectionId={SECTION_ID} />,
};
