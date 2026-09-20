// CT: `preset-structure-tabs.tsx` — specifically its DELIVERY arm's two selects, and the one thing a closed
// select exists to do: state its current setting. (Named for the SOURCE module per the `test-layout` mirror
// rule; the stories it mounts are the delivery arm's, which is where the finding lives.)
//
// THE DEFECT (side-eye 2026-08-22 P2-5). The names-behavior options were spelled `<Mode> — <what it does>`
// ("Content — always prefix “Name: ”"), and the trigger renders the picked option INLINE inside
// `--width-control-col` — a FIXED 200px track (UIP-404: the fixed column is what makes every settings row's
// control share one edge). Measured at the 568px docked pane: scrollWidth 236 against clientWidth 154,
// rendered `Content — always p…`, which is not even distinguishable from the sibling option that also
// starts "Content — always" — with ~240px of empty gutter beside it. Recognition became recall.
//
// The fix applies owner ruling O-4, already recorded in `preset-nav.ts` for the compaction select next to
// these: the mode NAME is the label and the teaching rides the field's hint, where it costs no width. The
// fixed control column is deliberately NOT touched — it is app-wide law, and widening it here would trade
// one surface's overflow for every settings row's alignment.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { DeliveryTabNarrowStory, DeliveryTabWideStory } from "./_delivery-tab-stories.tsx";

/** Whether a node's own text is wider than the box drawn for it — the ellipsis, read off the layout rather
 *  than off the rendered glyphs. `scrollWidth`/`clientWidth` are integers, so equality IS "it fits". */
function overflows(locator: Locator): Promise<boolean> {
  return locator.evaluate((el) => el.scrollWidth > el.clientWidth);
}

/** The node that actually elides: the trigger's box is `overflow: visible` and its VALUE child carries
 *  `min-w-0 truncate` (`select/variants.ts`). Measuring the trigger would be a false clean — the review
 *  measured this span (scrollWidth 236 · clientWidth 154 · text-overflow: ellipsis). */
const VALUES = '[data-slot="select-value"]';

test("P2-5: the Speaker-names trigger states its whole value at the DOCKED pane width", async ({ mount, page }) => {
  const component = await mount(<DeliveryTabNarrowStory />);
  // SETTLED barrier: the picked label is rendered synchronously by the seeded form, so its presence means
  // the row has painted at its final width.
  await expect(component.getByRole("heading", { name: "Delivery" })).toBeVisible();
  const value = page.locator(VALUES).first();
  await expect(value).toBeVisible();
  await expect(value).toContainText("Content");

  expect(await overflows(value), "the Speaker-names trigger truncates its own current value").toBe(false);
});

// The SAME assertion at the both-panels-hidden pane. The control column is fixed, so this is not a wider
// box — it is the proof that the finding's range has no other end where the old labels would have fitted.
test("P2-5: …and at the both-panels-hidden pane, where the extra width goes to the gutter, not the trigger", async ({ mount, page }) => {
  const component = await mount(<DeliveryTabWideStory />);
  await expect(component.getByRole("heading", { name: "Delivery" })).toBeVisible();
  const value = page.locator(VALUES).first();
  await expect(value).toBeVisible();

  expect(await overflows(value), "the Speaker-names trigger truncates its own current value").toBe(false);
});

// The teaching the labels used to carry did not evaporate — O-4 moves it to the field's hint, and a fix that
// simply deleted the explanation would be a worse surface than the one it replaced.
test("P2-5: the four behaviours are still spelled — on the field's hint, where they cost no width", async ({ mount, page }) => {
  const component = await mount(<DeliveryTabNarrowStory />);
  await component.getByRole("button", { name: "More info about Speaker names" }).hover();
  // ADDRESSED PER HOME, not by bare text. The hint has TWO homes by design — the rendered popup a sighted
  // reader sees, and the `sr-only` description the trigger's `aria-describedby` points at (the popup itself
  // is `aria-hidden`) — so a bare `getByText` is a strict-mode violation rather than a defect. Both are
  // asserted: the teaching this ruling MOVED here has to reach both readers, or O-4 traded a truncated
  // explanation for a missing one.
  // The delivery arm mounts FOUR hinted fields, so each home is addressed by the hint that carries THIS
  // behaviour rather than by its slot alone (the slot resolves to all four sr-only descriptions).
  const behaviour = "Default prefixes only on a persona switch";
  await expect(page.locator('[data-slot="tooltip-popup"][data-open]')).toContainText(behaviour);
  await expect(page.locator('[data-slot="tooltip-description"]').filter({ hasText: behaviour })).toHaveCount(1);
});
