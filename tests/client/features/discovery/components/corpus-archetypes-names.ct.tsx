// @subject packages/client/src/features/discovery/components/corpus-archetypes-tab.tsx
// The Corpus CONTEXT Archetypes tab on a phone at the browser's enlarged text: a model-authored cluster name and a long member name wrap
// inside their button, and every name button lies inside the pane, so no name is cut at the pane's edge.

import { contextToggleLabel } from "@orb/client/lib";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { boxOf, LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, seedShellState, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import { CORPUS_CONTEXT_TAB_LABELS } from "#client/features/discovery/lib/corpus-control-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const PHONE = { width: 390, height: 844 } as const;
const CLUSTER_NAME_STEM = "The long-remembered keepers of the northern lighthouse and the storm-season vigil";
const MEMBER_NAMES = [
  "Zephyr of the northern lighthouse keepers' guild and the long vigil at the cottage through the storm season",
  "Thalassocratically-overwrought-and-melodramatic-seafaring-widow-of-the-drowned-archipelago",
] as const;

test.use({ hasTouch: true, isMobile: true, viewport: PHONE });

for (const scale of PLATFORM_TEXT_SCALES) {
  test(`the archetype name buttons wrap inside the pane at ${String(scale * 100)}% text on a phone`, async ({ mount, page }) => {
    await using _textSize = await setPlatformTextSize(page, scale);
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const computed = await caller.discovery.archetypes({});
    // Model-authored names outgrow the pane; the clusters and their members are the corpus's own.
    const archetypes = computed.map((cluster, index) => ({
      ...cluster,
      baseLabel: `${CLUSTER_NAME_STEM} ${String(index)}`,
      label: `${CLUSTER_NAME_STEM} ${String(index)}`,
      members: cluster.members.map((member, place) => ({ ...member, name: MEMBER_NAMES[place % MEMBER_NAMES.length] ?? member.name })),
    }));
    expect(archetypes.length).toBeGreaterThan(0);
    for (const cluster of archetypes) {
      expect(cluster.members.length).toBeGreaterThan(0);
    }
    await routeTrpc(page, {
      ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES]),
      "discovery.archetypes": (input) => {
        expect(input).toEqual({});
        return archetypes;
      },
    });
    await seedShellState(page, { activeSection: "corpus" });
    await mount<typeof ShellAmbientStory>(STORY, {});
    await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
    const context = page.locator(CONTEXT);
    await context.getByRole("tab", { name: CORPUS_CONTEXT_TAB_LABELS.archetypes, exact: true }).click();
    await expect(context.getByRole("button", { name: MEMBER_NAMES[0], exact: true }).first()).toBeVisible();

    const pane = await boxOf(context);
    const buttons = context.getByRole("group").getByRole("button");
    expect(await buttons.count()).toBeGreaterThan(archetypes.length);
    for (const button of await buttons.all()) {
      const box = await boxOf(button);
      const name = (await button.textContent()) ?? "";
      expect({ name, insideStart: box.x >= pane.x - LAYOUT_SUBPIXEL_PX, insideEnd: box.x + box.width <= pane.x + pane.width + LAYOUT_SUBPIXEL_PX }).toEqual({
        name,
        insideStart: true,
        insideEnd: true,
      });
      // The name is whole: no box in the button holds more text than it paints.
      const clipped = await button.evaluate(
        (node: Element, tolerance: number) =>
          [node, ...node.querySelectorAll("*")].filter((part) => part.scrollWidth > part.clientWidth + tolerance).map((part) => part.tagName.toLowerCase()),
        LAYOUT_SUBPIXEL_PX,
      );
      expect({ name, clipped }).toEqual({ name, clipped: [] });
    }
  });
}
