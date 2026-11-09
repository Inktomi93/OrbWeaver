import { resolvedLength, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { AlertDialogNativePartsStory } from "./_native-parts-stories.tsx";

test("a remote confirmation can cancel, and detached trigger confirmation uses the selected payload", async ({ mount, page }) => {
  await mount<typeof AlertDialogNativePartsStory>("tests/ui/primitives/alert-dialog/_native-parts-stories/AlertDialogNativePartsStory");
  const dialog = page.getByRole("alertdialog", { name: "Delete draft?", exact: true });
  const result = page.getByRole("status", { name: "Confirmed deletion", exact: true });
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Delete remotely", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription("Remote draft");
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  const confirm = dialog.getByRole("button", { name: "Confirm deletion", exact: true });
  await cancel.focus();
  await page.keyboard.press("Tab");
  await expect(confirm).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(dialog).toBeHidden();
  await expect(result).toHaveText("Nothing deleted");
  const trigger = page.getByRole("button", { name: "Delete selected", exact: true });
  await trigger.click();
  await expect(dialog).toHaveAccessibleDescription("Selected draft");
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(result).toHaveText("Selected draft");
  await expect(trigger).toBeFocused();
});

test("a short phone at enlarged text holds the dialog's capped gutter, so the confirmation keeps the screen's room", async ({ mount, page, browserName }) => {
  test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
  await page.setViewportSize({ width: 568, height: 320 });
  await using _textSize = await setPlatformTextSize(page, 3);
  await mount<typeof AlertDialogNativePartsStory>("tests/ui/primitives/alert-dialog/_native-parts-stories/AlertDialogNativePartsStory");
  await page.getByRole("button", { name: "Delete remotely", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "Delete draft?", exact: true })).toBeVisible();
  const viewport = page.locator('[data-slot="alert-dialog-viewport"]');
  const capped = await resolvedLength(page, `var(${TOKENS["width.dialog-gutter"].cssVar})`, viewport);
  const full = await resolvedLength(page, `var(${TOKENS["spacing.gutter"].cssVar})`, viewport);
  expect(capped).toBeLessThan(full);
  const inset = await viewport.evaluate((node) => ({
    inline: Number.parseFloat(getComputedStyle(node).paddingInlineStart),
    block: Number.parseFloat(getComputedStyle(node).paddingBlockStart),
  }));
  expect(inset.inline).toBe(capped);
  expect(inset.block).toBe(await resolvedLength(page, `var(${TOKENS["height.dialog-gutter"].cssVar})`, viewport));
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
]) {
  test(`at enlarged text a ${viewport.width}px phone's confirmation fits the screen and both actions stay on it`, async ({ mount, page, browserName }) => {
    test.skip(browserName !== "chromium", "Only Chromium exposes the browser's default font size; WebKit has no text-size door");
    await page.setViewportSize(viewport);
    await using _textSize = await setPlatformTextSize(page, 3);
    await mount<typeof AlertDialogNativePartsStory>("tests/ui/primitives/alert-dialog/_native-parts-stories/AlertDialogNativePartsStory");
    await page.getByRole("button", { name: "Delete remotely", exact: true }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete draft?", exact: true });
    await expect(dialog).toBeVisible();
    const onScreen = (node: Element): boolean =>
      node.getBoundingClientRect().left >= 0 && node.getBoundingClientRect().right <= innerWidth && node.scrollWidth <= node.clientWidth + 1;
    for (const part of [
      dialog,
      dialog.getByRole("button", { name: "Cancel", exact: true }),
      dialog.getByRole("button", { name: "Confirm deletion", exact: true }),
    ]) {
      await expect.poll(async () => await part.evaluate(onScreen)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
