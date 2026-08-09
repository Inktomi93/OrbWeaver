// section-registry CT — the contract module's one RUNTIME export (`NO_SELECTION_TITLE`) and the field it
// exists for: `SectionDefinition.useSelectionTitle`, which the shell calls UNCONDITIONALLY inside its keyed
// topbar-title component. The pin is TOTALITY over the REAL registry: every one of the nine sections
// answers, and none throws when its own cache is cold (each resolver is a gated, cache-first read).
//
// Why totality is the assertion: the field is required on the base of the union, so tsc already proves it
// is DECLARED — what tsc cannot prove is that each one RUNS. A resolver that suspends, throws on a null
// selection, or reads a query without a provider would blank the topbar of exactly one section.

import { expect, test } from "@playwright/experimental-ct-react";
import { SECTION_IDS } from "../../../packages/client/src/state/shell-store.ts";
import { SectionTitleTotalityProbe } from "./_ct-stories.tsx";

test("every real section answers `useSelectionTitle` — nothing selected ⇒ `null`, and no section throws", async ({ mount }) => {
  const probe = await mount(<SectionTitleTotalityProbe />);

  // Cold cache + no selection: every section resolves to the "nothing to name" answer, which is what makes
  // the shell print the SECTION label instead of a blank bar. A section with no member to name (home)
  // reaches the same answer through `NO_SELECTION_TITLE`.
  await Promise.all(SECTION_IDS.map((id) => expect(probe.locator(`output[data-section="${id}"]`)).toHaveText(`${id}=none`)));
});
