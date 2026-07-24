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

// The create-on-click escape hatch (side-eye P3-2): "New persona" persists a row instantly, so the
// freshly-expanded autosave editor must offer an explicit, always-visible Delete (the row's own delete
// is hover-revealed only). Proves editor-Delete → the row's ConfirmDialog (G7) → confirm → onDelete —
// the same remove mutation the panel wires, so create-then-discard leaves no row.
test("the expanded editor's Delete opens the confirm; confirming fires onDelete", async ({ mount, page }) => {
  const component = await mount(<PersonaPanelRowStory />);
  await component.getByRole("button", { name: "Show details" }).click();

  // The editor mounts inside a Collapsible that reveals with a HEIGHT animation under `overflow-hidden`
  // (variants.ts: h-0 → h-(--collapsible-panel-height)). Until that animation settles, the editor's
  // Delete button — near the panel's bottom — is CLIPPED, so a click aimed at it lands in the hidden
  // overflow and is absorbed (setDeleteOpen never fires; the flake). Wait for the panel to reach its
  // fully-expanded height (clientHeight === scrollHeight ⇒ nothing clipped) before clicking Delete.
  const panel = component.locator('[data-slot="collapsible-panel"]');
  await expect(panel).toHaveAttribute("data-open", "");
  await expect.poll(() => panel.evaluate((el) => el.clientHeight === el.scrollHeight && el.clientHeight > 0)).toBe(true);

  await component.getByRole("button", { name: "Delete", exact: true }).click();
  // ConfirmDialog portals to the body — page-scoped locators.
  const confirm = page.getByRole("alertdialog", { name: "Delete this persona?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(component.getByTestId("fired")).toHaveText("delete");
});

test("the name control enters inline rename — it does NOT fire 'set current'", async ({ mount }) => {
  const component = await mount(<PersonaPanelRowStory />);
  await component.getByRole("button", { name: "Rename persona" }).click();
  // The name became an inline input (rename edit), and 'set current' did NOT fire (disjoint sibling).
  await expect(component.getByRole("textbox", { name: "Persona name" })).toBeVisible();
  await expect(component.getByTestId("fired")).toHaveText("none");
});
