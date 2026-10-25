// @subject packages/client/src/lib/appearance-carrier-manifest.ts
// The channel's registered properties, written by the production root writer: a number's initial value is the contract
// default. Its CSS readers, including the em-read ones, are the shell's, in app-shell-appearance.ct.tsx.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { AppearanceChannelStory } from "./_appearance-channel-stories.tsx";
import { channelName } from "./appearance-channel-names.ts";

const STORY = "tests/client/lib/_appearance-channel-stories/AppearanceChannelStory";
const DEFAULTS = appearanceSettingsSchema.parse({});

function rootValue(page: Page, property: string): Promise<string> {
  return page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), property);
}

test("a numeric setting is a registered property whose initial value is the contract default", async ({ mount, page }) => {
  await mount<typeof AppearanceChannelStory>(STORY, { settings: null });
  expect(await page.evaluate(() => document.documentElement.style.length)).toBe(0);
  expect(await rootValue(page, channelName("readingLineHeight"))).toBe(String(DEFAULTS.readingLineHeight));
  expect(await rootValue(page, channelName("chatWidthPct"))).toBe(String(DEFAULTS.chatWidthPct));
});
