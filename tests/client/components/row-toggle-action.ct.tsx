// CT: `<RowToggleAction>` — the client-shared row STATE TOGGLE (list-pane-projection §11.2/§12, D12).
// Pins, once for every list that composes it, what each hand-rolled star used to re-decide:
//
//   · it announces as a TOGGLE — `aria-pressed` carries the datum, and the name flips to the un-set verb;
//   · the D11 rest posture — PRESSED is always visible, UNPRESSED rides ROW_REVEAL (rest hidden, wired to
//     hover + focus-within + `pointer-coarse:opacity-100`), while `rest="always"` never hides either state;
//   · the control box IS the resolved control-md token square (the per-pointer floor, D62 P1 — no hand math).

import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { RowToggleActionHarness } from "./row-toggle-action.fixtures.tsx";

const REVEAL_ON_HOVER = /group-hover:opacity-100/;
const REVEAL_ON_FOCUS = /group-focus-within:opacity-100/;
const REVEAL_ON_COARSE = /pointer-coarse:opacity-100/;
/** The COARSE arm of the pointer-conditional control scale (theme.css overrides it under `pointer: fine`). */
const COARSE_CONTROL_MD_PX = Number.parseFloat(TOKENS["spacing.control-md"].value) * 16;

test("announces as a toggle: aria-pressed carries the state and the name flips to the un-set verb", async ({ mount }) => {
  const component = await mount(<RowToggleActionHarness />);

  const unpressed = component.getByRole("button", { name: "Star Mara", exact: true });
  await expect(unpressed).toHaveAttribute("aria-pressed", "false");

  // The unpressed star rests hidden AND un-hit-testable (P3b), so reach it the way a user does: hover the
  // row first. A click that lands without the reveal would be a click on something nobody can see.
  await component.hover();
  await unpressed.click();
  // The SAME element now announces pressed under the un-set name — one element, marker + affordance.
  await expect(component.getByRole("button", { name: "Unstar Mara", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(component.getByTestId("toggle-count")).toHaveText("1");
});

test("rest posture (D11): unpressed rests hidden with the hover/focus/coarse reveal wired; pressed stays put", async ({ mount }) => {
  const component = await mount(<RowToggleActionHarness />);

  const unpressed = component.getByRole("button", { name: "Star Mara", exact: true });
  await expect(unpressed).toHaveCSS("opacity", "0");
  await expect(unpressed).toHaveClass(REVEAL_ON_HOVER);
  await expect(unpressed).toHaveClass(REVEAL_ON_FOCUS);
  // A coarse pointer has no hover — the affordance is always on there, or it is unreachable.
  await expect(unpressed).toHaveClass(REVEAL_ON_COARSE);
  // The reveal is OPACITY-ONLY: the control keeps a live hit target at rest, so a click whose hit-test
  // precedes the hover (an assistive / programmatic click, Playwright's actionability check) still lands on
  // the control instead of resolving to the cluster wrapper. The rest-INERTNESS side-eye P3 asked for
  // belongs to the arm where a hidden cluster actually covers text — `ListRow.actionsFloat`, which makes
  // the wrapper AND its children non-hit-testable at rest (asserted in the list-row CT).
  await expect(unpressed).toHaveCSS("pointer-events", "auto");

  await component.hover();
  await unpressed.click();
  const pressed = component.getByRole("button", { name: "Unstar Mara", exact: true });
  await expect(pressed).toHaveCSS("opacity", "1");
  await expect(pressed).not.toHaveClass(REVEAL_ON_HOVER);
});

test('rest="always" keeps the UNPRESSED state visible too (the non-revealing surface posture)', async ({ mount }) => {
  const component = await mount(<RowToggleActionHarness rest="always" />);

  const button = component.getByRole("button", { name: "Star Mara", exact: true });
  await expect(button).toHaveCSS("opacity", "1");
  await expect(button).not.toHaveClass(REVEAL_ON_HOVER);
});

test("the control box IS the resolved control-md token square (the per-pointer floor, no hand math)", async ({ mount }) => {
  const component = await mount(<RowToggleActionHarness initialPressed={true} />);
  const button = component.getByRole("button", { name: "Unstar Mara", exact: true });

  // Derived from the element's OWN resolved custom property, so this holds under either pointer arm — what
  // it proves is that the box is the TOKEN, never a hardcoded px.
  const expected = await button.evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue("--spacing-control-md")) * 16);
  const box = await button.boundingBox();
  expect(box?.width).toBe(expected);
  expect(box?.height).toBe(expected);
  // …and the coarse arm of that same token is the ≥44px touch floor.
  expect(COARSE_CONTROL_MD_PX).toBeGreaterThanOrEqual(44);
});
