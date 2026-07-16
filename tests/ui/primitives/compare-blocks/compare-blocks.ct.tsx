// CT: the compare-blocks seal — before/after review pairs. ONE component renders both the
// single full-text-pair shape (blocks.length === 1) and the multi-field itemized shape (length N);
// the tint pair is intent-token only (danger/success) plus a non-color glyph + sr-only text so a
// colorblind reader can still tell the sides apart. Accept/accept-all is controlled.
import type { CompareBlock } from "@orb/ui/compare-blocks";
import { CompareBlocks } from "@orb/ui/compare-blocks";
import { expect, test } from "@playwright/experimental-ct-react";
import { resolvedTokenColor } from "../../../support/ct/resolved-token-color";
import { AcceptHarness } from "./compare-blocks.fixtures";

const TWO_BLOCKS: readonly CompareBlock[] = [
  { label: "Name", before: "Aria", after: "Aria Nightshade" },
  { label: "Class", before: "Rogue", after: "Assassin" },
];

test("a single block renders one before/after pair with intent-token tints", async ({ mount, page }) => {
  await mount(<CompareBlocks blocks={[{ before: "The cat sat.", after: "The cat sat quietly." }]} />);
  const before = page.locator('[data-slot="compare-block-before"]');
  const after = page.locator('[data-slot="compare-block-after"]');
  await expect(before).toHaveCSS("background-color", resolvedTokenColor("color.destructive"));
  await expect(after).toHaveCSS("background-color", resolvedTokenColor("color.success"));
  await expect(page.getByText("The cat sat.", { exact: true })).toBeVisible();
  await expect(page.getByText("The cat sat quietly.")).toBeVisible();
  // Non-color signal: the sides carry sr-only text beyond the tint alone.
  await expect(before.getByText("Before")).toBeAttached();
  await expect(after.getByText("After")).toBeAttached();
  await expect(page.locator('[data-slot="compare-block"]')).toHaveCount(1);
});

test("N blocks render one pair per item, each with its own label", async ({ mount, page }) => {
  await mount(<CompareBlocks blocks={TWO_BLOCKS} />);
  await expect(page.getByText("Name", { exact: true })).toBeVisible();
  await expect(page.getByText("Class", { exact: true })).toBeVisible();
  await expect(page.locator('[data-slot="compare-block"]')).toHaveCount(2);
});

test("no accepted/onAcceptedChange renders zero checkboxes (pure read-only review)", async ({ mount, page }) => {
  await mount(<CompareBlocks blocks={[{ before: "a", after: "b" }]} />);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("a single block with accept wiring shows exactly one checkbox — no accept-all", async ({ mount, page }) => {
  await mount(<AcceptHarness blocks={[{ before: "a", after: "b" }]} initialAccepted={[false]} />);
  await expect(page.getByRole("checkbox")).toHaveCount(1);
});

test("accepting one block reports only that block's index as accepted", async ({ mount, page }) => {
  await mount(<AcceptHarness blocks={TWO_BLOCKS} initialAccepted={[false, false]} />);
  const checkboxes = page.getByRole("checkbox");
  // index 0 = accept-all (blocks.length > 1), 1 = block 0, 2 = block 1.
  await expect(checkboxes).toHaveCount(3);
  await checkboxes.nth(1).click();
  await expect(checkboxes.nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(checkboxes.nth(2)).toHaveAttribute("aria-checked", "false");
  await expect(checkboxes.first()).toHaveAttribute("aria-checked", "mixed");
});

test("accept-all accepts every block; partial acceptance reports as indeterminate", async ({ mount, page }) => {
  await mount(<AcceptHarness acceptAllLabel="Accept all changes" blocks={TWO_BLOCKS} initialAccepted={[true, false]} />);
  await expect(page.getByText("Accept all changes")).toBeVisible();
  const checkboxes = page.getByRole("checkbox");
  await expect(checkboxes.first()).toHaveAttribute("aria-checked", "mixed");
  await checkboxes.first().click();
  await expect(checkboxes.nth(1)).toHaveAttribute("aria-checked", "true");
  await expect(checkboxes.nth(2)).toHaveAttribute("aria-checked", "true");
});
