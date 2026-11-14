// @subject packages/client/src/features/preset/components/params-limits.tsx
// The Params deck's open Advanced panel: the Word bias info button sits whole inside the clipping panel, and the add row's controls never lie over each other.

import { presetDetailSchema } from "@orb/contracts/preset";
import type { LayoutBox } from "@orb/testkit/browser/spec";
import { boxOf, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { PRESET_ADVANCED_NAME, PRESET_EDITOR_VIEW_LABELS } from "#client/features/preset/lib/preset-names.ts";
import { SAMPLING_FLAG_LABELS } from "#client/features/preset/lib/sampling-knob-catalog.ts";
import type { PresetListLifetimeStory } from "./_list-lifetime-stories.tsx";

const STORY = "tests/client/features/preset/components/_list-lifetime-stories/PresetListLifetimeStory";
const PROCEDURES = [
  "settings.getUserSettings",
  "sessions.me",
  "preset.get",
  "preset.update",
  "preset.list",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
  "connection.tokenizeWords",
] as const;
// Rounding of two fractional boxes.
const EDGE_SLACK = 0.5;

/** With the preset mounted, opens the Advanced panel at `factor` text and returns the Word bias group with the panel that clips it. */
async function openWordBias(page: Page, factor: number): Promise<{ group: Locator; panel: Locator }> {
  await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.params, exact: true }).click();
  await setRootFontScale(page, channelName("fontScale"), factor);
  await page.getByRole("button", { name: PRESET_ADVANCED_NAME, exact: true }).click();
  const group = page.getByRole("group", { name: SAMPLING_FLAG_LABELS.logitBias, exact: true });
  await group.scrollIntoViewIfNeeded();
  const panel = page.locator('[data-slot="collapsible-panel"]').filter({ has: group });
  await expect(panel).toBeVisible();
  // The fold animates its height; a box read mid-fold is not the open panel.
  await expect.poll(() => panel.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeLessThanOrEqual(1);
  return { group, panel };
}

function apart(first: LayoutBox, second: LayoutBox): boolean {
  const inline = first.x + first.width <= second.x + EDGE_SLACK || second.x + second.width <= first.x + EDGE_SLACK;
  const block = first.y + first.height <= second.y + EDGE_SLACK || second.y + second.height <= first.y + EDGE_SLACK;
  return inline || block;
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  for (const factor of [1, 2]) {
    test(`at ${String(factor * 100)}% text the Word bias info button is inside the Advanced panel that clips it`, async ({ corpus, mount, page }) => {
      const library = corpus.libraryRelations;
      if (library === undefined) {
        throw new Error("The committed corpus omitted the preset library");
      }
      await using root = await createCorpusHarness();
      await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
      await mount<typeof PresetListLifetimeStory>(STORY, { presetId: presetDetailSchema.shape.id.parse(library.reads.presetDetail.output.id) });
      const { group, panel } = await openWordBias(page, factor);
      const trigger = await boxOf(group.locator('[data-slot="hint-trigger"]'));
      const clip = await boxOf(panel);
      expect(trigger.y).toBeGreaterThanOrEqual(clip.y - EDGE_SLACK);
      expect(trigger.x).toBeGreaterThanOrEqual(clip.x - EDGE_SLACK);
      expect(trigger.y + trigger.height).toBeLessThanOrEqual(clip.y + clip.height + EDGE_SLACK);
      expect(trigger.x + trigger.width).toBeLessThanOrEqual(clip.x + clip.width + EDGE_SLACK);
    });
  }
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const factor of [1, 3]) {
    test(`at ${String(factor * 100)}% text the Word bias add row's field, bias and Add button stay apart and inside the group`, async ({
      corpus,
      mount,
      page,
    }) => {
      const library = corpus.libraryRelations;
      if (library === undefined) {
        throw new Error("The committed corpus omitted the preset library");
      }
      await using root = await createCorpusHarness();
      await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
      await mount<typeof PresetListLifetimeStory>(STORY, { presetId: presetDetailSchema.shape.id.parse(library.reads.presetDetail.output.id) });
      const { group } = await openWordBias(page, factor);
      // With no entries the group's first textbox is the word field, the number field's own input is its own slot and the last button is Add.
      const fence = await boxOf(group);
      const draft = [
        await boxOf(group.getByRole("textbox").first()),
        await boxOf(group.locator('[data-slot="number-field-input"]')),
        await boxOf(group.getByRole("button").last()),
      ];
      for (const [at, first] of draft.entries()) {
        for (const second of draft.slice(at + 1)) {
          expect(apart(first, second)).toBe(true);
        }
        // A row that does not wrap pushes its last control past the group's edge.
        expect(first.x).toBeGreaterThanOrEqual(fence.x - EDGE_SLACK);
        expect(first.x + first.width).toBeLessThanOrEqual(fence.x + fence.width + EDGE_SLACK);
      }
    });
  }
});
