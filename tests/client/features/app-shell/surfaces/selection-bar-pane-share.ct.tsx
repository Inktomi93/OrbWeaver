// A selection bar pinned under a grown list on a phone at 200% browser text keeps its own height up to its share of the pane:
// it never pays for the list's floor by shrinking to a strip. Its count and every action stay on screen, its dismiss stays on
// its first line, it does not cover the row that summoned it, and when the floor and the bar do not fit together the pane
// scrolls. The production shell over a corpus root, for both bulk lists the phone reaches.
// @subject packages/ui/src/primitives/selection-bar/selection-bar.tsx
import { createCharacterSchema } from "@orb/contracts/character";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { nearestScroller, PLATFORM_TEXT_SCALES, resolvedLength, seedShellState, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { REGEX_GROUP_LABEL } from "#client/features/regex/lib/regex-names.ts";
import { SELECTION_CLEAR_NAME, selectionCountLabel } from "#ui/primitives/selection-bar/selection-bar-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const SCALE = PLATFORM_TEXT_SCALES[1];
const PHONES = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
] as const;
const SELECTED = 2;
const LISTS = ["characters", "regex"] as const;
type BulkList = (typeof LISTS)[number];
type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Corpus = Parameters<typeof createShellAmbientReads>[0];
const WITNESSES = ["Pane share witness one", "Pane share witness two", "Pane share witness three"] as const;

/** Seeds the list's own members, serves the shell and lands on the list's section. */
async function prepareList(page: Page, root: Root, corpus: Corpus, list: BulkList): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  for (const name of WITNESSES) {
    await (list === "characters"
      ? caller.character.create({
          input: createCharacterSchema.parse({ handle: name.toLowerCase().replaceAll(" ", "-"), name, description: "A character for the bulk bar." }),
        })
      : caller.regex.createScript({
          input: createRegexScriptSchema.parse({ name, findRegex: "witness", replaceString: "", placement: ["AI_OUTPUT"], enabled: false }),
        }));
  }
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, "regex.listGlobal"]),
  });
  await seedShellState(
    page,
    list === "characters"
      ? { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } }
      : { activeSection: "config" },
  );
}

/** Opens bulk selection and selects the first rows the way a person does; returns the bar and the last row selected. */
async function selectRows(page: Page, list: BulkList): Promise<{ readonly bar: Locator; readonly lastSelected: Locator }> {
  if (list === "regex") {
    await page
      .getByRole("button", { name: new RegExp(`^${REGEX_GROUP_LABEL}`, "u") })
      .first()
      .click();
  }
  await page.getByRole("button", { name: /^Select( multiple| scripts)?$/u }).click();
  const checkboxes = page.getByRole("checkbox");
  await expect(checkboxes.first()).toBeVisible();
  for (let index = 0; index < SELECTED; index += 1) {
    await checkboxes.nth(index).scrollIntoViewIfNeeded();
    await checkboxes.nth(index).click();
  }
  const bar = page.locator('[data-slot="selection-bar-root"]');
  await expect(bar.locator('[data-slot="selection-bar-count"]')).toHaveText(selectionCountLabel(SELECTED));
  return { bar, lastSelected: checkboxes.nth(SELECTED - 1) };
}

function middle(box: { readonly y: number; readonly height: number } | null): number {
  if (box === null) {
    throw new Error("A bar part has no rendered box");
  }
  return box.y + box.height / 2;
}

/** Every part on screen, the bar's own scroll bringing in the rest; then the dismiss level with the count on the first line. */
async function expectWholeBar(bar: Locator): Promise<void> {
  const count = bar.locator('[data-slot="selection-bar-count"]');
  const parts = [count, ...(await bar.getByRole("button").all())];
  // Positive control: the count, at least one action and the dismiss.
  expect(parts.length).toBeGreaterThan(2);
  for (const part of parts) {
    await part.scrollIntoViewIfNeeded();
    await expect(part).toBeInViewport({ ratio: 1 });
  }
  await bar.evaluate((element) => {
    element.scrollTop = 0;
  });
  const clear = bar.getByRole("button", { name: SELECTION_CLEAR_NAME, exact: true });
  const [countBox, clearBox] = await Promise.all([count.boundingBox(), clear.boundingBox()]);
  await test.info().attach("first-line", { body: JSON.stringify({ countBox, clearBox }), contentType: "application/json" });
  expect(Math.abs(middle(clearBox) - middle(countBox))).toBeLessThanOrEqual((clearBox?.height ?? 0) / 2);
}

for (const viewport of PHONES) {
  test.describe(`a ${String(viewport.width)}x${String(viewport.height)} phone at ${String(SCALE * 100)}% text`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    for (const list of LISTS) {
      test(`the ${list} selection bar keeps its height up to its share, shows every part and covers no selected row`, async ({ corpus, mount, page }) => {
        await using _textSize = await setPlatformTextSize(page, SCALE);
        await using root = await createCorpusHarness(undefined, { startJobs: false });
        await prepareList(page, root, corpus, list);
        await mount<typeof ShellAmbientStory>(STORY, {});
        const { bar, lastSelected } = await selectRows(page, list);
        const pane = await bar.evaluateHandle(nearestScroller);
        // The share the bar holds to is the cap the product applied; none means its natural height already fits.
        const share = await bar.evaluate(
          (element, scroller) => ({
            height: element.getBoundingClientRect().height,
            natural: element.scrollHeight,
            cap: element.style.maxBlockSize === "" ? Number.POSITIVE_INFINITY : Number.parseFloat(element.style.maxBlockSize),
            pane: scroller.clientHeight,
          }),
          pane,
        );
        await page.screenshot({ path: test.info().outputPath(`${list}-selection-bar.png`) });
        await test.info().attach("bar-share", { body: JSON.stringify(share), contentType: "application/json" });
        // The bar's height is the smaller of its natural height and its share of the pane, never a strip below both.
        expect(Math.abs(share.height - Math.min(share.natural, share.cap))).toBeLessThanOrEqual(1);
        // The bar never fills the pane: rows stay on screen above it.
        expect(share.height).toBeLessThan(share.pane);

        // The bar does not sit over the row that was just selected.
        const [rowBox, barBox] = await Promise.all([lastSelected.boundingBox(), bar.boundingBox()]);
        expect((rowBox?.y ?? 0) + (rowBox?.height ?? 0)).toBeLessThanOrEqual((barBox?.y ?? 0) + 1);

        await expectWholeBar(bar);

        // What gives way when the floor and the bar do not fit together: the list keeps its floor and the pane scrolls by
        // at least the shortfall.
        const listBox = page.locator('[data-slot="virtual-list-scroll"]').first();
        const floor = await resolvedLength(page, `var(${TOKENS["height.scroll-sm"].cssVar})`, listBox);
        expect((await listBox.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(floor - 1);
        const shortfall = Math.max(0, share.height + floor - share.pane);
        expect(await pane.evaluate((scroller) => scroller.scrollHeight - scroller.clientHeight)).toBeGreaterThanOrEqual(shortfall - 1);
      });
    }
  });
}
