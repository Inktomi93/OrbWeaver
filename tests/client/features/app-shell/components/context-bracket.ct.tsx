// CT: the HEAD-BAND REGION CLAIM through the REAL path (HUD-1 §3.1/§3.2 as re-shaped by the context
// bracket, #860 — `context-bracket.tsx`). A FAKE claimant proves the seam with zero rpg involvement:
//
//  - a CLAIMING region takes the pane's HEAD BAND — and ONLY the band: the shell's bracket renders the
//    rails, the viewport and the ground around it, and the section's own header does NOT render beside it
//    ("one slot, three contents — never a second head");
//  - the bracket is handed the FULL resolved tab set (a claim never suppresses resolution) and lands on the
//    `defaultTab` flag exactly as an unclaimed pane does;
//  - a rail cell writes the SHARED `contextTab` store — asserted on a probe reading `#state` directly
//    ([[assert-the-mutation-fired]]);
//  - a NON-claiming contributor is ignored — the section's own band renders (the §3.3 regression floor);
//  - the shell's own band slot renders NOTHING over a tabs pane, claimed or not.

import { expect, test } from "@playwright/experimental-ct-react";
import { ContextRegionClaimStory, ContextRegionHeaderStory, ContextRegionNoClaimStory } from "../_ct-stories.tsx";

test("a claiming region takes the head band: its band renders, the section's own does not, the bracket renders around it", async ({ mount }) => {
  const component = await mount(<ContextRegionClaimStory />);

  const band = component.locator('[data-slot="context-bracket-band"]');
  await expect(band.getByTestId("fake-band")).toBeVisible();
  await expect(component.getByTestId("section-band")).toHaveCount(0);
  // The shell rendered its ONE column — no tablist anywhere, one bracket probe handle.
  await expect(component.getByRole("tablist")).toHaveCount(0);
  await expect(component.locator("[data-context-bracket]")).toHaveCount(1);
  await expect(component.getByRole("toolbar", { name: "Game state" })).toBeVisible();
  await expect(component.getByRole("toolbar", { name: "Chat" })).toBeVisible();
});

test("the bracket is handed the FULL resolved set and lands on the defaultTab flag", async ({ mount }) => {
  const component = await mount(<ContextRegionClaimStory />);
  // Every resolved tab crosses — game AND meta, split into their rails.
  await expect(component.getByRole("toolbar", { name: "Game state" }).getByRole("button")).toHaveCount(2);
  await expect(component.getByRole("toolbar", { name: "Chat" }).getByRole("button")).toHaveCount(1);
  // `members` is the declared-order first, but `fake.status` flags `defaultTab` — the ONE resolver lands there.
  await expect(component.getByRole("toolbar", { name: "Game state" }).getByRole("button", { name: "Status" })).toHaveAttribute("aria-current", "true");
  await expect(component.getByTestId("ctx-body-status")).toBeVisible();
});

test("a rail cell writes the SHARED contextTab store (not a local mirror)", async ({ mount }) => {
  const component = await mount(<ContextRegionClaimStory />);
  await expect(component.getByTestId("ctx-tab-store")).toHaveText("unset");

  await component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Members", exact: true }).click();

  await expect(component.getByTestId("ctx-tab-store")).toHaveText("members");
  await expect(component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Members", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(component.getByTestId("ctx-body-members")).toBeVisible();
});

test("a NON-claiming region contributor is ignored — the section's own band renders (§3.3 floor)", async ({ mount }) => {
  const component = await mount(<ContextRegionNoClaimStory />);
  await expect(component.getByTestId("fake-band")).toHaveCount(0);
  await expect(component.locator('[data-slot="context-bracket-band"]').getByTestId("section-band")).toBeVisible();
  await expect(component.getByRole("toolbar", { name: "Chat" }).getByRole("button", { name: "Members", exact: true })).toBeVisible();
});

for (const claimed of [true, false]) {
  test(`the shell's band slot renders nothing over a tabs pane (claimed: ${claimed}) — the bracket owns the head`, async ({ mount }) => {
    const component = await mount(<ContextRegionHeaderStory claimed={claimed} />);
    await expect(component).toHaveAttribute("data-testid", "band-slot");
    await expect(component).toBeEmpty();
  });
}
