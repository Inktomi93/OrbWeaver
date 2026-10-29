// The production rail keeps its brand/footer fixed while short desktop layouts scroll section navigation.
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { resolvedLength, seedShellState, settledBox } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { CONFIG_SECTION_LABEL } from "../../../../../packages/client/src/features/config/lib/config-copy.ts";
import { channelName } from "../../../lib/appearance-channel-names.ts";
import type { SectionShellStory } from "../_surface-stories.tsx";

const STORY = "tests/client/features/app-shell/_surface-stories/SectionShellStory";
const GEOMETRY_EPSILON = 1;
const FONT_SCALES = [1, 1.5] as const;
const REGIMES = [
  { name: "short desktop", viewport: { width: 1440, height: 390 }, coarse: false, portrait: false },
  { name: "coarse landscape", viewport: { width: 844, height: 390 }, coarse: true, portrait: false },
  { name: "portrait bar", viewport: { width: 390, height: 844 }, coarse: true, portrait: true },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });
    for (const fontScale of FONT_SCALES) {
      test(`Refinery and Home remain reachable at font scale ${String(fontScale)}`, async ({ corpus, mount, page }, info) => {
        await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", contrast: "no-preference", forcedColors: "none" });
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { ...DEFAULT_APPEARANCE_SETTINGS, fontScale } });
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
        await routeTrpc(page, {
          ...createShellAmbientReads(corpus, root.ownerId),
          ...serveCorpusProcedures(caller, SECTION_PROCEDURES),
        });
        await seedShellState(page, { activeSection: "home" });
        await mount<typeof SectionShellStory>(STORY, { section: "home" });
        const grid = page.locator(".shell-grid");
        const rail = page.getByRole("navigation", { name: "Primary", exact: true });
        const home = rail.getByRole("button", { name: "Home", exact: true });
        await expect(grid).toHaveAttribute("data-section", "home");
        await expect
          .poll(async () => await page.evaluate((name) => Number(getComputedStyle(document.documentElement).getPropertyValue(name)), channelName("fontScale")))
          .toBe(fontScale);
        await withinViewport(home);
        await info.attach("rail-before", {
          body: JSON.stringify(await rail.evaluate((node) => ({ height: node.clientHeight, total: node.scrollHeight, width: node.clientWidth }))),
          contentType: "application/json",
        });
        await page.screenshot({ path: info.outputPath("home-before-navigation.png") });

        if (regime.portrait) {
          await portraitPointer(page, rail);
        } else {
          await columnPointer(page, rail, home, info);
        }
        await expect(grid).toHaveAttribute("data-section", "refinery");
        await withinViewport(home);
        await page.screenshot({ path: info.outputPath("refinery-pointer.png") });
        await home.click();
        await expect(grid).toHaveAttribute("data-section", "home");

        if (regime.portrait) {
          await portraitReturn(rail);
        } else {
          await columnKeyboard(page, rail, home, info);
        }
        await page.screenshot({ path: info.outputPath("home-return.png") });
      });
    }
  });
}

async function withinViewport(control: Locator): Promise<void> {
  await expect(control).toBeInViewport();
  const box = await settledBox(control);
  const viewport = await control.page().evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(box.x).toBeGreaterThanOrEqual(-GEOMETRY_EPSILON);
  expect(box.y).toBeGreaterThanOrEqual(-GEOMETRY_EPSILON);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + GEOMETRY_EPSILON);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + GEOMETRY_EPSILON);
}

async function portraitPointer(page: Page, rail: Locator): Promise<void> {
  await expect(rail.locator(".shell-rail-sections")).toHaveCSS("display", "contents");
  await expect(rail.getByRole("button")).toHaveCount(4);
  await rail.getByRole("button", { name: "You", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Refinery", exact: true }).click();
  await expect(sheet).toBeHidden();
}

async function columnPointer(page: Page, rail: Locator, home: Locator, info: TestInfo): Promise<void> {
  const refinery = rail.getByRole("button", { name: "Refinery", exact: true });
  await refinery.click();
  await withinViewport(refinery);
  const controlSize = await resolvedLength(page, "var(--size-control-lg)");
  const chromeRow = await resolvedLength(page, "var(--dimension-chrome-row)");
  expect((await settledBox(refinery)).height).toBeGreaterThanOrEqual(controlSize - GEOMETRY_EPSILON);
  expect((await settledBox(home)).height).toBeGreaterThanOrEqual(chromeRow - GEOMETRY_EPSILON);
  const settings = rail.getByRole("button", { name: CONFIG_SECTION_LABEL, exact: true });
  await withinViewport(settings);
  expect((await settledBox(settings)).height).toBeGreaterThanOrEqual(controlSize - GEOMETRY_EPSILON);
  const geometry = await rail
    .locator(".shell-rail-sections")
    .evaluate((node) => ({ height: node.clientHeight, total: node.scrollHeight, position: node.scrollTop }));
  expect(geometry.total).toBeGreaterThan(geometry.height + GEOMETRY_EPSILON);
  expect(geometry.position).toBeGreaterThan(0);
  await info.attach("rail-section-scroll", { body: JSON.stringify(geometry), contentType: "application/json" });
}

async function portraitReturn(rail: Locator): Promise<void> {
  await expect(rail.getByRole("button")).toHaveCount(4);
  for (const button of await rail.getByRole("button").all()) {
    await withinViewport(button);
  }
  expect(await rail.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(GEOMETRY_EPSILON);
}

async function columnKeyboard(page: Page, rail: Locator, home: Locator, info: TestInfo): Promise<void> {
  const refinery = rail.getByRole("button", { name: "Refinery", exact: true });
  await home.focus();
  const stops = await rail.getByRole("button").count();
  for (let index = 0; index < stops && !(await refinery.evaluate((node) => node === document.activeElement)); index += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(refinery).toBeFocused();
  await withinViewport(refinery);
  await expect.poll(async () => await refinery.evaluate((node) => node.matches(":focus-visible"))).toBe(true);
  await page.screenshot({ path: info.outputPath("refinery-focused-before-activation.png") });
  const focusPaint = await refinery.evaluate((node) => ({
    shadow: getComputedStyle(node).boxShadow,
    button: node.getBoundingClientRect().toJSON(),
    scrollport: node.closest(".shell-rail-sections")?.getBoundingClientRect().toJSON(),
  }));
  await info.attach("rail-keyboard-focus-paint", { body: JSON.stringify(focusPaint), contentType: "application/json" });
  expect(focusPaint.shadow).toContain("inset");
  const target = await settledBox(refinery);
  const clip = await settledBox(rail.locator(".shell-rail-sections"));
  expect(target.x).toBeGreaterThanOrEqual(clip.x);
  expect(target.x + target.width).toBeLessThanOrEqual(clip.x + clip.width);
  expect(target.y).toBeGreaterThanOrEqual(clip.y);
  expect(target.y + target.height).toBeLessThanOrEqual(clip.y + clip.height);
  await refinery.press("Enter");
  await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "refinery");
  await page.screenshot({ path: info.outputPath("refinery-keyboard.png") });
  await home.click();
  await expect(page.locator(".shell-grid")).toHaveAttribute("data-section", "home");
}
