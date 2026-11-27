// @subject packages/client/src/features/world-info/components/world-info-collection-rows.tsx
// @subject packages/client/src/features/world-info/surfaces/world-info-member-surface.tsx
// A book row in the library says when the book's own details were last edited, and each entry row inside a book says when that entry was.
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { WORLD_INFO_BOOK_EDITED_LEAD, WORLD_INFO_GROUP_LABEL } from "#client/features/world-info/lib/world-info-names.ts";
import { EDITED_STAMP_LEAD } from "#client/lib/stamp-copy.ts";
import type { WorldInfoMemberStory } from "./_member-stories.tsx";

const SHELL_STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const MEMBER_STORY = "tests/client/features/world-info/surfaces/_member-stories/WorldInfoMemberStory";
const LIBRARY_PROCEDURES = [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, "worldInfo.listBooksWithUsage", "worldInfo.listGlobal"] as const;
const MEMBER_PROCEDURES = [
  "worldInfo.listBooksWithUsage",
  "worldInfo.listAttachmentsForBook",
  "worldInfo.listGlobal",
  "persona.list",
  "worldInfo.getBook",
  "worldInfo.listEntries",
  "settings.getUserSettings",
] as const;

test.use({ viewport: { width: 1280, height: 900 }, isMobile: false, hasTouch: false });

test("every book row on screen in the World Info library says when the book's own details were last edited", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const books = await caller.worldInfo.listBooksWithUsage();
  expect(books.length).toBeGreaterThan(0);
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, LIBRARY_PROCEDURES) });
  await seedShellState(page, { activeSection: "config" });
  await mount<typeof ShellAmbientStory>(SHELL_STORY, {});
  await page
    .getByRole("button", { name: new RegExp(`^${RegExp.escape(WORLD_INFO_GROUP_LABEL)}`, "u") })
    .first()
    .click();
  // The library is virtualized, so the rows in the DOM are the window of books on screen; the rendered window is non-empty and each
  // row in it carries the stamp. The book's stamp is its own row's edit (an entry edit does not move it), so the lead names the details.
  const rows = page.locator('[data-slot="list-row-root"]');
  await expect(rows.filter({ hasText: books[0]?.name ?? "" }).first()).toBeVisible();
  const rendered = await rows.count();
  expect(rendered).toBeGreaterThan(0);
  await expect(rows.filter({ hasText: WORLD_INFO_BOOK_EDITED_LEAD })).toHaveCount(rendered);
});

test("every entry row inside a book says when the entry was last edited", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const bookId = corpus.worldInfoLibrary?.ids.libraryBookId;
  if (bookId === undefined) {
    throw new Error("The corpus must hold a World Info library book");
  }
  const entries = await caller.worldInfo.listEntries({ bookId });
  expect(entries.length).toBeGreaterThan(0);
  await routeTrpc(page, serveCorpusProcedures(caller, MEMBER_PROCEDURES));
  const component = await mount<typeof WorldInfoMemberStory>(MEMBER_STORY, { bookId, context: false });
  const stamps = component.locator('[data-slot="list-row-meta"]');
  await expect(stamps).toHaveCount(entries.length);
  await expect(stamps.filter({ hasText: EDITED_STAMP_LEAD })).toHaveCount(entries.length);
});
