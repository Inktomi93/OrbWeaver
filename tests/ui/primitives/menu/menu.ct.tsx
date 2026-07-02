import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import { expect, test } from "@playwright/experimental-ct-react";

test("opens on trigger click and lists items", async ({ mount, page }) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        <MenuItem>Rename</MenuItem>
        <MenuItem>Duplicate</MenuItem>
        <MenuSeparator />
        <MenuItem>Delete</MenuItem>
      </MenuPopup>
    </Menu>,
  );

  await expect(page.getByRole("menu")).toBeHidden();
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem")).toHaveCount(3);
});

test("arrow keys move the highlight and Enter selects (closing the menu)", async ({
  mount,
  page,
}) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        <MenuItem>Rename</MenuItem>
        <MenuItem>Duplicate</MenuItem>
        <MenuItem>Delete</MenuItem>
      </MenuPopup>
    </Menu>,
  );

  const trigger = page.getByRole("button", { name: "Actions" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();

  // Keyboard-opening highlights the first item (Base UI); ArrowDown moves to the second.
  await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveAttribute(
    "data-highlighted",
    "",
  );

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toHaveAttribute(
    "data-highlighted",
    "",
  );

  // Enter activates the highlighted item; closeOnClick (Base UI default) closes the menu.
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeHidden();
});

test("Escape closes the menu without selecting", async ({ mount, page }) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        <MenuItem>Rename</MenuItem>
      </MenuPopup>
    </Menu>,
  );

  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
});
