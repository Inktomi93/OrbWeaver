// D336: under ramp elevation each pane, the reading surface and the topbar names the surface it paints as the tone host, so
// a tint inside it mixes over that fill and not over the page, in every seed palette.
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { SectionShellStory } from "../_surface-stories.tsx";

const STORY = "tests/client/features/app-shell/_surface-stories/SectionShellStory";
const SEEDS = [undefined, ...(Object.keys(SEED_THEME_VALUE_SETS) as (keyof typeof SEED_THEME_VALUE_SETS)[])] as const;
const LIST = '.shell-panel[data-panel-side="list"]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';
// Wide enough for the docked shell: the phone descriptor's own viewport collapses both panes.
const WIDE = { width: 1280, height: 800 } as const;
const SURFACES = [LIST, CONTEXT, ".shell-main", ".shell-topbar"] as const;

for (const seed of SEEDS) {
  test(`${seed ?? "hearth"} seed: a ramp pane, the reading surface and the topbar host the fill they paint`, async ({ corpus, mount, page }) => {
    await page.setViewportSize(WIDE);
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: { ...DEFAULT_APPEARANCE_SETTINGS, elevation: "ramp", blurSurfaces: [] } });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
    await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
    await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "docked" } } });
    await mount<typeof SectionShellStory>(STORY, { section: "chats" });
    await expect(page.locator(".shell-grid")).toHaveAttribute("data-elevation", "ramp");
    await expect(page.locator(CONTEXT)).toHaveAttribute("data-panel-mode", "docked");
    if (seed !== undefined) {
      await page.evaluate((theme) => document.documentElement.setAttribute("data-theme", theme), seed);
    }
    for (const surface of SURFACES) {
      await expect(page.locator(surface)).toBeVisible();
      // A probe inside the surface paints `var(--tone-host)`; unset, it falls to transparent and the pane's opaque fill differs.
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
  });
}
