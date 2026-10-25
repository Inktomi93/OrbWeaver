// @subject packages/client/src/lib/appearance-carrier-manifest.ts
// The channel's registered properties, written by the production root writer: a number's initial value is the contract
// default, and a number read in em resolves at the element that reads it. Its CSS readers are the shell's, in
// app-shell-appearance.ct.tsx.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { AppearanceChannelStory } from "./_appearance-channel-stories.tsx";
import { channelName } from "./appearance-channel-names.ts";

const STORY = "tests/client/lib/_appearance-channel-stories/AppearanceChannelStory";
const DEFAULTS = appearanceSettingsSchema.parse({});
const LETTER_SPACING = 0.05;
// Far from the root's size, so a spacing resolved at the root cannot pass for one resolved at the element.
const PROBE_FONT_PX = 32;

function rootValue(page: Page, property: string): Promise<string> {
  return page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), property);
}

test("a numeric setting is a registered property whose initial value is the contract default", async ({ mount, page }) => {
  await mount<typeof AppearanceChannelStory>(STORY, { settings: null });
  expect(await page.evaluate(() => document.documentElement.style.length)).toBe(0);
  expect(await rootValue(page, channelName("readingLineHeight"))).toBe(String(DEFAULTS.readingLineHeight));
  expect(await rootValue(page, channelName("chatWidthPct"))).toBe(String(DEFAULTS.chatWidthPct));
});

test("an em setting resolves against the element that reads it, not the root", async ({ mount, page }) => {
  await mount<typeof AppearanceChannelStory>(STORY, { settings: { readingLetterSpacing: LETTER_SPACING } });
  await expect.poll(() => rootValue(page, channelName("readingLetterSpacing"))).toBe(String(LETTER_SPACING));
  const read = await page.evaluate(
    ([property, fontPx]) => {
      const probe = document.createElement("p");
      probe.style.fontSize = `${String(fontPx)}px`;
      probe.style.letterSpacing = `calc(var(${property}) * 1em)`;
      document.body.append(probe);
      const spacing = getComputedStyle(probe).letterSpacing;
      probe.remove();
      return { spacing: Number.parseFloat(spacing), rootPx: Number.parseFloat(getComputedStyle(document.documentElement).fontSize) };
    },
    [channelName("readingLetterSpacing"), PROBE_FONT_PX] as const,
  );
  expect(read.rootPx).not.toBeCloseTo(PROBE_FONT_PX, 1);
  expect(read.spacing).toBeCloseTo(LETTER_SPACING * PROBE_FONT_PX, 2);
});
