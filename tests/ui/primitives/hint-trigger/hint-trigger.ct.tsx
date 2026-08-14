// CT: the hint-trigger primitive (§16, 2026-08-09 report card — extracted from field.tsx's label
// hint + section.tsx's heading hint, which each covered this atom only through their own composite).
// Exercises both call-site anatomies directly: Field's "inline" (no-vertical-cost) sizing and
// Section's "icon" sizing, plus the accname sibling-not-descendant contract the component's own
// doc-comment states — the button MUST be a sibling of the labeled element, never a descendant, or
// "More info" leaks into the labeled element's accessible name (W3C accname subtree concatenation).
import { HintTrigger } from "@orb/ui/hint-trigger";
import { expect, test } from "@playwright/experimental-ct-react";
import { LabeledFixture } from "./hint-trigger.fixtures.tsx";

test("inline size (Field's anatomy): renders the locator, derives its name from subject, opens the tooltip", async ({ mount, page }) => {
  // The mount ROOT is the trigger itself (Tooltip.Root renders no DOM wrapper) — `page.locator`, not
  // `component.locator` (which only searches descendants; the avatar-stack.ct.tsx group-role precedent).
  await mount(<HintTrigger className="test-trigger" hint="Saved every 30 seconds" size="inline" subject="Display name" />);
  await expect(page.locator('[data-slot="hint-trigger"]')).toHaveCount(1);
  const button = page.getByRole("button", { name: "More info about Display name" });
  await expect(button).toBeVisible();
  await button.hover();
  await expect(page.getByText("Saved every 30 seconds")).toBeVisible();
});

test("icon size (Section's anatomy): same locator, same accname/tooltip contract under the other size", async ({ mount, page }) => {
  await mount(<HintTrigger className="test-trigger" hint="How the sampler shapes the distribution." size="icon" subject="Sampling" />);
  await expect(page.locator('[data-slot="hint-trigger"]')).toHaveCount(1);
  const button = page.getByRole("button", { name: "More info about Sampling" });
  await expect(button).toBeVisible();
  await button.hover();
  await expect(page.getByText("How the sampler shapes the distribution.")).toBeVisible();
});

test("falls back to the bare name when subject is not a plain string", async ({ mount, page }) => {
  await mount(<HintTrigger className="test-trigger" hint="x" subject={<span>Notes</span>} />);
  await expect(page.getByRole("button", { name: "More info", exact: true })).toBeVisible();
});

test("falls back to the bare name when subject is absent", async ({ mount, page }) => {
  await mount(<HintTrigger className="test-trigger" hint="x" />);
  await expect(page.getByRole("button", { name: "More info", exact: true })).toBeVisible();
});

test("accname sibling-not-descendant: mounted as a SIBLING of a labeled control, the label's own accname stays clean", async ({ mount, page }) => {
  // Mirrors the shape both call sites enforce (field.tsx's labelRow / section.tsx's headingRow): the
  // trigger sits BESIDE the labeled element in the DOM, never nested inside it.
  await mount(<LabeledFixture />);
  // The control's accname is EXACTLY the label text — no "More info" suffix leaked from the sibling
  // trigger (the defect this atom's whole doc-comment exists to prevent).
  await expect(page.getByRole("textbox", { name: "Notes", exact: true })).toBeVisible();
  // The trigger itself is independently reachable with its OWN derived name.
  await expect(page.getByRole("button", { name: "More info about Notes" })).toBeVisible();
});
