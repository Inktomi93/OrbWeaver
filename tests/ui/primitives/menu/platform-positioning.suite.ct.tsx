import { expect, test } from "@playwright/test";
import type { ConstrainedMenuStory } from "./_positioning-stories.tsx";

test.use({ viewport: { width: 844, height: 390 }, reducedMotion: "no-preference" });

test("a constrained menu keeps native positioning through trigger press feedback and selects its last action", async ({ mount, page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mount<typeof ConstrainedMenuStory>("tests/ui/primitives/menu/_positioning-stories/ConstrainedMenuStory");
  const trigger = page.getByRole("button", { name: "Constrained actions", exact: true });
  const restingBackground = await trigger.evaluate((node) => getComputedStyle(node).backgroundColor);
  const restingBox = await trigger.boundingBox();
  expect(restingBox).not.toBeNull();
  await trigger.hover();
  await page.mouse.down();
  await trigger.evaluate(async (node) => await Promise.allSettled(node.getAnimations().map((animation) => animation.finished)));
  expect(await trigger.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe(restingBackground);
  expect(await trigger.boundingBox()).toEqual(restingBox);
  await page.mouse.up();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((node) => getComputedStyle(node).transitionProperty)).toContain("scale");
  await trigger.evaluate(async (node) => await Promise.allSettled(node.getAnimations().map((animation) => animation.finished)));
  await menu.evaluate(async (node) => await Promise.allSettled(node.getAnimations().map((animation) => animation.finished)));
  expect(await menu.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  await page.keyboard.press("End");
  const last = menu.getByRole("menuitem", { name: "Action 12", exact: true });
  await expect(last).toBeFocused();
  await last.press("Enter");
  await expect(page.getByRole("status", { name: "Selected action", exact: true })).toHaveText("Action 12");
  await expect(menu).toBeHidden();
  expect(errors).toEqual([]);
});
