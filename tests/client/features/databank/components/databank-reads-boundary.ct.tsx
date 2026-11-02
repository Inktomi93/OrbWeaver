// @subject packages/client/src/features/databank/components/databank-context-body.tsx
// The Databank reads go through the shared boundary: a held read shows the loading skeleton, a failed one the shared error
// block, and Retry refetches. A deleted document is the typed gone state in the context rail, not the error block.

import { contextToggleLabel } from "@orb/client/lib";
import type { DocumentId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import type { TrpcRoutes } from "@orb/testkit/ct";
import { createShellAmbientReads, holdServed, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { DATABANK_VIEW_SOURCE_NAME } from "#client/features/databank/lib/databank-names.ts";
import type { DatabankCompositionShellStory } from "../../app-shell/surfaces/_databank-composition-stories.tsx";

const STORY = "tests/client/features/app-shell/surfaces/_databank-composition-stories/DatabankCompositionShellStory";
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const READS = [...SECTION_PROCEDURES, "databank.listGlobal", "databank.listAttachments", "databank.get"] as const;

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Corpus = Parameters<typeof createShellAmbientReads>[0];

async function prepare(
  root: Root,
  page: Page,
  corpus: Corpus,
  overrides: (caller: Awaited<ReturnType<Root["internalCallerFor"]>>) => TrpcRoutes,
): Promise<DocumentId> {
  const caller = await root.internalCallerFor(root.ownerId);
  const created = await caller.databank.createFromText({ name: "Boundary notes", text: "The lantern illuminates the charts." });
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, READS), ...overrides(caller) });
  await seedShellState(page, { activeSection: "databank", panelOverrides: { databank: { list: "collapsed" } } });
  return created.document.id;
}

async function openContext(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  return page.locator(CONTEXT);
}

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

test("a held attachments read shows the loading skeleton, a failed one the error block, and Retry shows the block", async ({ mount, page, corpus }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const hold = holdServed();
  let held = false;
  let failing = true;
  const documentId = await prepare(root, page, corpus, (caller) =>
    serveCorpusProcedures(caller, ["databank.listAttachments"], () => {
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    }),
  );
  await mount<typeof DatabankCompositionShellStory>(STORY, { documentId });
  const context = await openContext(page);
  await hold.requested;
  await expect(context.locator('[aria-busy="true"]')).toBeVisible();
  // The Everywhere toggle above the block stays standing while the junction read is out.
  await expect(context.getByText("Use in every chat", { exact: true })).toBeVisible();
  hold.fail();
  await expect(context.getByText("Couldn't load where this document is active.", { exact: true })).toBeVisible();
  await expect(context.getByText(/Nowhere yet/u)).toHaveCount(0);
  failing = false;
  await context.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(context.getByText("Couldn't load where this document is active.", { exact: true })).toHaveCount(0);
  await expect(context.getByText(/Nowhere yet/u)).toBeVisible();
});

test("a deleted document is the gone state in the context rail, not the error block", async ({ mount, page, corpus }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const documentId = await prepare(root, page, corpus, (caller) => serveCorpusProcedures(caller, ["databank.get"], () => trpcError({ code: "NOT_FOUND" })));
  await mount<typeof DatabankCompositionShellStory>(STORY, { documentId });
  const context = await openContext(page);
  await expect(context.getByText("Document not found", { exact: true })).toBeVisible();
  await expect(context.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
});

test("a held source text read shows the loading skeleton, a failed one the error block, and Retry shows the text", async ({ mount, page, corpus }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const hold = holdServed();
  let held = false;
  let failing = true;
  const documentId = await prepare(root, page, corpus, (caller) =>
    serveCorpusProcedures(caller, ["databank.get"], (input) => {
      if (input.includeText !== true) {
        return;
      }
      if (!held) {
        held = true;
        return hold;
      }
      return failing ? trpcError() : undefined;
    }),
  );
  await mount<typeof DatabankCompositionShellStory>(STORY, { documentId });
  const detail = page.locator('[data-slot="databank-detail-editor"]');
  await detail.getByRole("button", { name: DATABANK_VIEW_SOURCE_NAME, exact: true }).click();
  await hold.requested;
  await expect(detail.locator('[aria-busy="true"]')).toBeVisible();
  // The header stays standing: the source read has its own boundary.
  await expect(detail.getByRole("heading", { name: "Boundary notes", exact: true })).toBeVisible();
  hold.fail();
  await expect(detail.getByText("Couldn't load the source text.", { exact: true })).toBeVisible();
  failing = false;
  await detail.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(detail.getByText("Couldn't load the source text.", { exact: true })).toHaveCount(0);
  await expect(detail.getByText("The lantern illuminates the charts.", { exact: true })).toBeVisible();
});
