// CT: the entity-library list's ONE-OF-N column — geometry (side-eye F-4) and the WAI-ARIA radiogroup
// keyboard contract (side-eye F-5), pinned once for every list that composes `LibraryListLayout` +
// `LibraryRow` with a `semantics="radio"` state toggle.
//
// Both assertions are about the LIST, not about a component: F-4 only reproduces when rows of DIFFERENT
// cluster shapes sit in one list (a built-in with no actions menu beside forks that have one), and F-5 only
// means anything across a set of radios. See the harness for the anatomy.

import { expect, test } from "@playwright/experimental-ct-react";
import { LibraryListHarness } from "./library-surface.fixtures.tsx";

test("F-4: the state column lands at ONE x on every row, whatever each row's cluster holds", async ({ mount, page }) => {
  await mount(<LibraryListHarness />);
  const radios = page.getByRole("radio");
  await expect(radios).toHaveCount(3);

  const boxes = await radios.evaluateAll((els) =>
    els.map((el) => ({ x: Math.round(el.getBoundingClientRect().x), w: Math.round(el.getBoundingClientRect().width) })),
  );
  const xs = new Set(boxes.map((b) => b.x));
  const widths = new Set(boxes.map((b) => b.w));
  // The measured defect was an 80px stagger between the built-in row's radio and a fork's — the built-in's
  // cluster was `[radio]` alone and right-aligned, while a fork's was `[radio, duplicate, kebab]`.
  expect([...xs]).toHaveLength(1);
  expect([...widths]).toHaveLength(1);

  // …and it is straight because the SHORT cluster is padded, not because the long one was trimmed: the
  // built-in row carries the reserved spacers that stand in for the actions it does not have.
  const spacers = page.locator('[data-slot="library-row-cluster-spacer"]');
  await expect(spacers).toHaveCount(2);
  // Layout only — a spacer that reached the a11y tree would announce phantom controls on every such row.
  const hidden = await spacers.evaluateAll((els) => els.every((el) => el.getAttribute("aria-hidden") === "true"));
  expect(hidden).toBe(true);
});

test("F-5: exactly one radio is tabbable, and it is the checked one", async ({ mount, page }) => {
  await mount(<LibraryListHarness />);
  const tabIndexes = await page
    .getByRole("radio")
    .evaluateAll((els) => els.map((el) => ({ checked: el.getAttribute("aria-checked"), tabIndex: (el as HTMLElement).tabIndex })));
  expect(tabIndexes.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  expect(tabIndexes.find((r) => r.tabIndex === 0)?.checked).toBe("true");
  // The group itself is not a tab stop — the roving radio is. (The container carries no `tabindex`
  // ATTRIBUTE at all, which resolves to the -1 property a non-focusable div has; asserting the property is
  // what makes this true rather than accidentally true.)
  const groupTabIndex = await page.getByRole("radiogroup", { name: "Active preset for generation" }).evaluate((el) => (el as HTMLElement).tabIndex);
  expect(groupTabIndex).toBe(-1);
});

test("F-5: ArrowDown moves the selection and the roving tab stop follows it", async ({ mount, page }) => {
  const component = await mount(<LibraryListHarness />);
  await expect(component.getByTestId("active-id")).toHaveText("builtin");

  const checked = page.getByRole("radio", { name: "Activate Default for generation" });
  await checked.focus();
  await checked.press("ArrowDown");

  // SELECTION FOLLOWS FOCUS, per the pattern: the move activates.
  await expect(component.getByTestId("active-id")).toHaveText("fork-a");
  const moved = page.getByRole("radio", { name: "Activate Default (edited) for generation" });
  await expect(moved).toHaveAttribute("aria-checked", "true");
  await expect(moved).toBeFocused();
  // The tab stop rove: still exactly one, and it is where the user now stands.
  const tabIndexes = await page.getByRole("radio").evaluateAll((els) => els.map((el) => (el as HTMLElement).tabIndex));
  expect(tabIndexes.filter((t) => t === 0)).toHaveLength(1);
  expect(tabIndexes[1]).toBe(0);
});

test("F-5: End jumps to the last radio, Home back to the first, wrapping with ArrowUp", async ({ mount, page }) => {
  const component = await mount(<LibraryListHarness />);
  const first = page.getByRole("radio", { name: "Activate Default for generation" });
  await first.focus();

  await first.press("End");
  await expect(component.getByTestId("active-id")).toHaveText("fork-b");

  await page.getByRole("radio", { name: "Activate New preset for generation" }).press("Home");
  await expect(component.getByTestId("active-id")).toHaveText("builtin");

  // ArrowUp from the first wraps to the last (the pattern's own wrap-around).
  await page.getByRole("radio", { name: "Activate Default for generation" }).press("ArrowUp");
  await expect(component.getByTestId("active-id")).toHaveText("fork-b");
});
