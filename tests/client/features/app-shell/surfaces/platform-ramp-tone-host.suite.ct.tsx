// D336: under ramp elevation each pane, the reading surface and the topbar names the surface it paints as the tone host, so
// a tint inside it mixes over that fill and not over the page, in every seed palette and a custom ThemeScope.
import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { oklabDistance, srgbToOklch, TONE_TINT_SEPARATION } from "@orb/kit/theme-derivation";
import { pixelSurface, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { SEED_THEME_NAMES } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import type { SectionShellStory } from "../_surface-stories.tsx";
import type { RampBadgeShellStory } from "./_ramp-badge-stories.tsx";
import { wallpaper } from "./app-shell-ct.ts";
import { RAMP_CONTEXT, RAMP_SURFACES } from "./ramp-surfaces.ts";

const STORY = "tests/client/features/app-shell/_surface-stories/SectionShellStory";
const BADGE_STORY = "tests/client/features/app-shell/surfaces/_ramp-badge-stories/RampBadgeShellStory";
const SEEDS = [undefined, ...SEED_THEME_NAMES] as const;
// A custom scope's page colour: a case input that sits between the seeds' dark and light polarities.
const CUSTOM_BACKGROUND = "oklch(0.6 0 0)";
const DOCKED = { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } } as const;
// Wide enough for the docked shell: the phone descriptor's own viewport collapses both panes.
const WIDE = { width: 1280, height: 800 } as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

/** Serves the shell's reads from a corpus account whose appearance is the defaults plus `appearance`. */
async function serveShell(page: Page, corpus: CorpusPlayback, root: Root, appearance: Partial<AppearanceSettings>): Promise<void> {
  await page.setViewportSize(WIDE);
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { ...DEFAULT_APPEARANCE_SETTINGS, blurSurfaces: [], ...appearance } });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
}

for (const seed of SEEDS) {
  test(`${seed ?? "hearth"} seed: a ramp pane, the reading surface and the topbar host the fill they paint`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    await serveShell(page, corpus, root, { elevation: "ramp" });
    await seedShellState(page, DOCKED);
    await mount<typeof SectionShellStory>(STORY, { section: "chats" });
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-elevation", "ramp");
    await expect(page.locator(RAMP_CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
    if (seed !== undefined) {
      await page.evaluate((theme) => document.documentElement.setAttribute("data-theme", theme), seed);
    }
    for (const surface of RAMP_SURFACES) {
      await expectHostsItsFill(page, surface);
    }
  });

  test(`${seed ?? "hearth"} seed: the reading surface over a wallpaper hosts the card fill it paints`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    await serveShell(page, corpus, root, wallpaper(corpus));
    await seedShellState(page, { activeSection: "refinery" });
    await mount<typeof SectionShellStory>(STORY, { section: "refinery" });
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-has-bg-image", "true");
    if (seed !== undefined) {
      await page.evaluate((theme) => document.documentElement.setAttribute("data-theme", theme), seed);
    }
    await expectHostsItsFill(page, ".shell-main");
  });
}

for (const scope of [
  ...SEEDS.map((seed) => ({ name: `${seed ?? "hearth"} seed`, seed })),
  { name: "custom scope", seed: undefined, background: CUSTOM_BACKGROUND },
] as const) {
  test(`${scope.name}: a soft badge in a ramp pane, the reading surface and the topbar stands apart from the fill it sits on`, async ({
    corpus,
    mount,
    page,
  }) => {
    await using root = await createCorpusHarness();
    await serveShell(page, corpus, root, { elevation: "ramp" });
    await seedShellState(page, DOCKED);
    await mount<typeof RampBadgeShellStory>(BADGE_STORY, { section: "chats", ...("background" in scope ? { background: scope.background } : {}) });
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-elevation", "ramp");
    await expect(page.locator(RAMP_CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
    if (scope.seed !== undefined) {
      await page.evaluate((theme) => document.documentElement.setAttribute("data-theme", theme), scope.seed);
    }
    const merged: string[] = [];
    let judged = 0;
    for (const surface of RAMP_SURFACES) {
      const group = page.locator(`${surface} > [data-ramp-badges]`);
      await expect(group).toBeVisible();
      const ground = srgbToOklch((await pixelSurface(page, group.locator('[data-sample="host"]'))).rgb);
      for (const badge of await group.locator("[data-badge]").all()) {
        const distance = oklabDistance(srgbToOklch((await pixelSurface(page, badge)).rgb), ground);
        judged += 1;
        if (distance < TONE_TINT_SEPARATION) {
          merged.push(`${(await badge.getAttribute("data-badge")) ?? "badge"} on ${surface}: ${distance.toFixed(4)}`);
        }
      }
    }
    expect(judged).toBeGreaterThan(0);
    expect(merged).toEqual([]);
  });
}

/** A probe inside the surface paints `var(--tone-host)`; unset, it falls to transparent and the surface's opaque fill differs. */
async function expectHostsItsFill(page: Page, surface: string): Promise<void> {
  await expect(page.locator(surface)).toBeVisible();
  const { fill, host } = await page.locator(surface).evaluate((element) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = "var(--tone-host, transparent)";
    element.append(probe);
    const hosted = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return { fill: getComputedStyle(element).backgroundColor, host: hosted };
  });
  expect(host, `${surface} hosts its own fill`).toBe(fill);
}
