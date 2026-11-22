// @subject packages/client/src/features/discovery/components/corpus-mode-switch.tsx
// @subject packages/ui/src/primitives/toggle-group/variants.ts
// The Corpus Explore | Insights | Tags switch on a phone at the browser's enlarged text: each label stays whole words inside the strip, and
// when the three cells cannot sit side by side they take further rows instead of cutting a label into letters.
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, seedShellState, setPlatformTextSize, toggleStripLayout } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CORPUS_MODE_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const FINDER_PROCEDURES = ["search.suggest", "search.spaceStatus", "connection.list", "connection.listBindings", "workloads.list"] as const;

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

for (const scale of PLATFORM_TEXT_SCALES) {
  test(`at ${String(scale * 100)}% text the mode switch keeps every label whole and inside the strip`, async ({ mount, page }) => {
    await using _textSize = await setPlatformTextSize(page, scale);
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, ...FINDER_PROCEDURES]));
    await seedShellState(page, { activeSection: "corpus", panelOverrides: { corpus: { list: "docked", context: "collapsed" } } });
    await mount<typeof ShellAmbientStory>(STORY, {});
    const modes = page.getByRole("radiogroup", { name: CORPUS_MODE_NAME, exact: true });
    await expect(modes.getByRole("radio")).toHaveCount(3);
    const layout = await toggleStripLayout(modes);
    expect(layout.cutWords).toEqual([0, 0, 0]);
    expect(layout.pastStrip).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
    // The control: the default size seats the three labels on one row, so a strip that always stacks fails; the largest size cannot.
    expect(layout.rows).toBeLessThanOrEqual(scale === 1 ? 1 : 3);
    expect(layout.rows).toBeGreaterThanOrEqual(scale === 3 ? 2 : 1);
  });
}
