// CT: the DRAFT greeting swipe strip (decision #2) — the `n / m` alternate stepper for a new chat's
// founding greeting. Unlike the committed SwipeStrip there's NO server verb + NO generation: prev/next
// write the picked raw text to the draft-config store (`setDraftGreeting`), and the SHOWN index is DERIVED
// from the current text (`variants.indexOf(current)`). The harness closes that loop the way message-row.tsx
// does (re-derives `current` from the store), so these pins prove the real write→re-derive round-trip:
// the counter MOVES on a pick, a hand-edited greeting shows "— / m" and steps to the last/first alternate
// (never a dead strip), and the edges disable at 1/first and last.

import { expect, test } from "@playwright/experimental-ct-react";
import { GreetingSwipeStripStory } from "../_ct-stories";

const VARIANTS = ["Hello, traveller.", "Well met, stranger.", "You again?"];
const CURRENT = '[data-testid="greeting-current"]';

test("steps forward through the alternates, moving both the counter and the shown greeting", async ({ mount }) => {
  const component = await mount(<GreetingSwipeStripStory variants={VARIANTS} />);
  await expect(component.getByText("1 / 3")).toBeVisible();
  await expect(component.locator(CURRENT)).toHaveText("Hello, traveller.");

  await component.getByRole("button", { name: "Next greeting" }).click();
  // The store write re-derived `current` — the counter and the greeting both advanced.
  await expect(component.getByText("2 / 3")).toBeVisible();
  await expect(component.locator(CURRENT)).toHaveText("Well met, stranger.");

  await component.getByRole("button", { name: "Next greeting" }).click();
  await expect(component.getByText("3 / 3")).toBeVisible();
  await expect(component.locator(CURRENT)).toHaveText("You again?");
});

test("Previous is disabled at the first alternate (no earlier sibling)", async ({ mount }) => {
  const component = await mount(<GreetingSwipeStripStory variants={VARIANTS} />);
  await expect(component.getByText("1 / 3")).toBeVisible();
  await expect(component.getByRole("button", { name: "Previous greeting" })).toBeDisabled();
  await expect(component.getByRole("button", { name: "Next greeting" })).toBeEnabled();
});

test("Next is disabled once at the last alternate", async ({ mount }) => {
  const component = await mount(<GreetingSwipeStripStory variants={VARIANTS} />);
  await component.getByRole("button", { name: "Next greeting" }).click();
  await component.getByRole("button", { name: "Next greeting" }).click();
  await expect(component.getByText("3 / 3")).toBeVisible();
  await expect(component.getByRole("button", { name: "Next greeting" })).toBeDisabled();
  await expect(component.getByRole("button", { name: "Previous greeting" })).toBeEnabled();
});

test("a hand-edited greeting (matches no alternate) shows '— / m' and both edges stay live", async ({ mount }) => {
  const component = await mount(<GreetingSwipeStripStory variants={VARIANTS} custom={true} />);
  // idx -1 → the custom marker over the total; never a dead strip.
  await expect(component.getByText("— / 3")).toBeVisible();
  await expect(component.getByRole("button", { name: "Previous greeting" })).toBeEnabled();
  await expect(component.getByRole("button", { name: "Next greeting" })).toBeEnabled();
});

test("stepping BACK from a hand-edited greeting lands on the LAST alternate (wrap, not dead)", async ({ mount }) => {
  const component = await mount(<GreetingSwipeStripStory variants={VARIANTS} custom={true} />);
  await expect(component.getByText("— / 3")).toBeVisible();

  await component.getByRole("button", { name: "Previous greeting" }).click();
  await expect(component.getByText("3 / 3")).toBeVisible();
  await expect(component.locator(CURRENT)).toHaveText("You again?");
});

test("stepping FORWARD from a hand-edited greeting lands on the FIRST alternate", async ({ mount }) => {
  const component = await mount(<GreetingSwipeStripStory variants={VARIANTS} custom={true} />);
  await expect(component.getByText("— / 3")).toBeVisible();

  await component.getByRole("button", { name: "Next greeting" }).click();
  await expect(component.getByText("1 / 3")).toBeVisible();
  await expect(component.locator(CURRENT)).toHaveText("Hello, traveller.");
});
