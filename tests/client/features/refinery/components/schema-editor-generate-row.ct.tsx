// The schema editor's Generate and Refine rows: each is a field beside its press, and at the phone's enlarged text the press takes its own
// line instead of the field collapsing beside it, so the arm picker and the refine instruction keep their floor.
// @subject packages/client/src/features/refinery/components/schema-editor-dialog.tsx

import { setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { REFINERY_FORGE_ARM_NAME, REFINERY_REFINE_DRAFT_NAME, REFINERY_SCHEMA_JSON_NAME } from "#client/features/refinery/lib/refinery-names.ts";
import { SCORE_MAX, SCORE_MIN } from "#contracts/refinery/core.ts";
import type { SchemaPreviewStory } from "./_payload-stories.tsx";

const STORY = "tests/client/features/refinery/components/_payload-stories/SchemaPreviewStory";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const ENLARGED_SCALES = [2, 3] as const;
const PHONE = { width: 390, height: 844 } as const;
const SCORE_SCHEMA = {
  type: "object",
  properties: { overallScore: { type: "integer", minimum: SCORE_MIN, maximum: SCORE_MAX } },
  required: ["overallScore"],
};

async function widthOf(locator: Locator): Promise<number> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The editor part has no rendered box");
  }
  return box.width;
}

/** The floor a flexing field keeps, resolved to px against the page's own root size. */
async function fieldFloorPx(page: Page): Promise<number> {
  return await page.evaluate((cssVar) => {
    const probe = document.createElement("div");
    probe.style.inlineSize = `var(${cssVar})`;
    document.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }, TOKENS["width.field-floor"].cssVar);
}

test.describe("phone, touch pointer", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  for (const factor of ENLARGED_SCALES) {
    test(`at ${factor * 100}% text the arm picker and the refine instruction keep their floor`, async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await routeTrpc(page, serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "character.list", "refinery.schemaPlan"]));
      await mount<typeof SchemaPreviewStory>(STORY, {});
      await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
      // The refine row renders once the JSON pane holds a parseable draft.
      await page.getByRole("textbox", { name: REFINERY_SCHEMA_JSON_NAME, exact: true }).fill(JSON.stringify(SCORE_SCHEMA));
      const arm = page.getByRole("combobox", { name: REFINERY_FORGE_ARM_NAME, exact: true });
      const refine = page.getByRole("textbox", { name: REFINERY_REFINE_DRAFT_NAME, exact: true });
      await expect(arm).toBeVisible();
      await expect(refine).toBeVisible();
      const floor = Math.min(await fieldFloorPx(page), PHONE.width / 2);
      await expect.poll(async () => await widthOf(arm)).toBeGreaterThanOrEqual(floor);
      await expect.poll(async () => await widthOf(refine)).toBeGreaterThanOrEqual(floor);
    });
  }
});
