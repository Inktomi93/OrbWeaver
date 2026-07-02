// CT: the select seal — explicit Positioner/Popup anatomy portals a real popup (popover token,
// overlay z), pointer + keyboard select, controlled value surfaces in the trigger.
import { Select } from "@orb/ui/select";
import { expect, test } from "@playwright/experimental-ct-react";

const ITEMS = [
  { label: "Alpha", value: "alpha" },
  { label: "Beta", value: "beta" },
  { label: "Gamma", value: "gamma" },
];

test("opens on click, selects an option, and closes", async ({ mount, page }) => {
  await mount(<Select items={ITEMS} placeholder="Pick one" />);
  const trigger = page.getByRole("combobox");
  await expect(trigger).toContainText("Pick one");
  await trigger.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("option", { name: "Beta" }).click();
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toContainText("Beta");
});

test("popup wears the popover token and the overlay z-index", async ({ mount, page }) => {
  await mount(<Select items={ITEMS} placeholder="Pick one" />);
  await page.getByRole("combobox").click();
  // role="listbox" lands on the List part; the styled Popup is its direct parent in the seal.
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  const background = await list.evaluate(
    (el) => getComputedStyle(el.parentElement ?? el).backgroundColor,
  );
  expect(background).toContain("oklch(0.235 0.013 65)");
  const zIndex = await list.evaluate((el) => getComputedStyle(el.parentElement ?? el).zIndex);
  expect(zIndex).toBe("40");
});

test("keyboard: opens with ArrowDown, arrows to an option, Enter selects", async ({
  mount,
  page,
}) => {
  await mount(<Select defaultValue="alpha" items={ITEMS} />);
  const trigger = page.getByRole("combobox");
  await trigger.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  // Wait for the popup to take keyboard ownership — focus (not just highlight) must land on the
  // selected item before arrow keys route to the list instead of the trigger.
  await expect(page.getByRole("option", { name: "Alpha" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Beta" })).toHaveAttribute("data-highlighted", "");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(trigger).toContainText("Beta");
});
