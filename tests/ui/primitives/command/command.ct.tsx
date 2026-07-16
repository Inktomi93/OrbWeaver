// CT: the command seal — a search input filters a listbox of grouped items; keyboard nav
// (Arrow/Home/End) rovers the highlight and Enter selects it; Escape reaches the caller via
// `onEscape`. Gates use role locators (combobox/listbox/option) — cmdk owns the ARIA wiring.
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@orb/ui/command";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { CommandPaletteStory, DerivedItemsStory } from "./command.fixtures";

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
