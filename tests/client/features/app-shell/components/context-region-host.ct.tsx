// CT: the whole-pane REGION CLAIM (HUD-1 §3.1/§3.2 — `context-region-host.tsx`). The seam is proven with a
// FAKE claimant through the REAL path (mint → `resolveContextTabs` → `SectionContextHost`), so it holds
// with zero rpg involvement:
//
//  - a CLAIMING region owns the pane — the generic `.ctx-tab-strip` never renders;
//  - it is handed the FULL resolved tab set (a claim never suppresses resolution) and the resolved
//    selection (the `defaultTab` flag decides the fresh landing, exactly as in the generic panel);
//  - `view.selectTab` writes the SHARED `contextTab` store — asserted on a probe reading `#state`
//    directly, not on the claimant's own re-render ([[assert-the-mutation-fired]]);
//  - a NON-claiming contributor is ignored — the generic panel renders (the §3.3 regression floor);
//  - a claimed pane's BAND renders nothing at all (D66 A1 suspended for a claimed context panel).

import { expect, test } from "@playwright/experimental-ct-react";
import { ContextRegionClaimStory, ContextRegionHeaderStory, ContextRegionNoClaimStory } from "../_ct-stories.tsx";

test("a claiming region owns the pane: it renders, the generic strip does not", async ({ mount }) => {
  const component = await mount(<ContextRegionClaimStory />);

  await expect(component.getByTestId("fake-hud")).toBeVisible();
  // The shell rendered NONE of its own chrome — no tablist at all under a claim.
  await expect(component.getByRole("tablist")).toHaveCount(0);
  await expect(component.locator(".ctx-tab-strip")).toHaveCount(0);
  // …and the host wrapper is the single-writer probe handle for the geometry passes.
  await expect(component.locator("[data-context-region]")).toHaveCount(1);
});

test("the claimant is handed the FULL resolved set + the resolved selection (defaultTab wins the landing)", async ({ mount }) => {
  const component = await mount(<ContextRegionClaimStory />);

  // Every resolved tab crosses — game AND meta, declared order. A claim never suppresses resolution.
  await expect(component.getByTestId("fake-hud-tabs")).toHaveText("members,fake.status,fake.scene");
  // `members` is the declared-order first, but `fake.status` flags `defaultTab` — the shared resolver
  // (the ONE home) lands there, so the claimant and the generic panel cannot disagree.
  await expect(component.getByTestId("fake-hud-active")).toHaveText("fake.status");
  await expect(component.getByTestId("fake-hud-viewport").getByTestId("ctx-body-status")).toBeVisible();
});

test("view.selectTab writes the SHARED contextTab store (not a local mirror)", async ({ mount }) => {
  const component = await mount(<ContextRegionClaimStory />);
  // Nothing stored yet: the landing came from the `defaultTab` flag, not from the store.
  await expect(component.getByTestId("ctx-tab-store")).toHaveText("unset");

  await component.getByRole("button", { name: "Members" }).click();

  // The SEAM fired — the store itself changed, read through `#state`'s own hook.
  await expect(component.getByTestId("ctx-tab-store")).toHaveText("members");
  // …and the handed view followed it (stored selection wins over the `defaultTab` flag).
  await expect(component.getByTestId("fake-hud-active")).toHaveText("members");
  await expect(component.getByTestId("fake-hud-viewport").getByTestId("ctx-body-members")).toBeVisible();
});

test("a NON-claiming region contributor is ignored — the generic panel renders (§3.3 floor)", async ({ mount }) => {
  const component = await mount(<ContextRegionNoClaimStory />);

  await expect(component.getByTestId("fake-hud")).toHaveCount(0);
  await expect(component.locator("[data-context-region]")).toHaveCount(0);
  await expect(component.getByRole("tab", { name: "Members" })).toBeVisible();
});

test("a claimed pane's band renders nothing — not the neutral Details fallback", async ({ mount }) => {
  const component = await mount(<ContextRegionHeaderStory />);

  // `component` IS the band slot (the story's root element) — a claimed pane leaves it with no child.
  await expect(component).toHaveAttribute("data-testid", "band-slot");
  await expect(component).toBeEmpty();
});
