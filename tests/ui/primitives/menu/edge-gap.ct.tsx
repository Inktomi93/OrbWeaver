// A menu popup keeps the spacing token's distance from the screen edge it would otherwise run flush against.
import { resolvedLength } from "@orb/testkit/browser/spec";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import type { EdgeMenuStory } from "./_positioning-stories.tsx";

test.use({ viewport: { width: 390, height: 844 } });

test("a menu popup that would pass the screen's right edge stops one spacing step short of it", async ({ mount, page }) => {
  await mount<typeof EdgeMenuStory>("tests/ui/primitives/menu/_positioning-stories/EdgeMenuStory");
  await page.getByRole("button", { name: "Edge actions", exact: true }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const edge = await resolvedLength(page, `var(${TOKENS["spacing.row"].cssVar})`, page.locator("body"));
  await expect.poll(() => menu.evaluate((node) => innerWidth - node.getBoundingClientRect().right)).toBeGreaterThanOrEqual(edge - 1);
});
