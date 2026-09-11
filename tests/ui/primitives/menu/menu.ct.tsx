import {
  Menu,
  MenuArrow,
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
  MenuViewport,
} from "@orb/ui/menu";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import { MenuHandleHarness, MenuLabelColumnHarness } from "./menu-handle.fixtures.tsx";

// Enough rows that the natural popup height exceeds any CT viewport — the shape that exposes a popup
// ignoring Base UI's `--available-height`.
const LONG_MENU_ITEMS = Array.from({ length: 60 }, (_unused, index) => `Item ${index + 1}`);

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

test("MenuArrow renders inside the popup when the menu opens", async ({ mount, page }) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        <MenuArrow />
        <MenuItem>Rename</MenuItem>
      </MenuPopup>
    </Menu>,
  );
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.locator('[data-slot="menu-arrow"]')).toBeVisible();
});

test("arrow keys move the highlight and Enter selects (closing the menu)", async ({ mount, page }) => {
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

test("menu items animate the highlight color swap (motion guide §4.2 #9)", async ({ mount, page }) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        <MenuItem>Rename</MenuItem>
      </MenuPopup>
    </Menu>,
  );
  await page.getByRole("button", { name: "Actions" }).click();
  const item = page.getByRole("menuitem", { name: "Rename" });
  // The `data-highlighted:bg-accent` swap rides a `transition-colors` at --motion-fast rather than
  // hard-cutting — assert the transition names the animated color properties + a real (non-zero)
  // duration, so a future edit that drops the transition class is caught.
  await expect.poll(async () => await item.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain("background-color");
  await expect.poll(async () => await item.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain("color");
  await expect.poll(async () => await item.evaluate((el) => getComputedStyle(el).transitionDuration)).not.toBe("0s");
});

// THE HIGHLIGHT NEEDS A REAL INDICATOR (side-eye 2026-08-08 P2). The only cue a highlighted row carried
// was a background swap — `bg-accent` (oklch 0.285) over `bg-popover` (oklch 0.245), a 1.13:1 step — with
// `outline-none` and nothing else, and with submenus the question "am I on the parent or the child?" now
// rests on it. The fix is the toggle primitive's ruled selection cue: an Ember `inset-ring`, a
// lightness-INDEPENDENT signal that composes with (never replaces) the focus ring's own layer.
//
// The pin is the RENDERED shadow layer, at rest and highlighted, against the resolved `--color-ring` — a
// class list is not a cue and a hardcoded colour would freeze today's palette.
test("a highlighted menu item draws a real indicator, not just a background step", async ({ mount, page }) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        <MenuItem>Rename</MenuItem>
        <MenuItem>Duplicate</MenuItem>
      </MenuPopup>
    </Menu>,
  );
  await page.getByRole("button", { name: "Actions" }).click();
  const resting = page.getByRole("menuitem", { name: "Duplicate" });
  const highlighted = page.getByRole("menuitem", { name: "Rename" });

  // Base UI roves the highlight with the keyboard; opening by click leaves nothing highlighted.
  await page.keyboard.press("ArrowDown");
  await expect(highlighted).toHaveAttribute("data-highlighted", "");
  await expect(resting).not.toHaveAttribute("data-highlighted", "");

  const ring = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.style.color = "var(--color-ring)";
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  const shadowOf = (target: typeof resting): Promise<string> => target.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(await shadowOf(resting), "an un-highlighted row draws no indicator").toBe("none");
  const cue = await shadowOf(highlighted);
  expect(cue, "the highlighted row draws an INSET ring").toContain("inset");
  expect(cue, "…in the ring colour, which clears 3:1 on the popup ground in both themes").toContain(ring);
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

test("a checkbox item toggles aria-checked and shows the native indicator", async ({ mount, page }) => {
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
  await expect.poll(async () => await link.evaluate((el) => el.tagName)).toBe("A");
});

// A long menu must stay INSIDE the viewport. Base UI's Positioner publishes `--available-height`
// (anchor → viewport edge); a popup that doesn't consume it renders at full content height and its
// tail is unreachable — no scroll, because the popup itself has no overflow. Source-level review
// cannot see this: only the rendered box says whether the last row can be reached.
test("a long menu clamps to the available height and scrolls instead of running off-screen", async ({ mount, page }) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        {LONG_MENU_ITEMS.map((label) => (
          <MenuItem key={label}>{label}</MenuItem>
        ))}
      </MenuPopup>
    </Menu>,
  );
  await page.getByRole("button", { name: "Actions" }).click();
  const popup = page.getByRole("menu");
  await expect(popup).toBeVisible();

  const viewportHeight = page.viewportSize()?.height ?? 0;
  expect(viewportHeight).toBeGreaterThan(0);
  let box = await popup.boundingBox();
  await expect
    .poll(async () => {
      box = await popup.boundingBox();
      return box;
    })
    .not.toBeNull();
  // Fits on screen, top and bottom.
  expect(box?.height ?? 0).toBeLessThanOrEqual(viewportHeight);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewportHeight + 1);
  // And the content that no longer fits is REACHABLE — the popup is its own scroller.
  const scroll = await popup.evaluate((el) => ({ client: el.clientHeight, content: el.scrollHeight }));
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(scroll.content).toBeGreaterThan(scroll.client);
  await popup.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect(page.getByRole("menuitem", { name: "Item 60" })).toBeInViewport();
});

// The detached handle — one menu, opened from a control that is not its trigger, with the payload
// routed from the (hidden) anchor trigger into the Root's render-function children.
test("opens imperatively via a detached handle and routes the trigger payload to content", async ({ mount, page }) => {
  await mount(<MenuHandleHarness />);
  await expect(page.getByRole("menu")).toBeHidden();
  await page.getByRole("button", { name: "Open remotely" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Reached content" })).toBeVisible();
});

// The OPTIONAL multi-trigger transition container (Base UI Menu.Viewport). Wrapping the items in it
// must not disturb the menu's own semantics — the items stay menuitems under the same menu role.
test("MenuViewport wraps the items without changing the menu's semantics", async ({ mount, page }) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        <MenuViewport>
          <MenuItem>Rename</MenuItem>
          <MenuItem>Delete</MenuItem>
        </MenuViewport>
      </MenuPopup>
    </Menu>,
  );
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.locator('[data-slot="menu-viewport"]')).toBeVisible();
  await expect(page.getByRole("menuitem")).toHaveCount(2);
});

test("the backdrop appears while the menu is open and hides when it closes", async ({ mount, page }) => {
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
  // The theme-aware overlay token (D43 §11.4) — never bg-black/50.
  await expect(backdrop).toHaveCSS("background-color", TOKENS["color.backdrop"].value);
  await page.keyboard.press("Escape");
  await expect(backdrop).toBeHidden();
});

// ── The ragged label column (side-eye 2026-08-06 P2) ────────────────────────────────────────────────
// One menu mixes iconed rows with bare-text rows, and the bare ones started their label a whole glyph
// further left than the rest — the chat-options popup read as two misaligned columns. Two causes, both
// fixed in the seal: command rows now reserve the leading glyph gutter, and the submenu trigger no longer
// spreads its free space AROUND its label with `justify-between`.
//
// Measured on the TEXT ITSELF via a Range — the labels are bare text nodes with no element to locate, which
// is exactly why the drift went unnoticed.
test("every command row's LABEL starts on one column — icon-less rows and submenu triggers included", async ({ mount, page }) => {
  await mount(<MenuLabelColumnHarness />);
  await page.getByRole("button", { name: "Actions" }).click();
  await expect(page.getByRole("menu")).toBeVisible();

  let lefts = await page
    .getByRole("menu")
    .first()
    .evaluate((menu: HTMLElement): readonly number[] =>
      Array.from(menu.children).map((row): number => {
        const text = Array.from(row.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "");
        if (text === undefined) {
          return -1;
        }
        const range = document.createRange();
        range.selectNodeContents(text);
        return Math.round(range.getBoundingClientRect().left);
      }),
    );
  await expect
    .poll(async () => {
      lefts = await page
        .getByRole("menu")
        .first()
        .evaluate((menu: HTMLElement): readonly number[] =>
          Array.from(menu.children).map((row): number => {
            const text = Array.from(row.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "");
            if (text === undefined) {
              return -1;
            }
            const range = document.createRange();
            range.selectNodeContents(text);
            return Math.round(range.getBoundingClientRect().left);
          }),
        );
      return lefts;
    })
    .toHaveLength(4);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(lefts.every((left) => left > 0)).toBe(true);
  expect(new Set(lefts).size, `label left edges drifted: ${lefts.join(", ")}`).toBe(1);
});

// A clamped popup used to end flush at a clean border with the tail undiscoverable (no scrollbar, no
// arrows, no fade). Base UI's Menu publishes NO ScrollUpArrow/ScrollDownArrow part — only Select does — so
// the cue is the popup's own paint: cover gradients that ride the CONTENT (`local`) over shadow gradients
// pinned to the BOX (`scroll`), which is what makes a shadow appear only on an edge with content past it.
test("a clamped popup carries the scroll cue — the covers ride the content, the shadows ride the box", async ({ mount, page }) => {
  await mount(
    <Menu>
      <MenuTrigger>Actions</MenuTrigger>
      <MenuPopup>
        {LONG_MENU_ITEMS.map((label) => (
          <MenuItem key={label}>{label}</MenuItem>
        ))}
      </MenuPopup>
    </Menu>,
  );
  await page.getByRole("button", { name: "Actions" }).click();
  const popup = page.locator('[data-slot="menu-popup"]');
  await expect(popup).toBeVisible();
  // The clamp itself (the precondition the cue exists for).
  await expect.poll(() => popup.evaluate((el: HTMLElement): boolean => el.scrollHeight > el.clientHeight + 1)).toBe(true);
  await expect(popup).toHaveCSS("background-attachment", "local, local, scroll, scroll");
});
