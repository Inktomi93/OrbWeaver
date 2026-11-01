import { APPEARANCE_BOOT_AXES } from "@orb/client/state";
import { OS_PREFERENCE_MODES } from "@orb/contracts/settings";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { THEME_DENSITIES } from "@orb/contracts/theme";
import { FONT_SCALE } from "@orb/kit/font-scale";
import { pickKeys } from "@orb/kit/objects";
import { keysOf } from "@orb/testkit/iso";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { APPEARANCE_BOOT_HINT_NAME, APPEARANCE_BOOT_HINT_VERSION } from "#client/state/durable-local-keys.ts";
import type { AppearanceBootHintStory } from "./_appearance-boot-hint-stories.tsx";

const STORY = "tests/client/state/_appearance-boot-hint-stories/AppearanceBootHintStory";
const defaults = pickKeys(appearanceSettingsSchema.parse({}), APPEARANCE_BOOT_AXES);
const [loudDensity] = THEME_DENSITIES.filter((density) => density !== defaults.density);
// A device answer that differs from the shipped floor on every axis the hint remembers.
const axes = {
  ...defaults,
  reducedMotion: OS_PREFERENCE_MODES.find((mode) => mode !== defaults.reducedMotion) ?? defaults.reducedMotion,
  fontScale: FONT_SCALE.max,
  density: loudDensity ?? defaults.density,
};
// The blob keys are the production seed palette names: Object.keys on the generated table is the roster.
const SEED_NAMES = keysOf(SEED_THEME_VALUE_SETS);
const [theme = "light"] = SEED_NAMES;
const props = { axes, defaults, theme } as const;

const hintOf = (page: Page): ReturnType<Page["getByRole"]> => page.getByRole("status", { name: "Boot hint", exact: true });
const expected = (hint: Record<string, unknown>): string => JSON.stringify({ ...defaults, dataTheme: null, ...hint });

/** The storage key the production store persists under on this browser, found by what it wrote. */
async function storedKey(page: Page): Promise<string> {
  const key = await page.evaluate((name) => Object.keys(localStorage).find((candidate) => candidate.endsWith(name)), APPEARANCE_BOOT_HINT_NAME);
  if (key === undefined) {
    throw new Error("the boot hint was never persisted");
  }
  return key;
}

/** Overwrite the persisted blob while no story is mounted, so the next mount rehydrates it at module init. */
async function remember(page: Page, key: string, state: unknown): Promise<void> {
  await page.evaluate(([storageKey, blob]) => localStorage.setItem(storageKey, blob), [
    key,
    JSON.stringify({ state, version: APPEARANCE_BOOT_HINT_VERSION }),
  ] as const);
}

test("the server's answer is what the device remembers, and what the next boot starts from", async ({ mount, page }) => {
  const first = await mount<typeof AppearanceBootHintStory>(STORY, props);
  await expect(hintOf(page)).toHaveText(expected({}));

  await page.getByRole("button", { name: "Server reports axes", exact: true }).click();
  await page.getByRole("button", { name: "Server reports seed theme", exact: true }).click();
  const remembered = expected({ ...axes, dataTheme: theme });
  await expect(hintOf(page)).toHaveText(remembered);
  await expect.poll(() => storedKey(page).catch(() => null)).not.toBeNull();
  await first.unmount();

  await mount<typeof AppearanceBootHintStory>(STORY, props);
  await expect(hintOf(page)).toHaveText(remembered);
});

test("a later answer for one axis group keeps the others the device already remembered", async ({ mount, page }) => {
  await mount<typeof AppearanceBootHintStory>(STORY, props);
  await page.getByRole("button", { name: "Server reports axes", exact: true }).click();
  await page.getByRole("button", { name: "Server reports seed theme", exact: true }).click();
  await expect(hintOf(page)).toHaveText(expected({ ...axes, dataTheme: theme }));

  await page.getByRole("button", { name: "Server reports default axes", exact: true }).click();
  await expect(hintOf(page)).toHaveText(expected({ dataTheme: theme }));

  await page.getByRole("button", { name: "Server reports axes", exact: true }).click();
  await page.getByRole("button", { name: "Server reports base theme", exact: true }).click();
  await expect(hintOf(page)).toHaveText(expected(axes));
});

test("a corrupt stored hint heals to the shipped floors, and a valid one beside it is read as written", async ({ mount, page }) => {
  const first = await mount<typeof AppearanceBootHintStory>(STORY, props);
  await page.getByRole("button", { name: "Server reports axes", exact: true }).click();
  await expect(hintOf(page)).toHaveText(expected(axes));
  await expect.poll(() => storedKey(page).catch(() => null)).not.toBeNull();
  const key = await storedKey(page);
  await first.unmount();

  // The positive control: the same seeding path, with a valid answer, is read back as written.
  await remember(page, key, { ...axes, dataTheme: theme });
  const valid = await mount<typeof AppearanceBootHintStory>(STORY, props);
  await expect(hintOf(page)).toHaveText(expected({ ...axes, dataTheme: theme }));
  await valid.unmount();

  // Every field wrong a different way: wrong type, out of bounds, off the enum, and a name no palette owns.
  await remember(page, key, { reducedMotion: "yes", fontScale: FONT_SCALE.max * 100, density: "roomy", dataTheme: "not-a-palette" });
  await mount<typeof AppearanceBootHintStory>(STORY, props);
  await expect(hintOf(page)).toHaveText(expected({}));
});

test("only generated seed palettes are accepted as a boot theme name", async ({ mount, page }) => {
  const first = await mount<typeof AppearanceBootHintStory>(STORY, props);
  await page.getByRole("button", { name: "Server reports seed theme", exact: true }).click();
  await expect.poll(() => storedKey(page).catch(() => null)).not.toBeNull();
  const key = await storedKey(page);
  await first.unmount();

  let previous = first;
  for (const name of [...SEED_NAMES, "hearth", "not-a-palette"]) {
    await remember(page, key, { ...defaults, dataTheme: name });
    previous = await mount<typeof AppearanceBootHintStory>(STORY, props);
    const accepted = SEED_NAMES.some((seed) => seed === name);
    await expect(hintOf(page), name).toHaveText(expected({ dataTheme: accepted ? name : null }));
    await previous.unmount();
  }
});
