// A Databank document opened from its row by keyboard takes focus into its detail pane: the row stays in the list beside it, so the
// pane's own arrival is all that moves the reader off the row. The shell, the list and the detail are the production ones over a
// corpus root, and the document is made through the production create verb.
// @subject packages/client/src/features/databank/surfaces/databank-detail-surface.tsx
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { DATABANK_LIST_NAME } from "#client/features/databank/lib/databank-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const READS = [...SECTION_PROCEDURES, "databank.bankHealth", "databank.listGlobal", "databank.listAttachments", "databank.get"] as const;
const DOCUMENT = "Lantern notes";

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

test("opening a document from its row by keyboard lands focus in its detail pane", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.databank.createFromText({ name: DOCUMENT, text: `${DOCUMENT} body.` });
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, READS) });
  await seedShellState(page, { activeSection: "databank" });
  await mount<typeof ShellAmbientStory>(STORY, {});

  const row = page.getByRole("list", { name: DATABANK_LIST_NAME, exact: true }).getByRole("button", { name: new RegExp(`^${DOCUMENT}`, "u") });
  await row.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator('[data-slot="databank-content"]')).toBeFocused();
});
