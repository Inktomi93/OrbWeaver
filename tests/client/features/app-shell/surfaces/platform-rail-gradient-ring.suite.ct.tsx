// The production rail's active button wears the masked gradient ring in every seed palette. The `::after` paint is the
// ring: a fallback border in its place reads `background-image: none` and no mask.
import { DEFAULT_APPEARANCE_SETTINGS, DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { keysOf } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { SectionShellStory } from "../_surface-stories.tsx";

const STORY = "tests/client/features/app-shell/_surface-stories/SectionShellStory";
const SEEDS = [undefined, ...keysOf(SEED_THEME_VALUE_SETS)] as const;

for (const seed of SEEDS) {
  test(`${seed ?? "hearth"} seed: the active rail button paints the masked gradient ring`, async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: DEFAULT_USER_SETTINGS.theme });
    await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SECTION_PROCEDURES) });
    await seedShellState(page, { activeSection: "refinery" });
    await mount<typeof SectionShellStory>(STORY, { section: "refinery" });
    const active = page.locator(".shell-rail .shell-rail-button[data-active]");
    await expect(active).toBeVisible();
    if (seed !== undefined) {
      await page.evaluate((theme) => document.documentElement.setAttribute("data-theme", theme), seed);
    }
    const paint = await active.evaluate((element) => {
      const ring = getComputedStyle(element, "::after");
      const probe = document.createElement("i");
      probe.style.color = "transparent";
      element.append(probe);
      const transparent = getComputedStyle(probe).color;
      probe.remove();
      return {
        image: ring.getPropertyValue("background-image"),
        mask: ring.getPropertyValue("mask-image"),
        clip: ring.getPropertyValue("mask-clip"),
        border: ring.getPropertyValue("border-top-color"),
        transparent,
      };
    });
    expect(paint.image, "paints its gradient").toContain("linear-gradient");
    expect(paint.mask, "masks it").not.toBe("none");
    expect(paint.clip, "clips the mask to the border").toBe("padding-box, border-box");
    expect(paint.border, "leaves the border to the gradient").toBe(paint.transparent);
  });
}
