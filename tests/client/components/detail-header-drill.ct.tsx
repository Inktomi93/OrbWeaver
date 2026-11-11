// A drilled member's header is the one detail template. On the desktop shell its Back, its visible name and its own verbs share
// one row under one `h2`. In the phone shell the topbar already prints the name and the way back, so the row's Back and visible
// name stand down while the `h2` stays in the outline and the verbs stay reachable. Across the whole range, at enlarged text and
// on either side of the shell's breakpoint and of the content column's narrow edge, exactly one Back is visible and takes focus
// and the member's name is printed once. While the member's read is pending, and after it fails, the row is the Back alone. The
// shell, the settings panes and the world-book member are the production ones over a corpus root.
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
const BACK = sectionBackName(WORLD_INFO_GROUP_LABEL);
const TOPBAR_BACK = sectionBackName(SECTION_LABELS.settings);
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
  reads: { readonly corpus: Corpus; readonly bookRead?: Intercept },
): Promise<{ readonly header: Locator }> {
  const { corpus, bookRead } = reads;
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.worldInfo.createBook({ input: { name: BOOK } });
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
  return { header: page.locator('[data-slot="config-drill-header"]') };
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
    // Positive control: the phone topbar carries the shell's own Back, which pops this member, in place of the row's.
    await expect(page.getByRole("banner").getByRole("button", { name: sectionBackName(SECTION_LABELS.settings), exact: true })).toBeVisible();
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
  const backs = page
    .getByRole("button", { name: TOPBAR_BACK, exact: true })
    .or(page.getByRole("button", { name: BACK, exact: true }))
    .filter({ visible: true });
  await expect(backs, at).toHaveCount(1);
  await backs.focus();
  await expect(backs, at).toBeFocused();
  await expect(header.getByRole("heading", { level: 2, name: BOOK, exact: true }), at).toHaveCount(1);
  await expect.poll(() => printedNames(page), { message: at }).toBe(1);
}

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
