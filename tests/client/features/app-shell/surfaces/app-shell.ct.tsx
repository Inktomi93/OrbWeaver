// AppShell CT — the composed four-region frame end-to-end: the default chats CONTENT renders, a rail
// click switches the section (store → CONTENT/LIST slots), the topbar panel toggle collapses a panel
// via the §11.1 clamp-overlay (data-panel-mode + zero rendered width, not just a class string), the
// focus toggle drives immersive ⇄ command-center, and a footer modal trigger opens the paired
// MODAL_SLOTS dialog. Each test gets a fresh page (isolated localStorage) so the store starts default.

import { expect, test } from "@playwright/experimental-ct-react";
import { AppShellStory } from "../_ct-stories";

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
