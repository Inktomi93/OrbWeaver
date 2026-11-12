// A drilled member's header is the one detail template. On the desktop shell its Back, its visible name and its own verbs share
// one row under one `h2`. In the phone shell the topbar already prints the name and the way back, so the row's Back and visible
// name stand down while the `h2` stays in the outline and the verbs stay reachable. Across the whole range, at enlarged text and
// on either side of the shell's breakpoint and of the content column's narrow edge, exactly one Back is visible and takes focus
// and the member's name is printed once. While the member's read is pending, and after it fails, the row is the Back alone. On a
// phone the topbar's Back is the row's own: it names the library it opens and returns focus to the opening row, and an entry
// opened by keyboard takes focus. The shell, the settings panes and the world-book member are the production ones over a corpus root.
// @subject packages/client/src/components/detail-header.tsx
import { sectionBackName } from "@orb/client/lib";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { expectShellRegime, PLATFORM_TEXT_SCALES, seedShellState, setPlatformTextSize, shellRegimeAt } from "@orb/testkit/browser/spec";
import type { ServedHold } from "@orb/testkit/ct";
import { createShellAmbientReads, holdServed, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { WORLD_INFO_EDIT_DETAILS_NAME, WORLD_INFO_GROUP_LABEL } from "#client/features/world-info/lib/world-info-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const READS = [...SECTION_PROCEDURES, "worldInfo.countBooks", "worldInfo.listBooksWithUsage", "worldInfo.listEntries", "regex.listGlobal"] as const;
const BOOK = "Header witness book";
const ENTRY = "Header witness entry";
const BACK = sectionBackName(WORLD_INFO_GROUP_LABEL);
// How far either side of an edge a width is set, in px: clear of sub-pixel rounding, well inside one regime.
const EDGE_STEP = 8;
// The scan's stride over the desktop range, in px at 100% text: finer than any pane, so no crossing hides between two samples.
const SCAN_STEP = 16;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Corpus = Parameters<typeof createShellAmbientReads>[0];
type Intercept = () => ServedHold | ReturnType<typeof trpcError> | undefined;

/** Mounts the production shell on the settings section, opens World Info and drills into the witness book by keyboard. */
async function drillIntoBook(
  page: Page,
  root: Root,
  mountShell: () => Promise<unknown>,
  reads: { readonly corpus: Corpus; readonly bookRead?: Intercept; readonly entries?: readonly string[] },
): Promise<{ readonly header: Locator; readonly row: Locator }> {
  const { corpus, bookRead, entries = [] } = reads;
  const caller = await root.internalCallerFor(root.ownerId);
  const book = await caller.worldInfo.createBook({ input: { name: BOOK } });
  for (const title of entries) {
    await caller.worldInfo.createEntry({ bookId: book.id, input: { title, content: "Lore." } });
  }
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["worldInfo.getBook"], bookRead),
  });
  // Both panes docked, so a desktop width can narrow the content column past its edge while the shell stays desktop.
  await seedShellState(page, { activeSection: "config", panelOverrides: { config: { list: "docked", context: "docked" } } });
  await mountShell();
  await page
    .getByRole("button", { name: new RegExp(`^${WORLD_INFO_GROUP_LABEL}`, "u") })
    .first()
    .click();
  const row = page.locator('[data-slot="config-content"] [data-slot="list-row-body"]').filter({ hasText: BOOK });
  await row.focus();
  await page.keyboard.press("Enter");
  return { header: page.locator('[data-slot="config-drill-header"]'), row };
}

function centre(box: { readonly y: number; readonly height: number } | null): number {
  if (box === null) {
    throw new Error("A header part has no rendered box");
  }
  return box.y + box.height / 2;
}

test.describe("desktop shell", () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

  test("a drilled member draws its Back, its name and its verbs on one row under one h2", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const { header } = await drillIntoBook(page, root, () => mount<typeof ShellAmbientStory>(STORY, {}), { corpus });
    await expect(header.getByRole("heading", { level: 2 })).toHaveCount(1);
    await expect(header.getByRole("heading", { level: 2, name: BOOK, exact: true })).toHaveCount(1);
    const back = header.getByRole("button", { name: BACK, exact: true });
    const name = header.locator('[aria-hidden="true"]').filter({ hasText: BOOK });
    const verb = header.getByRole("button", { name: WORLD_INFO_EDIT_DETAILS_NAME, exact: true });
    await expect(back).toBeVisible();
    await expect(name).toBeVisible();
    await expect(verb).toBeVisible();
    const [backBox, nameBox, verbBox] = await Promise.all([back.boundingBox(), name.boundingBox(), verb.boundingBox()]);
    const tolerance = (backBox?.height ?? 0) / 2;
    expect(Math.abs(centre(backBox) - centre(nameBox))).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(centre(nameBox) - centre(verbBox))).toBeLessThanOrEqual(tolerance);
  });

  test("while the member's read is pending the drill row is the Back alone", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const held = holdServed();
    const { header } = await drillIntoBook(page, root, () => mount<typeof ShellAmbientStory>(STORY, {}), { corpus, bookRead: () => held });
    await held.requested;
    await expect(header.getByRole("button", { name: BACK, exact: true })).toBeVisible();
    await expect(header.getByRole("button")).toHaveCount(1);
    await expect(header.getByRole("heading")).toHaveCount(0);
    held.release();
    // Positive control: the same row names the member once its read answers.
    await expect(header.getByRole("heading", { level: 2, name: BOOK, exact: true })).toHaveCount(1);
  });

  test("after the member's read fails the drill row is the Back alone, above the retry", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const { header } = await drillIntoBook(page, root, () => mount<typeof ShellAmbientStory>(STORY, {}), { corpus, bookRead: () => trpcError() });
    await expect(page.locator('[data-slot="query-error"]')).toBeVisible();
    await expect(header.getByRole("button", { name: BACK, exact: true })).toBeVisible();
    await expect(header.getByRole("button")).toHaveCount(1);
    await expect(header.getByRole("heading")).toHaveCount(0);
  });
});

test.describe("phone shell", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("a drilled member's Back and visible name stand down for the topbar; its h2 and verbs stay", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const { header } = await drillIntoBook(page, root, () => mount<typeof ShellAmbientStory>(STORY, {}), { corpus });
    await expect(header.getByRole("heading", { level: 2, name: BOOK, exact: true })).toHaveCount(1);
    await expect(header.getByRole("button", { name: WORLD_INFO_EDIT_DETAILS_NAME, exact: true })).toBeVisible();
    await expect(header.getByRole("button", { name: BACK, exact: true })).toBeHidden();
    await expect(header.locator('[aria-hidden="true"]').filter({ hasText: BOOK })).toBeHidden();
    // The phone topbar carries the row's own Back in its place, under the name of the library it opens, not the section's.
    await expect(page.getByRole("banner").getByRole("button", { name: BACK, exact: true })).toBeVisible();
    await expect(page.getByRole("banner").getByRole("button", { name: sectionBackName(SECTION_LABELS.settings), exact: true })).toHaveCount(0);
  });

  test("the topbar's Back returns focus to the row the member was opened from, as the row's own Back does", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const { header, row } = await drillIntoBook(page, root, () => mount<typeof ShellAmbientStory>(STORY, {}), { corpus });
    await expect(header.getByRole("heading", { level: 2, name: BOOK, exact: true })).toHaveCount(1);
    const topbarBack = page.getByRole("banner").getByRole("button", { name: BACK, exact: true });
    await topbarBack.focus();
    await page.keyboard.press("Enter");
    await expect(header).toHaveCount(0);
    await expect(row).toBeFocused();
  });

  for (const state of ["pending", "failed"] as const) {
    test(`while the member's read is ${state} the topbar carries the row's Back, and it returns focus to the opening row`, async ({ corpus, mount, page }) => {
      await using root = await createCorpusHarness();
      const held = holdServed();
      const { header, row } = await drillIntoBook(page, root, () => mount<typeof ShellAmbientStory>(STORY, {}), {
        corpus,
        bookRead: () => (state === "pending" ? held : trpcError()),
      });
      // Either state draws the row as the Back alone, with no heading; on a phone that Back stands down for the topbar's.
      await expect(header.locator('[data-shell-identity="back"]')).toHaveCount(1);
      await expect(header.getByRole("heading")).toHaveCount(0);
      const topbarBack = page.getByRole("banner").getByRole("button", { name: BACK, exact: true });
      await expect(topbarBack).toBeVisible();
      await expect(header.getByRole("button", { name: BACK, exact: true })).toBeHidden();
      await page.screenshot({ path: test.info().outputPath(`phone-drill-${state}.png`) });
      await topbarBack.focus();
      await page.keyboard.press("Enter");
      await expect(row).toBeFocused();
      held.release();
    });
  }

  test("the topbar's Back pops one rung per press, entry to book to library to the list, named for where each press goes", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const { header } = await drillIntoBook(page, root, () => mount<typeof ShellAmbientStory>(STORY, {}), { corpus, entries: [ENTRY] });
    await expect(header.getByRole("heading", { level: 2, name: BOOK, exact: true })).toHaveCount(1);
    const entryRow = page.locator('[data-slot="world-info-member-editor"] [data-slot="list-row-body"]').filter({ hasText: ENTRY });
    await entryRow.focus();
    await page.keyboard.press("Enter");
    const topbar = page.getByRole("banner");
    const rungs = [
      // The entry: the topbar names the book it returns to, and the book is open behind it.
      { back: sectionBackName(BOOK), after: header.getByRole("heading", { level: 2, name: BOOK, exact: true }) },
      // The book: the topbar names the library, and the library's rows are the pane again.
      { back: BACK, after: page.locator('[data-slot="config-content"] [data-slot="list-row-body"]').filter({ hasText: BOOK }) },
      // The library: the topbar names Settings, and the list is the screen again.
      { back: sectionBackName(SECTION_LABELS.settings), after: page.getByRole("button", { name: new RegExp(`^${WORLD_INFO_GROUP_LABEL}`, "u") }).first() },
    ];
    const names = rungs.map((rung) => rung.back);
    await expect(header.getByRole("heading", { level: 2, name: ENTRY, exact: true })).toHaveCount(1);
    for (const [at, rung] of rungs.entries()) {
      // Exactly one way back, and it names where this press goes.
      for (const other of names.filter((name) => name !== rung.back)) {
        await expect(topbar.getByRole("button", { name: other, exact: true })).toHaveCount(0);
      }
      const back = topbar.getByRole("button", { name: rung.back, exact: true });
      await expect(back, `rung ${String(at)}`).toBeVisible();
      await back.click();
      await expect(rung.after, `after rung ${String(at)}`).toBeVisible();
    }
    // The list is the screen: no way back is offered.
    for (const name of names) {
      await expect(topbar.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
  });

  test("opening an entry by keyboard lands focus in the entry, not on the page", async ({ corpus, mount, page }) => {
    await using root = await createCorpusHarness();
    const { header } = await drillIntoBook(page, root, () => mount<typeof ShellAmbientStory>(STORY, {}), { corpus, entries: [ENTRY] });
    await expect(header.getByRole("heading", { level: 2, name: BOOK, exact: true })).toHaveCount(1);
    const entryRow = page.locator('[data-slot="world-info-member-editor"] [data-slot="list-row-body"]').filter({ hasText: ENTRY });
    await entryRow.focus();
    await page.keyboard.press("Enter");
    await expect(header.getByRole("heading", { level: 2, name: ENTRY, exact: true })).toHaveCount(1);
    await expect(page.locator('[data-slot="world-info-member-editor"]')).toBeFocused();
  });
});

/** How many times the member's name is painted in the content column and its topbar, the sr-only headings aside. */
function printedNames(page: Page): Promise<number> {
  return page.evaluate(
    (name) =>
      [...document.querySelectorAll(".shell-main *")].filter(
        (element) =>
          element.children.length === 0 && element.textContent.trim() === name && element.checkVisibility() && element.getBoundingClientRect().width > 1,
      ).length,
    BOOK,
  );
}

/** The content column's width once the shell has answered the last resize: its regime reaches the panes through a React commit. */
function contentColumnWidth(page: Page): Promise<number> {
  return page.locator(".shell-main").evaluate(
    (element) =>
      new Promise<number>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(element.getBoundingClientRect().width)));
      }),
  );
}

/** Which side of the 32rem container edge the column sits on; the query is `max-width`, so the edge itself is under. */
async function columnSide(page: Page, columnEdge: number): Promise<-1 | 1> {
  return (await contentColumnWidth(page)) <= columnEdge ? -1 : 1;
}

/** One crossing of the content column's edge: two viewport widths a pixel apart, the column at or under its edge at one. */
interface ColumnCrossing {
  readonly under: number;
  readonly over: number;
}

/** Bisects one crossing between two widths whose columns sit on opposite sides of the edge, down to adjacent pixels. */
async function bisectCrossing(page: Page, columnEdge: number, from: number, to: number): Promise<ColumnCrossing> {
  const fromSide = await sideAt(page, columnEdge, from);
  let [low, high] = [from, to];
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if ((await sideAt(page, columnEdge, middle)) === fromSide) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return fromSide < 0 ? { under: low, over: high } : { under: high, over: low };
}

async function sideAt(page: Page, columnEdge: number, width: number): Promise<-1 | 1> {
  await page.setViewportSize({ width, height: 900 });
  return columnSide(page, columnEdge);
}

/**
 * Every width on the desktop shell where the content column crosses its edge. The column is not monotonic in the viewport:
 * under the dock breakpoint the panes float over it, and where docking both would starve it the context pane floats instead,
 * so the scan walks the desktop range in steps of `SCAN_STEP` text-scaled pixels and bisects each crossing it finds.
 */
async function findColumnCrossings(page: Page, shellEdge: number, columnEdge: number, scale: number): Promise<readonly ColumnCrossing[]> {
  const step = SCAN_STEP * scale;
  const crossings: ColumnCrossing[] = [];
  let previous = { width: Math.ceil(shellEdge) + 1, side: await sideAt(page, columnEdge, Math.ceil(shellEdge) + 1) };
  for (let width = previous.width + step; width <= Math.ceil(shellEdge * 3); width += step) {
    const side = await sideAt(page, columnEdge, width);
    if (side !== previous.side) {
      crossings.push(await bisectCrossing(page, columnEdge, previous.width, width));
    }
    previous = { width, side };
  }
  return crossings;
}

async function expectOneBackOneName(page: Page, header: Locator, at: string): Promise<void> {
  // The topbar's Back and the row's carry one name, so one visible button by that name is one Back whichever draws it.
  const backs = page.getByRole("button", { name: BACK, exact: true }).filter({ visible: true });
  await expect(backs, at).toHaveCount(1);
  await backs.focus();
  await expect(backs, at).toBeFocused();
  await expect(header.getByRole("heading", { level: 2, name: BOOK, exact: true }), at).toHaveCount(1);
  await expect.poll(() => printedNames(page), { message: at }).toBe(1);
}

/** How many lines a control's label text sets on; its icon is not text, so it is not counted. */
function labelLines(control: Locator): Promise<number> {
  return control.evaluate((node) => {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const tops = new Set<number>();
    for (let text = walker.nextNode(); text !== null; text = walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(text);
      for (const rect of range.getClientRects()) {
        if (rect.width > 0) {
          tops.add(Math.round(rect.top));
        }
      }
    }
    return tops.size;
  });
}

// Who carries the way back at a regime: on the desktop shell the row's own Back, set on one line; on the phone shell the topbar's
// Back, an icon named for the library, while the row's stands down.
const BACK_CARRIER = {
  desktop: async (_page: Page, header: Locator): Promise<void> => {
    const rowBack = header.getByRole("button", { name: BACK, exact: true });
    await expect(rowBack).toBeVisible();
    // Polled: the regime change at enlarged text settles over a pane transition.
    await expect.poll(() => labelLines(rowBack)).toBe(1);
  },
  mobile: async (page: Page, header: Locator): Promise<void> => {
    await expect(page.getByRole("banner").getByRole("button", { name: BACK, exact: true })).toBeVisible();
    await expect(header.locator('[data-shell-identity="back"]')).toBeHidden();
  },
} as const satisfies Record<ReturnType<typeof shellRegimeAt>, (page: Page, header: Locator) => Promise<void>>;

test.describe("both panes docked at 1100px", () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1100, height: 800 } });

  for (const scale of PLATFORM_TEXT_SCALES.slice(0, 2)) {
    test(`at ${String(scale * 100)}% text the Back is whole and the verbs drop a line rather than clip`, async ({ corpus, mount, page }) => {
      await using _textSize = await setPlatformTextSize(page, scale);
      await using root = await createCorpusHarness();
      const { header } = await drillIntoBook(page, root, () => mount<typeof ShellAmbientStory>(STORY, {}), { corpus });
      await expect(header.getByRole("heading", { level: 2, name: BOOK, exact: true })).toHaveCount(1);
      const regime = shellRegimeAt(1100, scale);
      await expectShellRegime(page, regime);
      await expect(page.getByRole("button", { name: BACK, exact: true }).filter({ visible: true })).toHaveCount(1);
      await BACK_CARRIER[regime](page, header);
      const verb = header.getByRole("button", { name: WORLD_INFO_EDIT_DETAILS_NAME, exact: true });
      await expect(verb).toBeVisible();
      await page.screenshot({ path: test.info().outputPath(`drill-header-1100-${String(scale * 100)}.png`) });
      // Not clipped: the verb's label fits its box and the verb lies inside the header.
      expect(await verb.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      const [verbBox, headerBox] = await Promise.all([verb.boundingBox(), header.boundingBox()]);
      if (verbBox === null || headerBox === null) {
        throw new Error("The drill header and its verb have no rendered boxes");
      }
      expect(verbBox.x + verbBox.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 1);
      expect(verbBox.x).toBeGreaterThanOrEqual(headerBox.x - 1);
    });
  }
});

test.describe("across the shell's range", () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

  for (const scale of PLATFORM_TEXT_SCALES.slice(0, 2)) {
    test(`at ${String(scale * 100)}% text every width shows one Back that takes focus and prints the member's name once`, async ({ corpus, mount, page }) => {
      await using textSize = await setPlatformTextSize(page, scale);
      await using root = await createCorpusHarness();
      const { header } = await drillIntoBook(page, root, () => mount<typeof ShellAmbientStory>(STORY, {}), { corpus });
      await expect(header.getByRole("heading", { level: 2, name: BOOK, exact: true })).toHaveCount(1);
      const rem = textSize.standardFontPx;
      const shellEdge = Number.parseFloat(TOKENS["breakpoint.shell"].value) * rem;
      const columnEdge = Number.parseFloat(TOKENS["container.cq-32"].value) * rem;
      const sizes = [
        { width: 390, height: 844 },
        { width: 700, height: 1000 },
        { width: 1100, height: 800 },
        { width: 1440, height: 900 },
        { width: Math.floor(shellEdge) - EDGE_STEP, height: 900 },
        { width: Math.ceil(shellEdge) + EDGE_STEP, height: 900 },
      ];
      for (const size of sizes) {
        await page.setViewportSize(size);
        const at = `${String(size.width)}x${String(size.height)}`;
        await expectShellRegime(page, shellRegimeAt(size.width, scale));
        await expectOneBackOneName(page, header, at);
      }

      const crossings = await findColumnCrossings(page, shellEdge, columnEdge, scale);
      // Positive control: the docked desktop column does pass under its edge somewhere, so both sides are exercised.
      expect(crossings.length, "the desktop column crosses its edge").toBeGreaterThan(0);
      for (const crossing of crossings) {
        for (const [side, width] of [
          [-1, crossing.under],
          [1, crossing.over],
        ] as const) {
          await page.setViewportSize({ width, height: 900 });
          await expectShellRegime(page, "desktop");
          expect(await columnSide(page, columnEdge), `content column at ${String(width)}`).toBe(side);
          await expectOneBackOneName(page, header, `column edge ${side < 0 ? "under" : "over"} at ${String(width)}`);
        }
      }
    });
  }
});
