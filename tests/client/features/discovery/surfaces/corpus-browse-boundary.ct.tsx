// @subject packages/client/src/features/discovery/components/corpus-browse-view.tsx
// The catalog browse reads its filter facets through the shared boundary: settled, it lists the library's characters under the
// filters; a held facet read shows the row skeleton, a failed one the shared error block, and Retry shows the filters and the list.

import { createShellAmbientReads, heldThenFailing, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { queryFailedLabel } from "#client/data/query-state-copy.ts";
import { CORPUS_DISTILLED_CATALOG_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { CorpusSearchControlsStory } from "./_search-controls-stories.tsx";

const STORY = "tests/client/features/discovery/surfaces/_search-controls-stories/CorpusSearchControlsStory";
const SERVED = [
  "sessions.me",
  "connection.list",
  "connection.listBindings",
  "search.suggest",
  "search.spaceStatus",
  "workloads.list",
  "discovery.catalog",
  "discovery.browseCharacters",
] as const;
const FACETS = "discovery.characterFacets";
const FAILED = queryFailedLabel("your catalog filters");
const BROWSE = { query: "", targetId: "characters" } as const;

// The story's list pane is not height-bounded the way the shell bounds it, so the window must be tall enough that the
// corpus catalog stays under VirtualList's three-viewport refusal.
test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 1200 } });

test("the settled browse lists the library's first character under its filters", async ({ mount, page, corpus }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const [first] = (await caller.discovery.browseCharacters({ limit: 1 })).items;
  if (first === undefined) {
    throw new Error("The corpus must contain a character to browse");
  }
  await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, [...SERVED, FACETS]) });
  await mount<typeof CorpusSearchControlsStory>(STORY, BROWSE);
  await expect(page.getByRole("combobox", { name: "Sort", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: CORPUS_DISTILLED_CATALOG_NAME, exact: true }).getByText(first.name, { exact: true }).first()).toBeVisible();
});

test("a held facet read shows the row skeleton, a failed one the error block, and Retry shows the filters and the list", async ({ mount, page, corpus }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const [first] = (await caller.discovery.browseCharacters({ limit: 1 })).items;
  if (first === undefined) {
    throw new Error("The corpus must contain a character to browse");
  }
  const read = heldThenFailing();
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    ...serveCorpusProcedures(caller, [FACETS], read.intercept),
  });
  await mount<typeof CorpusSearchControlsStory>(STORY, BROWSE);
  await read.hold.requested;
  await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
  read.hold.fail();
  await expect(page.getByText(FAILED, { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sort", exact: true })).toHaveCount(0);
  read.recover();
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Sort", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: CORPUS_DISTILLED_CATALOG_NAME, exact: true }).getByText(first.name, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(FAILED, { exact: true })).toHaveCount(0);
});
