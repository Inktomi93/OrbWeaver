// The render-hint picker beside the schema editor's JSON pane: its role select and its Insert press share a row that wraps, so at
// the phone's enlarged text the two take separate lines instead of the select collapsing under the press.
// @subject packages/client/src/features/refinery/components/render-hint-picker.tsx

import { setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { REFINERY_INSERT_RENDER_HINT_NAME, REFINERY_RENDER_HINT_ROLE_NAME } from "#client/features/refinery/lib/refinery-names.ts";
import type { SchemaPreviewStory } from "./_payload-stories.tsx";

const STORY = "tests/client/features/refinery/components/_payload-stories/SchemaPreviewStory";
const FONT_SCALE_PROPERTY = channelName("fontScale");
const ENLARGED_SCALES = [2, 3] as const;
const PHONE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function boxOf(locator: Locator): Promise<Box> {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The picker part has no rendered box");
  }
  return box;
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

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;

/** Serve the reads the editor mounts with, and name the picker's two parts. */
async function servePicker(page: Page, root: Root): Promise<{ readonly role: Locator; readonly insert: Locator }> {
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, ["settings.getUserSettings", "sessions.me", "character.list"]));
  return {
    role: page.getByRole("combobox", { name: REFINERY_RENDER_HINT_ROLE_NAME, exact: true }),
    insert: page.getByRole("button", { name: REFINERY_INSERT_RENDER_HINT_NAME, exact: true }),
  };
}

test.describe("phone, touch pointer", () => {
  test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

  for (const factor of ENLARGED_SCALES) {
    test(`at ${factor * 100}% text the role select keeps its floor and the Insert press sits clear of it`, async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const { role, insert } = await servePicker(page, root);
      await mount<typeof SchemaPreviewStory>(STORY, {});
      await setRootFontScale(page, FONT_SCALE_PROPERTY, factor);
      await expect(role).toBeVisible();
      await expect(insert).toBeVisible();
      const floor = await fieldFloorPx(page);
      await expect.poll(async () => (await boxOf(role)).width).toBeGreaterThanOrEqual(Math.min(floor, PHONE.width / 2));
      expect(overlaps(await boxOf(role), await boxOf(insert))).toBe(false);
    });
  }
});

test.describe("desktop, fine pointer", () => {
  test.use({ viewport: DESKTOP, hasTouch: false, isMobile: false });

  test("the role select and the Insert press share one line", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const { role, insert } = await servePicker(page, root);
    await mount<typeof SchemaPreviewStory>(STORY, {});
    await expect(role).toBeVisible();
    await expect(insert).toBeVisible();
    const [select, press] = [await boxOf(role), await boxOf(insert)];
    expect(overlaps(select, press)).toBe(false);
    // The press is bottom-aligned with the select, so on one line their bottoms agree.
    expect(Math.abs(select.y + select.height - (press.y + press.height))).toBeLessThanOrEqual(1);
  });
});
