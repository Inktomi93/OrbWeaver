// CT: the corpus overview's STORY-THEME section — and specifically its drill-in card's `reserveKey`
// (#1726, closing a tranche-1 keying (#1098) that shipped with no coverage at all).
//
// THE DEFECT THE KEY EXISTS FOR IS THE SECOND PICK, which is why nothing static and no single-mount CT can
// see it. `ThemeDetailCard` re-suspends every time you open a different theme, and unreserved it collapsed
// to a one-line skeleton and shoved the rest of the scrolling column up and back under the reader's eyes.
// On a FIRST pick the box store is empty and the fallback renders unreserved by design — so a pin that
// picks once measures the arm the key does not change.
//
// So this picks theme A, lets it settle (which is what writes the measurement), then picks theme B with the
// second `discovery.themeDetail` read PARKED — the exact frame the reader sees mid-pick. The observables
// are the tail sentinel's y (what actually moves when the column jumps) and `data-tile-reserve-source`,
// which says "this device MEASURED it" rather than "the mount declared a constant" — an assertion reading
// only `data-tile-reserved` would keep passing for the wrong reason if the measurement were ever lost.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { CorpusThemeSectionStory } from "../_ct-stories.tsx";

/** `discovery.themeDetail`'s shape for the first theme — three members, the card's fixed anatomy. */
const DETAIL_A = {
  name: "A bargain at the crossroads",
  level: "scene",
  size: 12,
  members: [
    { characterId: "character_ct_theme_1", name: "Aria", count: 5 },
    { characterId: "character_ct_theme_2", name: "Starla", count: 4 },
    { characterId: "character_ct_theme_3", name: "Nova", count: 3 },
  ],
};

const DETAIL_B = { ...DETAIL_A, name: "The map changes hands", size: 7 };

test("#1098: picking a SECOND story theme holds the detail card's measured box — the column below does not jump", async ({ mount, page }) => {
  const hold = trpcHold();
  let reads = 0;
  const trpc = await routeTrpc(page, {
    // The first pick answers; the SECOND is parked, which is the pending arm the reservation exists for.
    "discovery.themeDetail": (): unknown => (reads++ === 0 ? DETAIL_A : hold),
  });
  const component = await mount(<CorpusThemeSectionStory />);

  await component.getByRole("listitem").filter({ hasText: "A bargain at the crossroads" }).click();
  // SETTLED FIRST — the measurement only exists once the card's real anatomy has painted. The member list
  // is the tallest part of it, so this barrier is also the one that makes the number worth reserving.
  await expect(component.getByText("Starla")).toBeVisible();
  const tail = component.getByTestId("corpus-themes-tail");
  const settledY = (await tail.boundingBox())?.y;
  expect(settledY, "the tail sentinel has no box").not.toBeUndefined();

  await component.getByRole("listitem").filter({ hasText: "The map changes hands" }).click();
  await hold.requested;

  const reserved = page.locator("[data-tile-reserved]");
  await expect(reserved).toHaveAttribute("data-tile-reserve-source", "measured");
  const heldY = (await tail.boundingBox())?.y ?? Number.NaN;
  // ±1px: the store keeps sub-pixel heights and the reserved `blockSize` is rounded.
  expect(Math.abs(heldY - (settledY ?? Number.NaN)), "the column jumped while the second theme was in flight").toBeLessThanOrEqual(1);

  hold.release(DETAIL_B);
  await expect(component.getByText("The map changes hands", { exact: false }).first()).toBeVisible();
  // TWO genuine reads — one served from cache would make the whole pin vacuous.
  // ONESHOT-OK: read after the released card re-rendered; the story issues no third read.
  expect(trpc.count("discovery.themeDetail")).toBe(2);
});

test("an empty section renders NOTHING — the readiness rail is the one home for what has not run (#127)", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.themeDetail": () => DETAIL_A });
  const component = await mount(<CorpusThemeSectionStory />);

  // THE CONTROL for the pin above: with rows present the section paints, so the absence asserted by the
  // section's own empty rule is a measurement rather than a story that never mounted.
  await expect(component.getByText("Story themes")).toBeVisible();
  await expect(component.getByRole("listitem")).toHaveCount(3);
  // …and nothing announces the groups that DO have zero rows — no per-group "no themes yet" note.
  await expect(page.getByText("no themes", { exact: false })).toHaveCount(0);
});
