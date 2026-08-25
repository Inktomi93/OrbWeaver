// CT: the entity-library list's ONE-OF-N column — geometry (side-eye F-4) and the WAI-ARIA radiogroup
// keyboard contract (side-eye F-5), pinned once for every list that composes `LibraryListLayout` +
// `LibraryRow` with a `semantics="radio"` state toggle.
//
// …and since #481 the F-5 half is the APG's SELECTION-WITH-SIDE-EFFECT arm: arrows move focus, Space/Enter
// commits (see the group hook's header for why the first arm died).
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
  await expect
    .poll(async () => await page.getByRole("radiogroup", { name: "Active preset for generation" }).evaluate((el) => (el as HTMLElement).tabIndex))
    .toBe(-1);
});

// ── #481: FOCUS IS NOT SELECTION ─────────────────────────────────────────────────────────────────
// This group used to activate on every arrow key (selection-follows-focus), and the one list that owns a
// radiogroup here persists its pick as a GLOBAL setting: a live keyboard walk produced one
// `settings.updateUserSettingsSection` write PER ARROW PRESS, with no confirm, no undo and nothing
// announced. The APG's second arm — selection with a side effect — is the contract now: arrows move focus,
// Space/Enter commits. The pins below assert the WRITE COUNT, not just the resulting state, because "the
// active row did not change" is also true when a walk lands back where it started.
//
// Every press after the first goes through `page.keyboard`, never `locator.press()`: a locator press FOCUSES
// its target first, so a second `first.press("ArrowDown")` silently walks from the START again instead of
// from where the last move left off (it cost this file one confused failure).

test("#481 arrow keys move FOCUS ONLY — a walk across the whole group commits nothing", async ({ mount, page }) => {
  const component = await mount(<LibraryListHarness />);
  await expect(component.getByTestId("active-id")).toHaveText("builtin");

  const checked = page.getByRole("radio", { name: "Activate Default for generation" });
  await checked.focus();
  await page.keyboard.press("ArrowDown");

  const moved = page.getByRole("radio", { name: "Activate Default (edited) for generation" });
  await expect(moved).toBeFocused();
  // Focus moved; the PICK did not — no write, and the row the user is standing on is not checked.
  await expect(moved).toHaveAttribute("aria-checked", "false");
  await expect(component.getByTestId("active-id")).toHaveText("builtin");

  // …and it stays true across a longer walk (the live receipt was two presses, two writes).
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await expect(moved).toBeFocused();
  await expect(component.getByTestId("commit-count")).toHaveText("0");
  await expect(component.getByTestId("active-id")).toHaveText("builtin");

  // The tab stop roves WITH FOCUS (not with the check): still exactly one, and it is where the user stands,
  // so tabbing out and back cannot teleport them to the checked row mid-walk.
  const tabIndexes = await page.getByRole("radio").evaluateAll((els) => els.map((el) => (el as HTMLElement).tabIndex));
  expect(tabIndexes.filter((t) => t === 0)).toHaveLength(1);
  expect(tabIndexes[1]).toBe(0);
});

test("#481 Space commits the focused radio — exactly one activation for the whole walk", async ({ mount, page }) => {
  const component = await mount(<LibraryListHarness />);
  const first = page.getByRole("radio", { name: "Activate Default for generation" });
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");

  const target = page.getByRole("radio", { name: "Activate New preset for generation" });
  await expect(target).toBeFocused();
  await expect(component.getByTestId("commit-count")).toHaveText("0");

  await page.keyboard.press(" ");
  await expect(component.getByTestId("active-id")).toHaveText("fork-b");
  await expect(target).toHaveAttribute("aria-checked", "true");
  await expect(component.getByTestId("commit-count")).toHaveText("1");
});

test("#481 Enter commits too — the other half of the native button's activation", async ({ mount, page }) => {
  const component = await mount(<LibraryListHarness />);
  const first = page.getByRole("radio", { name: "Activate Default for generation" });
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(component.getByTestId("active-id")).toHaveText("fork-a");
  await expect(component.getByTestId("commit-count")).toHaveText("1");
});

test("F-5: End jumps to the last radio, Home back to the first, wrapping with ArrowUp", async ({ mount, page }) => {
  const component = await mount(<LibraryListHarness />);
  const first = page.getByRole("radio", { name: "Activate Default for generation" });
  await first.focus();

  // Navigation is asserted on FOCUS now (#481) — the moves no longer select, so the active id would say
  // nothing about where the keys went.
  await page.keyboard.press("End");
  await expect(page.getByRole("radio", { name: "Activate New preset for generation" })).toBeFocused();

  await page.keyboard.press("Home");
  await expect(first).toBeFocused();

  // ArrowUp from the first wraps to the last (the pattern's own wrap-around).
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("radio", { name: "Activate New preset for generation" })).toBeFocused();
  await expect(component.getByTestId("commit-count")).toHaveText("0");
});
