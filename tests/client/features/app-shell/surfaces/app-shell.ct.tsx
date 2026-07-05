// AppShell CT — the composed four-region frame end-to-end: the default chats CONTENT renders, a rail
// click switches the section (store → CONTENT/LIST slots), the topbar panel toggle collapses a panel
// via the §11.1 clamp-overlay (data-panel-mode + zero rendered width, not just a class string), the
// focus toggle drives immersive ⇄ command-center, and a footer modal trigger opens the paired
// MODAL_SLOTS dialog. The MOBILE block (L6/J12 · D62 P3) covers the bottom-tab-bar reflow at a mobile
// viewport: the curated four tabs, land-on-CONTENT, and the "You" bottom sheet + its overflow/handoff.
// Each test gets a fresh page (isolated localStorage) so the store starts default.

import { expect, test } from "@playwright/experimental-ct-react";
import { AppShellStory } from "../_ct-stories";

// Below the shell's `@media (max-width: 48rem)` breakpoint (768px) — the bottom-bar layout (L6/J12).
const MOBILE = { width: 390, height: 844 };

test("default renders the chats content pane inside the frame", async ({ mount }) => {
  const shell = await mount(<AppShellStory />);
  await expect(shell.getByText("chats content pane")).toBeVisible();
  // The rail nav is present (exact — "Chats" is a substring of the panel's "Collapse Chats panel").
  await expect(shell.getByRole("button", { name: "Chats", exact: true })).toBeVisible();
});

test("a rail click switches the section's CONTENT + LIST slots", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "Corpus" }).click();
  await expect(page.getByText("corpus content pane")).toBeVisible();
  await expect(page.getByText("corpus list pane")).toBeVisible();
  await expect(page.getByText("chats content pane")).toHaveCount(0);
});

test("the topbar toggle collapses the list panel to zero rendered width (clamp-overlay)", async ({
  mount,
  page,
}) => {
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  const dockedWidth = (await listPanel.boundingBox())?.width ?? 0;
  expect(dockedWidth).toBeGreaterThan(0);

  await shell.getByRole("button", { name: "Hide list panel" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  // Collapsed = translated fully off its left edge (behind the ~56px rail): its RIGHT edge settles at
  // ≤ the rail width, so it overlaps zero of CONTENT (the §11.1 clamp-overlay "no reflow" property —
  // the panel keeps its clamp width, it is just translated out of view). Poll past the slide-out
  // transition. Plus removed from AT via inert/aria-hidden.
  await expect
    .poll(async () => {
      const b = await listPanel.boundingBox();
      return (b?.x ?? -9999) + (b?.width ?? 0);
    })
    .toBeLessThanOrEqual(57);
  await expect(listPanel).toHaveAttribute("aria-hidden", "true");
});

test("the focus toggle collapses both panels (immersive) then restores (command-center)", async ({
  mount,
  page,
}) => {
  const shell = await mount(<AppShellStory />);
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  const contextPanel = page.locator('.shell-panel[data-panel-side="context"]');

  // Default: list docked, context collapsed → NOT immersive → the button offers "Enter focus mode".
  await shell.getByRole("button", { name: "Enter focus mode" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "collapsed");

  // Now immersive → the button offers "Exit focus mode" → both dock (command-center).
  await shell.getByRole("button", { name: "Exit focus mode" }).click();
  await expect(listPanel).toHaveAttribute("data-panel-mode", "docked");
  await expect(contextPanel).toHaveAttribute("data-panel-mode", "docked");
});

test("a footer modal trigger opens the paired MODAL_SLOTS dialog", async ({ mount, page }) => {
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "Settings" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // The paired MODAL_SLOTS.settings body — title + its unique placeholder description.
  await expect(dialog).toContainText("Settings");
  await expect(dialog).toContainText("App + user settings");
  // Close returns to no dialog.
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// ── MOBILE (L6/J12 · D62 P3) — the bottom-tab-bar reflow ─────────────────────────────────────────

test("mobile: the bottom bar is the curated four; overflow + footer affordances are off the bar", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);

  // The four thumb-reach tabs render as named buttons.
  await Promise.all(
    ["Chats", "Characters", "Corpus", "You"].map((name) =>
      expect(shell.getByRole("button", { name, exact: true })).toBeVisible(),
    ),
  );
  // The overflow sections + the desktop footer triggers are NOT on the bar (they live in the You sheet).
  // display:none on the desktop block removes them from the a11y tree entirely.
  await expect(page.getByRole("button", { name: "Refinery" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Analytics" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Switch theme" })).toHaveCount(0);
});

test("mobile: you land on CONTENT — the list panel is collapsed, not an open sheet", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(MOBILE);
  await mount(<AppShellStory />);
  // Mobile resolves the list to a closed sheet (collapsed), never the persisted desktop dock — the
  // correct landing is CONTENT (chats pane visible), not a menu.
  const listPanel = page.locator('.shell-panel[data-panel-side="list"]');
  await expect(listPanel).toHaveAttribute("data-panel-mode", "collapsed");
  await expect(page.getByText("chats content pane")).toBeVisible();
});

test("mobile: a tab click switches the section", async ({ mount, page }) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "Corpus", exact: true }).click();
  await expect(page.getByText("corpus content pane")).toBeVisible();
  await expect(page.getByText("chats content pane")).toHaveCount(0);
});

test("mobile: the You tab opens the sheet; an overflow section routes and closes it", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "You", exact: true }).click();

  // The sheet holds account/settings/theme + the overflow sections (Refinery/Analytics reachable HERE).
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Theme" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Refinery" })).toBeVisible();

  // Tapping an overflow section switches the active section AND closes the sheet (setActiveSection +
  // closeModal), landing on that section's distinct placeholder copy.
  await page.getByRole("button", { name: "Analytics" }).click();
  await expect(page.getByRole("button", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByText("Charts over your corpus land here", { exact: false })).toBeVisible();
});

test("mobile: the You sheet hands off to Settings in the shared modal slot (single-slot layered)", async ({
  mount,
  page,
}) => {
  await page.setViewportSize(MOBILE);
  const shell = await mount(<AppShellStory />);
  await shell.getByRole("button", { name: "You", exact: true }).click();
  // Opening Settings REPLACES the You sheet in the shared openModal slot (not a nested modal): the You
  // rows disappear, the Settings modal body appears.
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByText("App + user settings")).toBeVisible();
  // The You-sheet overflow row is gone (the slot now holds Settings, not You).
  await expect(page.getByRole("button", { name: "Refinery" })).toHaveCount(0);
});
