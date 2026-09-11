// CT: the command seal — a search input filters a listbox of grouped items; keyboard nav
// (Arrow/Home/End) rovers the highlight and Enter selects it; Escape reaches the caller via
// `onEscape`. Gates use role locators (combobox/listbox/option) — cmdk owns the ARIA wiring.
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@orb/ui/command";
import { SNAPPED_LENGTH_BASE_PX, TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { AuxiliaryControlStory, CommandPaletteStory, DerivedItemsStory, LongCommandListStory } from "./command.fixtures.tsx";

test("typing filters the item list", async ({ mount, page }) => {
  await mount(<CommandPaletteStory />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("read");
  await expect(page.getByRole("option", { name: "readme.md" })).toBeVisible();
  await expect(page.getByRole("option", { name: "report.md" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "notes.txt" })).toHaveCount(0);
});

test("groups render with their headings", async ({ mount, page }) => {
  await mount(<CommandPaletteStory />);
  await expect(page.getByText("Files", { exact: true })).toBeVisible();
  await expect(page.getByText("Actions", { exact: true })).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(5);
});

test("the first reachable item is highlighted by default", async ({ mount, page }) => {
  await mount(<CommandPaletteStory />);
  await expect(page.getByRole("option", { name: "report.md" })).toHaveAttribute("aria-selected", "true");
});

test("ArrowDown moves the highlight, Enter selects the highlighted item", async ({ mount, page }) => {
  await mount(<CommandPaletteStory />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.press("ArrowDown");
  await expect(page.getByRole("option", { name: "readme.md" })).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(page.getByTestId("selected")).toHaveText("readme.md");
});

test("a focused auxiliary control owns Enter while the roving command item remains selected", async ({ mount, page }) => {
  await mount(<AuxiliaryControlStory />);
  const retry = page.getByRole("button", { name: "Retry" });
  await retry.focus();
  await retry.press("Enter");

  await expect(page.getByTestId("auxiliary-activated")).toHaveText("true");
  await expect(page.getByTestId("auxiliary-selected")).toHaveText("");
  await expect(page.getByRole("option", { name: "Home" })).toHaveAttribute("aria-selected", "true");
});

test("ArrowDown exposes the roving selected option from the focused combobox", async ({ mount, page }) => {
  await mount(<CommandPaletteStory />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.press("ArrowDown");
  const selected = page.getByRole("option", { name: "readme.md" });
  await expect(selected).toHaveAttribute("aria-selected", "true");
  const selectedId = await selected.getAttribute("id");
  await expect(input).toHaveAttribute("aria-activedescendant", selectedId ?? "");
});

test("disabled items are skipped by keyboard nav and ignore clicks", async ({ mount, page }) => {
  await mount(<CommandPaletteStory />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.press("End");
  // "Delete file" is disabled — End must land on the last REACHABLE item, "Create file".
  await expect(page.getByRole("option", { name: "Create file" })).toHaveAttribute("aria-selected", "true");
  const deleteItem = page.getByRole("option", { name: "Delete file" });
  await expect(deleteItem).toHaveAttribute("aria-disabled", "true");
  await deleteItem.click({ force: true });
  await expect(page.getByTestId("selected")).toHaveText("");
});

test("Escape reaches the caller via onEscape without closing anything itself", async ({ mount, page }) => {
  await mount(<CommandPaletteStory />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.press("Escape");
  await expect(page.getByTestId("escapes")).toHaveText("1");
});

test("the empty state renders when the query matches nothing", async ({ mount, page }) => {
  await mount(<CommandPaletteStory />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("zzz-no-match");
  await expect(page.getByText("No matching commands.")).toBeVisible();
  await expect(page.getByRole("option")).toHaveCount(0);
});

test("CommandEmpty falls back to default text with no children", async ({ mount, page }) => {
  await mount(
    <Command label="Command palette">
      <CommandInput aria-label="Search" />
      <CommandList>
        <CommandEmpty />
        <CommandItem>Only item</CommandItem>
      </CommandList>
    </Command>,
  );
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("zzz-no-match");
  await expect(page.getByText("No results found.")).toBeVisible();
});

test("the live status region announces the filtered result count", async ({ mount, page }) => {
  await mount(<CommandPaletteStory />);
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("read");
  const status = page.getByRole("status");
  await expect(status).toHaveText("1 result");
});

test("combobox/listbox ARIA wiring is wired (input <-> list association)", async ({ mount, page }) => {
  await mount(<CommandPaletteStory />);
  const input = page.getByRole("combobox");
  const list = page.getByRole("listbox");
  await expect(input).toHaveAttribute("aria-expanded", "true");
  const listId = await list.getAttribute("id");
  await expect(input).toHaveAttribute("aria-controls", listId ?? "");
});

test("group headings carry data-slot", async ({ mount, page }) => {
  await mount(<CommandPaletteStory />);
  await expect(page.locator('[data-slot="command-group-heading"]')).toHaveCount(2);
});

test("the root wears the popover token", async ({ mount, page }) => {
  await mount(<CommandPaletteStory />);
  const root = page.locator('[data-slot="command-root"]');
  await expect(root).toHaveCSS("background-color", TOKENS["color.popover"].value);
});

test.describe("coarse pointer", () => {
  test.use({ hasTouch: true, viewport: { width: 430, height: 932 } });

  test("the interactive command input itself meets the touch floor", async ({ mount, page }) => {
    await mount(<CommandPaletteStory />);
    let box = await page.getByRole("combobox").boundingBox();
    await expect
      .poll(async () => {
        box = await page.getByRole("combobox").boundingBox();
        return box;
      })
      .not.toBeNull();
    // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
    expect(box?.height).toBeGreaterThanOrEqual(SNAPPED_LENGTH_BASE_PX["spacing.touch-target"]);
  });
});

// ── THE SEARCH BOX HAS A REST→FOCUS DELTA (side-eye 2026-08-19, refinery P2) ─────────────────────────
// cmdk's input is `bg-transparent outline-none` inside a wrapper whose only mark is a bottom hairline, so
// across all six picker consumers and ⌘K a keyboard user could not see where the caret was. The ring goes
// on the ROOT under `:focus-within` — cmdk's rows never take DOM focus, so "focus is in this panel" and
// "the box is focused" are one state. Asserted as the RESOLVED box-shadow, never a class list: a variant
// that stops applying is invisible to a className check, which is the whole failure mode here.

/** The bounded story's row count, and the row that is unambiguously below its fold. */
const LONG_LIST_SIZE = 60;
const OFFSCREEN_ROW = `row ${LONG_LIST_SIZE}`;

function rootShadow(page: Page): Promise<string> {
  return page.locator('[data-slot="command-root"]').evaluate((node) => getComputedStyle(node).boxShadow);
}

test("focus inside the command panel paints a ring — and at rest there is none", async ({ mount, page }) => {
  await mount(<CommandPaletteStory />);
  const atRest = await rootShadow(page);

  await page.getByRole("combobox").focus();
  const focused = await rootShadow(page);
  expect(focused, "the focused panel paints a real ring").not.toBe("none");
  expect(focused, "…and it is a DELTA, not the resting paint").not.toBe(atRest);
});

test("a long list keeps every row MOUNTED and merely skips painting the off-screen ones — cmdk still roves to them", async ({ mount, page }) => {
  await mount(<LongCommandListStory />);

  // MOUNTED, all 60: cmdk resolves arrow-roving, its filter sort and Enter through `querySelectorAll` over
  // the mounted `[cmdk-item]`s, so virtualization would break the keyboard model outright. This is why the
  // seal skips PAINT instead of unmounting.
  await expect(page.getByRole("option")).toHaveCount(LONG_LIST_SIZE);
  const skipped = await page
    .getByRole("option")
    .first()
    .evaluate((node) => getComputedStyle(node).contentVisibility);
  expect(skipped, "the rows carry the render-skip recipe").toBe("auto");

  // …and the keyboard still reaches the LAST row, which starts far below the fold, and selects it. `End`
  // is cmdk's own jump through the mounted set (`X(V().length - 1)`) — the exact mechanism the skip must
  // not disturb, and a row that had been unmounted would simply not be in that walk.
  const input = page.getByRole("combobox");
  await input.click();
  await input.press("End");
  await expect(page.getByRole("option", { name: OFFSCREEN_ROW })).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(page.getByTestId("selected")).toHaveText(OFFSCREEN_ROW);
});

test("filters correctly when the parent re-renders and passes a freshly-DERIVED item array (the real consumer shape)", async ({ mount, page }) => {
  const cmp = await mount(<DerivedItemsStory />);
  const rerender = cmp.getByTestId("rerender");
  await rerender.click();
  await rerender.click();
  const input = page.getByRole("combobox");
  await input.click();
  await input.pressSequentially("bra");
  await expect(page.getByRole("option", { name: "bravo" })).toBeVisible();
  await expect(page.getByRole("option", { name: "alpha" })).toHaveCount(0);
});
