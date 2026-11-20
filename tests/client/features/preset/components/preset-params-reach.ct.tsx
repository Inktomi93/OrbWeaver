// @subject packages/client/src/features/preset/components/knob-row.tsx
// The Params deck on a phone at enlarged text: a knob's info button neither lies over its number field nor sits under the editor's pinned band.

import { presetDetailSchema } from "@orb/contracts/preset";
import { setRootFontScale } from "@orb/testkit/browser/spec";
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
const FONT_SCALES = [2, 3] as const;
// Rounding of two fractional boxes.
const EDGE_SLACK = 0.5;

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

for (const factor of FONT_SCALES) {
  test(`at ${String(factor * 100)}% text every knob's info button is pressable and clear of its number field`, async ({ corpus, mount, page }) => {
    const library = corpus.libraryRelations;
    if (library === undefined) {
      throw new Error("The committed corpus omitted the preset library");
    }
    await using root = await createCorpusHarness();
    const presetId = presetDetailSchema.shape.id.parse(library.reads.presetDetail.output.id);
    await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
    await mount<typeof PresetListLifetimeStory>(STORY, { presetId });
    await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.params, exact: true }).click();
    await setRootFontScale(page, channelName("fontScale"), factor);
    const triggers = page.locator('[data-slot="hint-trigger"]');
    await expect(triggers.first()).toBeVisible();
    const count = await triggers.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const trigger = triggers.nth(index);
      await trigger.scrollIntoViewIfNeeded();
      await trigger.click({ trial: true });
    }
    // No info button lies over a number field.
    const overlaps = await page.evaluate((slack) => {
      const fields = Array.from(document.querySelectorAll('[data-slot="number-field-root"]'), (field) => field.getBoundingClientRect());
      return Array.from(document.querySelectorAll('[data-slot="hint-trigger"]'))
        .filter((trigger) => {
          const box = trigger.getBoundingClientRect();
          return fields.some(
            (field) => box.left < field.right - slack && box.right > field.left + slack && box.top < field.bottom - slack && box.bottom > field.top + slack,
          );
        })
        .map((trigger) => trigger.getAttribute("aria-label") ?? "");
    }, EDGE_SLACK);
    expect(overlaps).toEqual([]);
  });
}
