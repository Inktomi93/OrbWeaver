// @subject packages/client/src/lib/appearance-carrier-manifest.ts
// The appearance channel, one case per kind: a registered number, a number read in its unit at the element that
// reads it, an always-present attribute for a boolean, an enum and a list, and a variant nested on the root itself.
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { AppearanceChannelStory } from "./_appearance-channel-stories.tsx";

const STORY = "tests/client/lib/_appearance-channel-stories/AppearanceChannelStory";
const DESKTOP = { width: 1440, height: 900 };

// The glass runs only on the desktop shell.
test.use({ viewport: DESKTOP });

function computed(locator: Locator, property: string, pseudo?: string): Promise<string> {
  return locator.evaluate((element, [name, at]) => getComputedStyle(element, at).getPropertyValue(name), [property, pseudo ?? null] as const);
}

function rootValue(page: Page, property: string): Promise<string> {
  return page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), property);
}

test("a numeric setting is a registered property whose initial value is the contract default", async ({ mount, page }) => {
  await mount<typeof AppearanceChannelStory>(STORY, { settings: null });
  expect(await page.evaluate(() => document.documentElement.style.length)).toBe(0);
  expect(await rootValue(page, "--appearance-reading-line-height")).toBe("1.55");
  expect(await rootValue(page, "--appearance-chat-width-pct")).toBe("60");
});

test("a written number reaches the root and its readers", async ({ mount, page }) => {
  const story = await mount<typeof AppearanceChannelStory>(STORY, { settings: { fontScale: 1.25, readingLineHeight: 2 } });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe("20px");
  const bubble = story.getByTestId("channel-bubble");
  const [lineHeight, fontSize] = await Promise.all([computed(bubble, "line-height"), computed(bubble, "font-size")]);
  expect(Number.parseFloat(lineHeight)).toBeCloseTo(2 * Number.parseFloat(fontSize), 3);
});

test("an em setting resolves against the element that reads it, not the root", async ({ mount, page }) => {
  const story = await mount<typeof AppearanceChannelStory>(STORY, { settings: { readingLetterSpacing: 0.05, readingBodyScale: 1.6 } });
  const bubble = story.getByTestId("channel-bubble");
  const [spacing, fontSize, rootSize] = await Promise.all([
    computed(bubble, "letter-spacing"),
    computed(bubble, "font-size"),
    page.evaluate(() => getComputedStyle(document.documentElement).fontSize),
  ]);
  expect(Number.parseFloat(fontSize)).not.toBeCloseTo(Number.parseFloat(rootSize), 1);
  expect(Number.parseFloat(spacing)).toBeCloseTo(0.05 * Number.parseFloat(fontSize), 2);
});

test("a boolean is an always-present attribute and its true variant paints", async ({ mount, page }) => {
  const off = await mount<typeof AppearanceChannelStory>(STORY, { settings: { shadowEffects: false } });
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-appearance-shadow-effects"))).toBe("false");
  expect(await computed(off.getByTestId("channel-bubble"), "text-shadow")).toBe("none");
  const on = await mount<typeof AppearanceChannelStory>(STORY, { settings: { shadowEffects: true } });
  await expect.poll(() => computed(on.getByTestId("channel-bubble"), "text-shadow")).not.toBe("none");
});

test("an enum's value variant paints its arm", async ({ mount }) => {
  const none = await mount<typeof AppearanceChannelStory>(STORY, { settings: { surfaceTexture: "none" } });
  expect(await computed(none.getByTestId("channel-grid"), "background-image", "::after")).toBe("none");
  const grain = await mount<typeof AppearanceChannelStory>(STORY, { settings: { surfaceTexture: "grain" } });
  await expect.poll(() => computed(grain.getByTestId("channel-grid"), "background-image", "::after")).toContain("grain.svg");
});

test("a list attribute matches each member, and the glass reads the blur number in px", async ({ mount, page }) => {
  const bare = await mount<typeof AppearanceChannelStory>(STORY, { settings: { blurSurfaces: [] } });
  expect(await page.evaluate(() => document.documentElement.getAttribute("data-appearance-blur-surfaces"))).toBe("");
  expect(await computed(bare.getByTestId("channel-panel"), "backdrop-filter", "::before")).toBe("none");
  const glass = await mount<typeof AppearanceChannelStory>(STORY, { settings: { blurSurfaces: ["composer", "panels"], blurStrength: 20 } });
  await expect.poll(() => computed(glass.getByTestId("channel-panel"), "backdrop-filter", "::before")).toContain("blur(20px)");
});

test("a variant on the root itself redeclares the root's tokens", async ({ mount, page }) => {
  await mount<typeof AppearanceChannelStory>(STORY, { settings: { enableThemeColorization: false } });
  const plain = await rootValue(page, "--color-border");
  await mount<typeof AppearanceChannelStory>(STORY, { settings: { enableThemeColorization: true } });
  await expect.poll(() => rootValue(page, "--color-border")).not.toBe(plain);
});
