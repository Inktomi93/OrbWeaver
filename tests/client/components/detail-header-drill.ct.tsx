// A drilled member's header is the one detail template. On the desktop shell its Back, its visible name and its own verbs share
// one row under one `h2`. In the phone shell the topbar already prints the name and the way back, so the row's Back and visible
// name stand down while the `h2` stays in the outline and the verbs stay reachable. While the member's read is pending, and
// after it fails, the row is the Back alone. The shell, the settings panes and the world-book member are the production ones
// over a corpus root.
// @subject packages/client/src/components/detail-header.tsx
import { sectionBackName } from "@orb/client/lib";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import type { ServedHold } from "@orb/testkit/ct";
import { createShellAmbientReads, holdServed, routeTrpc, SECTION_LABELS, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { WORLD_INFO_EDIT_DETAILS_NAME, WORLD_INFO_GROUP_LABEL } from "#client/features/world-info/lib/world-info-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const READS = [...SECTION_PROCEDURES, "worldInfo.countBooks", "worldInfo.listBooksWithUsage", "worldInfo.listEntries", "regex.listGlobal"] as const;
const BOOK = "Header witness book";
const BACK = sectionBackName(WORLD_INFO_GROUP_LABEL);

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
  await seedShellState(page, { activeSection: "config" });
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
