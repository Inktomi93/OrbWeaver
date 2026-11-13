// The entry editor's keyword chips: the remove mark holds a hit area that stays inside its own chip, and a tap on the next chip or the draft input never removes a keyword at either pointer.
import { worldEntryIdInputSchema } from "@orb/contracts/world-info";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import { WORLD_INFO_KEYWORD_TRIGGERS_NAME } from "#client/features/world-info/lib/world-info-names.ts";
import type { WorldInfoMemberStory } from "./_member-stories.tsx";

const STORY = "tests/client/features/world-info/surfaces/_member-stories/WorldInfoMemberStory";
const PROCEDURES = [
  "worldInfo.listBooksWithUsage",
  "worldInfo.listAttachmentsForBook",
  "worldInfo.listGlobal",
  "persona.list",
  "worldInfo.getBook",
  "worldInfo.listEntries",
  "settings.getUserSettings",
] as const;
// WCAG 2.5.8 target size (minimum), the floor a fine pointer's hit area must clear.
const FINE_TARGET_PX = 24;
// A tap this far inside a neighbour's edge is a tap on the neighbour, whatever target the chip before it holds.
const INTO_NEIGHBOUR_PX = 2;
const POINTERS = [
  { pointer: "fine", touch: false },
  { pointer: "coarse", touch: true },
] as const;

let root: Awaited<ReturnType<typeof createCorpusHarness>>;

test.beforeAll(async () => {
  root = await createCorpusHarness();
});

test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox();
  if (box === null) {
    throw new Error("The chip row must have visible geometry");
  }
  return box;
}

async function tap(page: Page, touch: boolean, x: number, y: number): Promise<void> {
  if (touch) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y);
  }
  // A removal lands in the click's own task; one frame later the row is settled either way.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function mountKeywordRow(
  mount: PlaywrightTestArgs["mount"],
  page: Page,
  corpus: CorpusPlayback,
): Promise<{ readonly chips: Locator; readonly input: Locator }> {
  const world = corpus.worldInfoLibrary;
  if (world === undefined) {
    throw new Error("World Info cases require the corpus library");
  }
  await routeTrpc(page, serveCorpusProcedures(await root.internalCallerFor(root.ownerId), PROCEDURES));
  const component = await mount<typeof WorldInfoMemberStory>(STORY, {
    bookId: world.reads.entry.output.worldBookId,
    entryId: worldEntryIdInputSchema.parse(world.reads.entry.input).entryId,
    context: false,
  });
  const input = component.getByRole("combobox", { name: WORLD_INFO_KEYWORD_TRIGGERS_NAME, exact: true });
  for (const keyword of ["beacon", "lantern"]) {
    await input.fill(keyword);
    await input.press("Enter");
  }
  return { chips: component.locator('[data-slot="combobox-chip"]'), input };
}

for (const { pointer, touch } of POINTERS) {
  test.describe(`at a ${pointer} pointer`, () => {
    test.use({ hasTouch: touch, isMobile: touch, viewport: { width: 1280, height: 900 } });

    test("a tap 2px into the next chip or the draft input removes no keyword, and the remove mark still does", async ({ corpus, mount, page }) => {
      const { chips, input } = await mountKeywordRow(mount, page, corpus);
      const before = await chips.count();
      expect(before).toBeGreaterThanOrEqual(2);
      const last = chips.nth(before - 1);
      const previous = chips.nth(before - 2);
      const previousBox = await boxOf(previous);
      const lastBox = await boxOf(last);
      const inputBox = await boxOf(input);
      // The chips sit on one line, so a neighbour's edge is reached along the line at the chip's own middle.
      expect(Math.abs(previousBox.y - lastBox.y)).toBeLessThan(previousBox.height);

      await tap(page, touch, lastBox.x + INTO_NEIGHBOUR_PX, lastBox.y + lastBox.height / 2);
      await expect(chips).toHaveCount(before);
      await tap(page, touch, inputBox.x + INTO_NEIGHBOUR_PX, lastBox.y + lastBox.height / 2);
      await expect(chips).toHaveCount(before);

      const mark = await boxOf(last.locator('[data-slot="combobox-chip-remove"]'));
      await tap(page, touch, mark.x + mark.width / 2, mark.y + mark.height / 2);
      await expect(chips).toHaveCount(before - 1);
    });
  });
}

test.describe("at a fine pointer", () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 900 } });

  test("a keyword chip's remove mark and the draft input are 24px targets", async ({ corpus, mount, page }) => {
    const { chips, input } = await mountKeywordRow(mount, page, corpus);
    const remove = chips.last().locator('[data-slot="combobox-chip-remove"]');
    await expect(remove).toBeVisible();

    const mark = await boxOf(remove);
    const field = await boxOf(input);
    // The mark stays its glyph's box; the target is the hit area around it, so nothing visible grew.
    expect(mark.width).toBeLessThan(FINE_TARGET_PX);
    expect(field.height).toBeGreaterThanOrEqual(FINE_TARGET_PX);
    const reach = FINE_TARGET_PX / 2 - 1;
    const centre = { x: mark.x + mark.width / 2, y: mark.y + mark.height / 2 };
    for (const [dx, dy] of [
      [-reach, -reach],
      [reach, -reach],
      [-reach, reach],
      [reach, reach],
    ] as const) {
      expect(await remove.evaluate((node, [x, y]) => node.contains(document.elementFromPoint(x, y)), [centre.x + dx, centre.y + dy] as const)).toBe(true);
    }
  });
});
