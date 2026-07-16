// CT: `<PersonaPanelRow>` — the side-eye item-13 stretched-overlay rework. Proves the "set current" target
// is a real native `<button>` (NOT a role="button" div wrapping interactive controls) and that the row's
// avatar/name/chevron controls are DISJOINT siblings: clicking a control fires ONLY its own action, never
// also "set current" (the stopPropagation crutch is gone because the elements no longer nest).

import { expect, test } from "@playwright/experimental-ct-react";
import { PersonaPanelRowStory } from "../_ct-stories";

test("the 'set current' target is a real native <button>, not a role=button div", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowStory />);
  const setCurrent = component.getByRole("button", { name: "Switch to Nova" });
  await expect(setCurrent).toHaveJSProperty("tagName", "BUTTON");
});

test("the stretched overlay is wired to onSetCurrent", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowStory />);
  // By design the name control fills the row's middle (name-click = rename); the overlay's live target is
  // the row's OPEN areas (avatar/action gaps). Assert the overlay→onSetCurrent binding via dispatchEvent
  // (hit-test-independent) — the disjointness of the visible controls is proven by the sibling tests below.
  await component.getByRole("button", { name: "Switch to Nova" }).dispatchEvent("click");
  await expect(component.getByTestId("fired")).toHaveText("current");
});

test("the chevron fires onToggleExpand only — a disjoint sibling, never 'set current'", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowStory />);
  await component.getByRole("button", { name: "Show details" }).click();
  await expect(component.getByTestId("fired")).toHaveText("expand");
});

test("the name control enters inline rename — it does NOT fire 'set current'", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowStory />);
  await component.getByRole("button", { name: "Rename persona" }).click();
  // The name became an inline input (rename edit), and 'set current' did NOT fire (disjoint sibling).
  await expect(component.getByRole("textbox", { name: "Persona name" })).toBeVisible();
  await expect(component.getByTestId("fired")).toHaveText("none");
});
