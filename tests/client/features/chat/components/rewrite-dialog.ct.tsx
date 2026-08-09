// CT: the guided-Rewrite modal (rewrite-dialog.tsx) in isolation — the owner-ruled "rewrite needs a modal
// because it has toggle options to guide it" surface. Mounts through the `RewriteDialogStory` (the CT rule:
// mount only from a non-test module), which owns the controlled instruction + toggle state exactly as the
// wand does and writes what Apply FIRES (the picked ids in catalog order + the instruction) into a
// `fired-toggles` readout. Proves:
// renders instruction + the toggle catalog, the draft pre-seed, toggles fire their IDS in CATALOG order
// (not click order), the empty-steer Apply gate, and Esc/Cancel preserving state.
//
// The dialog renders through a Base UI Portal, so every field/switch/button assertion uses the PAGE
// locator (`page.getByRole`), never `component` (the menu.ct.tsx split precedent).

import { expect, test } from "@playwright/experimental-ct-react";
import { RewriteDialogStory } from "../_ct-stories.tsx";

test("the modal renders the instruction field + the toggle catalog", async ({ mount, page }) => {
  await mount(<RewriteDialogStory />);
  await expect(page.getByRole("textbox", { name: "Correction instruction" })).toBeVisible();
  // A representative slice of the catalog (first + a style + a tense) proves the chips render from the data.
  await expect(page.getByRole("switch", { name: "More concise" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Novella prose" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Past tense" })).toBeVisible();
});

test("the instruction field is pre-seeded from the composer draft", async ({ mount, page }) => {
  await mount(<RewriteDialogStory initialInstruction="drop the anachronism" />);
  await expect(page.getByRole("textbox", { name: "Correction instruction" })).toHaveValue("drop the anachronism");
});

test("selected toggles fire their IDS + the free text, in catalog order", async ({ mount, page }) => {
  await mount(<RewriteDialogStory initialInstruction="keep the plot beats" />);

  // Flip "Past tense" (later in the catalog) BEFORE "More concise" (first) — the fired order is CATALOG
  // order regardless of click order. IDS, not fragment bytes: since the templating fork's ARM B the
  // fragments are preset prose slots the SERVER resolves and joins (the wire carries only the kind).
  await page.getByRole("switch", { name: "Past tense" }).click();
  await page.getByRole("switch", { name: "More concise" }).click();
  await page.getByRole("button", { name: "Rewrite" }).click();

  await expect(page.getByTestId("fired-toggles")).toHaveText("concise | past-tense | keep the plot beats");
});

test("Apply is disabled with no instruction and no toggle (an empty steer is an unguided reroll)", async ({ mount, page }) => {
  await mount(<RewriteDialogStory />);
  await expect(page.getByRole("button", { name: "Rewrite" })).toBeDisabled();
  // Selecting ONE toggle (no free text) is enough to enable it.
  await page.getByRole("switch", { name: "Literary style" }).click();
  await expect(page.getByRole("button", { name: "Rewrite" })).toBeEnabled();
});

test("Esc closes the modal without firing, preserving the typed instruction on re-open", async ({ mount, page }) => {
  await mount(<RewriteDialogStory initialInstruction="fix the timeline" />);
  const instruction = page.getByRole("textbox", { name: "Correction instruction" });
  await instruction.fill("fix the timeline and tone");
  await page.keyboard.press("Escape");

  // Nothing fired (the readout stays empty), and re-opening shows the preserved instruction (state is owned
  // above the dialog, so a cancel never destroys it).
  await expect(page.getByTestId("fired-toggles")).toHaveText("");
  await page.getByTestId("reopen").click();
  await expect(page.getByRole("textbox", { name: "Correction instruction" })).toHaveValue("fix the timeline and tone");
});
