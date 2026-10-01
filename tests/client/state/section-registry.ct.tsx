// The real registry's title hooks must answer with cold caches and no selected subject.
// Corpus names its active mode; the other sections use the shell's section fallback.
//
// Why totality is the assertion: the field is required on the base of the union, so tsc already proves it
// is DECLARED — what tsc cannot prove is that each one RUNS. A resolver that suspends, throws on a null
// selection, or reads a query without a provider would blank the topbar of exactly one section.

import { expect, test } from "@playwright/experimental-ct-react";
import { CORPUS_MODE_LABELS, CORPUS_MODES } from "../../../packages/client/src/lib/corpus-modes.ts";
import { SECTION_IDS } from "../../../packages/client/src/state/section-ids.ts";
import { SectionTitleTotalityProbe } from "./_ct-stories.tsx";

test("every real section resolves a cold title, and Corpus names its active mode", async ({ mount }) => {
  const probe = await mount(<SectionTitleTotalityProbe />);

  // Corpus has a mode to name before any subject opens; other sections use the shell's section fallback.
  await Promise.all(SECTION_IDS.map((id) => expect(probe.locator(`output[data-section="${id}"]`)).toHaveText(`${id}=${id === "corpus" ? "Explore" : "none"}`)));
  for (const mode of CORPUS_MODES) {
    await probe.getByRole("button", { name: `Corpus mode ${mode}`, exact: true }).click();
    await expect(probe.locator('output[data-section="corpus"]')).toHaveText(`corpus=${CORPUS_MODE_LABELS[mode]}`);
  }
});
