// @subject packages/ui/src/primitives/sortable/variants.ts
// The prompt rack at 200% text on a phone: each row's stacked grip sits nearer its own row than the row above it.

import { presetDetailSchema } from "@orb/contracts/preset";
import { boxOf, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { PRESET_EDITOR_VIEW_LABELS } from "#client/features/preset/lib/preset-names.ts";
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
] as const;
const TEXT_SCALE = 2;
const PAIRS_CHECKED = 4;

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test("at 200% text on a phone each rack grip is nearer its own row than the row above", async ({ corpus, mount, page }) => {
  const library = corpus.libraryRelations;
  if (library === undefined) {
    throw new Error("The committed corpus omitted the preset library");
  }
  await using root = await createCorpusHarness();
  const presetId = presetDetailSchema.shape.id.parse(library.reads.presetDetail.output.id);
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
  await mount<typeof PresetListLifetimeStory>(STORY, { presetId });
  await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.prompt, exact: true }).click();
  await setRootFontScale(page, channelName("fontScale"), TEXT_SCALE);
  const items = page.locator('[data-slot="sortable-item"]');
  await expect(items.nth(PAIRS_CHECKED)).toBeVisible();
  for (let at = 1; at <= PAIRS_CHECKED; at += 1) {
    const item = items.nth(at);
    await item.scrollIntoViewIfNeeded();
    const [above, grip, content] = await Promise.all([
      boxOf(items.nth(at - 1)),
      boxOf(item.locator('[data-slot="sortable-handle"]')),
      boxOf(item.locator('[data-slot="sortable-content"]')),
    ]);
    const gapToOwnRow = content.y - (grip.y + grip.height);
    const gapToRowAbove = grip.y - (above.y + above.height);
    expect(gapToOwnRow).toBeLessThan(gapToRowAbove);
  }
});
