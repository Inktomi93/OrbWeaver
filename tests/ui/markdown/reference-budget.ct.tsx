// One long reference-link definition reused by many references copies its address and title into each resolved link;
// on the plain path, under both trust policies, only as many resolve as the copy budget allows and the rest draw as their
// own words. A reply whose few references copy little resolves every one.
// @subject packages/ui/src/markdown/reference-budget.ts

import { expect, test } from "@orb/testkit/ct-corpus";
import type { ReferenceBudgetStory } from "./_reference-budget-stories.tsx";
import { REFERENCE_WORD, reusedReference } from "./reference-budget.shapes.ts";

const STORY = "tests/ui/markdown/_reference-budget-stories/ReferenceBudgetStory";
const TRUSTS = ["trusted", "untrusted"] as const;
// The plain path draws a link as the renderer's confirm-first control, which carries no address.
const LINK = '[data-streamdown="link"]';

for (const trust of TRUSTS) {
  test(`a definition reused past the copy budget resolves only its budget under the ${trust} policy`, async ({ mount }) => {
    // Below the plain path's render guard, so the body parses as Markdown.
    const { source, resolved } = reusedReference(1500, 1000);
    const component = await mount<typeof ReferenceBudgetStory>(STORY, { trust, mode: "static", children: source });
    await expect(component.locator(LINK)).toHaveCount(resolved);
    expect(resolved).toBeLessThan(1500);
    // A reference past the budget draws its own word, as an undefined one does.
    await expect(component.locator("p").last()).toContainText(`${REFERENCE_WORD} ${REFERENCE_WORD}`);
  });

  test(`a few references to one definition all resolve under the ${trust} policy`, async ({ mount }) => {
    const { source, resolved } = reusedReference(20, 40);
    expect(resolved).toBe(20);
    const component = await mount<typeof ReferenceBudgetStory>(STORY, { trust, mode: "static", children: source });
    await expect(component.locator(LINK)).toHaveCount(20);
  });
}
