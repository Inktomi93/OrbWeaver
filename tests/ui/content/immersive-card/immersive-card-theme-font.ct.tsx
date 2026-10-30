// A theme's own CSS can write `--font-sans` and `--font-mono` on the app root, and the card frame reads both live.
// An unbalanced quote there must stop at the frame clamp: the frame keeps every style rule and falls back to
// sans-serif, instead of a CSS string running to the end of its one-line <style> and swallowing the rules after it.
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { ImmersiveCardTextScaleStory } from "./_card-stories.tsx";

const STORY = "tests/ui/content/immersive-card/_card-stories/ImmersiveCardTextScaleStory";
const FRAME = '[data-slot="sandbox-frame"]';
const UNBALANCED = 'Mono"';

/** The frame document's own style rules and its body font, read inside the frame. */
async function frameStyle(page: Page): Promise<{ readonly rules: number; readonly bodyFont: string }> {
  return await page
    .frameLocator(FRAME)
    .locator("body")
    .evaluate((body) => ({ rules: body.ownerDocument.styleSheets[0]?.cssRules.length ?? 0, bodyFont: getComputedStyle(body).fontFamily }));
}

test("an unbalanced quote in a theme-written font token leaves the frame's style rules whole", async ({ mount, page }) => {
  await mount<typeof ImmersiveCardTextScaleStory>(STORY, {});
  await expect.poll(async () => (await frameStyle(page)).rules).toBeGreaterThan(0);
  const control = await frameStyle(page);
  expect(control.bodyFont).not.toBe("sans-serif");
  await page.evaluate(
    ([names, value]) => {
      for (const name of names) {
        document.documentElement.style.setProperty(name, value);
      }
    },
    [[TOKENS["font.sans"].cssVar, TOKENS["font.mono"].cssVar], UNBALANCED] as const,
  );
  // The frame re-read the planted tokens: the dropped family falls back to the body rule's own sans-serif.
  await expect.poll(async () => (await frameStyle(page)).bodyFont).toBe("sans-serif");
  expect((await frameStyle(page)).rules).toBe(control.rules);
});
