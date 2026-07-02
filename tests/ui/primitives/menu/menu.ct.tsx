import {
  Menu,
  MenuBackdrop,
  MenuCheckboxItem,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSubmenuRoot,
  MenuSubmenuTrigger,
  MenuTrigger,
} from "@orb/ui/menu";
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

  // Keyboard-opening lands roving focus on the first item (Base UI). Gate on it holding focus (not
  // just the highlight attribute) before ArrowDown — the highlight can precede focus settling, and
  // an ArrowDown fired before focus lands is dropped (the Wave-1 Select race).
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeFocused();

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

test("a checkbox item toggles aria-checked and shows the native indicator", async ({
  mount,
  page,
}) => {
  await mount(
    <Menu>
      <MenuTrigger>View</MenuTrigger>
      <MenuPopup>
        {/* closeOnClick=false so the menu stays open to observe the toggle. */}
        <MenuCheckboxItem closeOnClick={false}>Show minimap</MenuCheckboxItem>
      </MenuPopup>
    </Menu>,
  );

  await page.getByRole("button", { name: "View" }).click();
  const item = page.getByRole("menuitemcheckbox", { name: "Show minimap" });
  await expect(item).toHaveAttribute("aria-checked", "false");
  await item.click();
  await expect(item).toHaveAttribute("aria-checked", "true");
  await item.click();
  await expect(item).toHaveAttribute("aria-checked", "false");
});

test("radio items single-select within a group", async ({ mount, page }) => {
  await mount(
    <Menu>
      <MenuTrigger>Sort</MenuTrigger>
      <MenuPopup>
        <MenuRadioGroup defaultValue="date">
          <MenuRadioItem value="date">Date</MenuRadioItem>
          <MenuRadioItem value="name">Name</MenuRadioItem>
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>,
  );

  await page.getByRole("button", { name: "Sort" }).click();
  const date = page.getByRole("menuitemradio", { name: "Date" });
  const name = page.getByRole("menuitemradio", { name: "Name" });
  await expect(date).toHaveAttribute("aria-checked", "true");
  await expect(name).toHaveAttribute("aria-checked", "false");

  // Radio items keep the menu open (closeOnClick=false default) — selecting Name deselects Date.
  await name.click();
  await expect(name).toHaveAttribute("aria-checked", "true");
  await expect(date).toHaveAttribute("aria-checked", "false");
});

test("a submenu opens on hover and lists its own items", async ({ mount, page }) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        <MenuItem>Rename</MenuItem>
        <MenuSubmenuRoot>
          <MenuSubmenuTrigger>Add to playlist</MenuSubmenuTrigger>
          <MenuPopup>
            <MenuItem>Chill mix</MenuItem>
            <MenuItem>Focus mix</MenuItem>
          </MenuPopup>
        </MenuSubmenuRoot>
      </MenuPopup>
    </Menu>,
  );

  await page.getByRole("button", { name: "Actions" }).click();
  const trigger = page.getByRole("menuitem", { name: "Add to playlist" });
  await expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  // Hover opens the submenu (Base UI openOnHover; expect-polling covers the open delay).
  await trigger.hover();
  await expect(page.getByRole("menuitem", { name: "Chill mix" })).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
});

test("a submenu also opens with ArrowRight and closes with ArrowLeft", async ({ mount, page }) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        <MenuSubmenuRoot>
          <MenuSubmenuTrigger>More</MenuSubmenuTrigger>
          <MenuPopup>
            <MenuItem>Deep item</MenuItem>
          </MenuPopup>
        </MenuSubmenuRoot>
      </MenuPopup>
    </Menu>,
  );

  const menuButton = page.getByRole("button", { name: "Actions" });
  await menuButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  // Keyboard-open lands roving focus on the first item (the submenu trigger). Gate on it actually
  // holding focus before ArrowRight — the highlight attribute alone can precede focus settling.
  const trigger = page.getByRole("menuitem", { name: "More" });
  await expect(trigger).toBeFocused();
  await page.keyboard.press("ArrowRight");
  // ArrowRight opens the submenu and moves focus INTO it. Gate on the submenu item holding focus
  // before ArrowLeft, or the close key routes to the wrong menu (the Wave-1 Select race).
  const deepItem = page.getByRole("menuitem", { name: "Deep item" });
  await expect(deepItem).toBeVisible();
  await expect(deepItem).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(deepItem).toBeHidden();
});

test("a link item renders an anchor with its href", async ({ mount, page }) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        <MenuLinkItem href="/settings">Settings</MenuLinkItem>
      </MenuPopup>
    </Menu>,
  );

  await page.getByRole("button", { name: "Actions" }).click();
  const link = page.getByRole("menuitem", { name: "Settings" });
  await expect(link).toHaveAttribute("href", "/settings");
  const tagName = await link.evaluate((el) => el.tagName);
  expect(tagName).toBe("A");
});

test("the backdrop appears while the menu is open and hides when it closes", async ({
  mount,
  page,
}) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuBackdrop />
      <MenuPopup>
        <MenuItem>Rename</MenuItem>
      </MenuPopup>
    </Menu>,
  );

  const backdrop = page.locator('[data-slot="menu-backdrop"]');
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(backdrop).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(backdrop).toBeHidden();
});
