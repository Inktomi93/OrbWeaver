// @subject packages/client/appearance-channel.build.ts
// The three-way OS preferences resolve in CSS: `on` applies under a neutral OS, `off` beats the OS asking for it,
// and `system` follows the OS. Written through the production channel writer over the served sheets.
import type { OsPreferenceMode } from "@orb/contracts/settings/appearance";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import type { AppearanceChannelStory } from "./_appearance-channel-stories.tsx";

const STORY = "tests/client/lib/_appearance-channel-stories/AppearanceChannelStory";
// The glass and the contrast edges run only on the desktop shell.
test.use({ viewport: { width: 1440, height: 900 } });

interface OsState {
  readonly transparency: boolean;
  readonly contrast: boolean;
}

/** Playwright's `emulateMedia` has no reduced-transparency feature, so both OS preferences go through CDP at once. */
async function emulateOs(page: Page, os: OsState): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-reduced-transparency", value: os.transparency ? "reduce" : "no-preference" },
      { name: "prefers-contrast", value: os.contrast ? "more" : "no-preference" },
      { name: "prefers-reduced-motion", value: "no-preference" },
    ],
  });
}

function rootValue(page: Page, property: string): Promise<string> {
  return page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), property);
}

function pseudo(locator: Locator, property: string): Promise<string> {
  return locator.evaluate((element, name) => getComputedStyle(element, "::before").getPropertyValue(name), property);
}

const NEUTRAL = { transparency: false, contrast: false };

// The gallery keeps one page per worker, and CDP media emulation outlives the test that set it.
test.afterEach(async ({ page }) => {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setEmulatedMedia", { features: [] });
});

const TRANSPARENCY_CASES = [
  // [app mode, OS asks for reduced transparency, the glass is solid]
  ["system", false, false],
  ["system", true, true],
  ["on", false, true],
  ["off", true, false],
] as const;

for (const [mode, osReduce, solid] of TRANSPARENCY_CASES) {
  test(`reduced transparency ${mode} with OS reduce=${String(osReduce)} makes the glass solid: ${String(solid)}`, async ({ mount, page }) => {
    await emulateOs(page, { ...NEUTRAL, transparency: osReduce });
    const story = await mount<typeof AppearanceChannelStory>(STORY, {
      settings: { reducedTransparency: mode satisfies OsPreferenceMode, blurSurfaces: ["panels"] },
    });
    const panel = story.getByTestId("channel-panel");
    await expect.poll(async () => (await rootValue(page, "--blur-fill-chrome")) === "100%").toBe(solid);
    await expect.poll(async () => (await pseudo(panel, "backdrop-filter")) === "none").toBe(solid);
  });
}

const CONTRAST_CASES = [
  // [app mode, OS asks for more contrast, the contrast arm applies]
  ["system", false, false],
  ["system", true, true],
  ["on", false, true],
  ["off", true, false],
] as const;

for (const [mode, osMore, applied] of CONTRAST_CASES) {
  test(`increased contrast ${mode} with OS more=${String(osMore)} densifies the glass and drops the grain: ${String(applied)}`, async ({ mount, page }) => {
    await emulateOs(page, { ...NEUTRAL, contrast: osMore });
    const story = await mount<typeof AppearanceChannelStory>(STORY, {
      settings: { increasedContrast: mode satisfies OsPreferenceMode, surfaceTexture: "grain" },
    });
    const grid = story.getByTestId("channel-grid");
    await expect.poll(async () => (await rootValue(page, "--blur-fill-chrome")) === "92%").toBe(applied);
    await expect.poll(() => grid.evaluate((element) => getComputedStyle(element, "::after").getPropertyValue("display"))).toBe(applied ? "none" : "block");
  });
}

test("with both preferences on, reduced transparency's solid fill wins the glass knob", async ({ mount, page }) => {
  await emulateOs(page, NEUTRAL);
  await mount<typeof AppearanceChannelStory>(STORY, { settings: { reducedTransparency: "on", increasedContrast: "on" } });
  await expect.poll(() => rootValue(page, "--blur-fill-chrome")).toBe("100%");
});
