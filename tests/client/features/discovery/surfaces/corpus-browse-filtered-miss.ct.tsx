// @subject packages/client/src/features/discovery/components/corpus-browse-view.tsx
// A facet combination that matches no character shows the shared empty state with a way out: Clear filters resets the facets
// and the catalog's rows come back.

import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_CLEAR_FILTERS_NAME,
  CORPUS_DISTILLED_CATALOG_NAME,
  CORPUS_FILTERED_MISS_TEXT,
  CORPUS_PARAM_NAMES,
  corpusFacetOptionLabel,
} from "#client/features/discovery/lib/corpus-control-names.ts";
import { NO_MATCHES_TITLE } from "#client/lib/search-empty-names.ts";
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
] as const;
const CASTLE = "A feudal castle";
const LOOM = "An orbital loom";

// The story's list pane is not height-bounded the way the shell bounds it, so the window must be tall enough that the
// corpus catalog stays under VirtualList's three-viewport refusal.
test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 1200 } });

test("a facet that matches no character shows the empty state, and Clear filters brings the catalog back", async ({ mount, page, corpus }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const [first] = (await caller.discovery.browseCharacters({ limit: 1 })).items;
  if (first === undefined) {
    throw new Error("The corpus needs a character to browse");
  }
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    "discovery.characterFacets": () => ({
      genres: [],
      tones: [],
      settings: [
        { value: CASTLE, count: 1 },
        { value: LOOM, count: 0 },
      ],
    }),
    "discovery.browseCharacters": (input) => {
      const kept = input?.setting === LOOM ? [] : [{ ...first, setting: CASTLE }];
      return { items: kept, nextCursor: null, totalCount: kept.length };
    },
  });
  const component = await mount<typeof CorpusSearchControlsStory>(STORY, { query: "", targetId: "characters" });
  const catalog = component.getByRole("list", { name: CORPUS_DISTILLED_CATALOG_NAME, exact: true });
  await expect(catalog.getByText(first.name, { exact: true }).first()).toBeVisible();

  await component.getByRole("combobox", { name: CORPUS_PARAM_NAMES.setting, exact: true }).click();
  await page.getByRole("option", { name: corpusFacetOptionLabel(LOOM, 0), exact: true }).click();

  const empty = component.locator('[data-slot="empty-state-root"]');
  await expect(empty).toBeVisible();
  await expect(empty.locator('[data-slot="empty-state-title"]')).toHaveText(NO_MATCHES_TITLE);
  await expect(empty.locator('[data-slot="empty-state-description"]')).toHaveText(CORPUS_FILTERED_MISS_TEXT);
  await expect(catalog).toHaveCount(0);

  await empty.locator('[data-slot="empty-state-action"]').getByRole("button", { name: CORPUS_CLEAR_FILTERS_NAME, exact: true }).click();

  await expect(empty).toHaveCount(0);
  await expect(catalog.getByText(first.name, { exact: true }).first()).toBeVisible();
});
