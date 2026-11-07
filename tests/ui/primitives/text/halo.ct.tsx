// A halo is a text shadow: the wordmark keeps the type step and the whole-pixel line height its voice sets.
import { expect, test } from "@playwright/test";
import type { TextHaloStory } from "./_halo-stories.tsx";

const STORY = "tests/ui/primitives/text/_halo-stories/TextHaloStory";

test("the halo changes the shadow and keeps the font size and the line height", async ({ mount }) => {
  const root = await mount<typeof TextHaloStory>(STORY, {});
  const measure = (name: "plain" | "halo"): Promise<{ fontSize: string; lineHeight: string; textShadow: string }> =>
    root.locator(`[data-case="${name}"]`).evaluate((element) => ({
      fontSize: getComputedStyle(element).fontSize,
      lineHeight: getComputedStyle(element).lineHeight,
      textShadow: getComputedStyle(element).textShadow,
    }));
  const [plain, halo] = [await measure("plain"), await measure("halo")];
  expect(plain.textShadow, "the plain voice draws no shadow").toBe("none");
  expect(halo.textShadow, "the halo draws one").not.toBe("none");
  expect(halo.fontSize).toBe(plain.fontSize);
  expect(halo.lineHeight).toBe(plain.lineHeight);
  expect(Number.isInteger(Number.parseFloat(halo.lineHeight)), "the line box is a whole number of pixels").toBe(true);
});
