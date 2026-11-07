// @subject packages/client/src/features/databank/surfaces/databank-library-surface.tsx
// A Databank row's Delete confirm holds until the delete lands: a refused delete keeps the dialog and the open
// document, Cancel returns focus to the row's own menu trigger, and a landed delete hands focus to a neighbour row.

import { ROW_DELETE_NAME } from "@orb/client/lib";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const READS = [...SECTION_PROCEDURES, "databank.bankHealth", "databank.listGlobal", "databank.listAttachments", "databank.get"] as const;
const DOCUMENTS = ["Lantern notes", "Harbour notes", "Orchard notes"] as const;
const ROW = '[data-slot="list-row-root"]';

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

async function openDelete(page: Page, name: string): Promise<void> {
  const row = page.locator(ROW).filter({ has: page.getByRole("button", { name: new RegExp(name, "u") }) });
  await row.hover();
  await row.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole("menu").getByRole("menuitem", { name: ROW_DELETE_NAME, exact: true }).click();
}

test("a refused Databank delete keeps its confirm and its trigger, and a landed one hands focus to a neighbour", async ({ mount, page, corpus }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  for (const name of DOCUMENTS) {
    await caller.databank.createFromText({ name, text: `${name} body.` });
  }
  let refusing = true;
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["databank.remove"], () => (refusing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : undefined)),
  });
  await seedShellState(page, { activeSection: "databank" });
  await mount<typeof ShellAmbientStory>(STORY, {});

  await openDelete(page, "Harbour notes");
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
  await expect(confirm.getByRole("alert")).toBeVisible();
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(
    page
      .locator(ROW)
      .filter({ has: page.getByRole("button", { name: /Harbour notes/u }) })
      .locator('button[aria-haspopup="menu"]'),
  ).toBeFocused();

  refusing = false;
  await openDelete(page, "Harbour notes");
  await confirm.getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  // The list refetches from the server's bus, which this mount has no socket for; the landed delete hands focus on regardless.
  const harbour = page.locator(ROW).filter({ has: page.getByRole("button", { name: /Harbour notes/u }) });
  await expect(page.locator(ROW).locator(":focus")).toHaveCount(1);
  await expect(harbour.locator(":focus")).toHaveCount(0);
});
