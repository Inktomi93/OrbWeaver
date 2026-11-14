// @subject packages/client/src/features/discovery/components/corpus-results-list.tsx
// The Corpus search results at the browser's enlarged text on a phone: the status line, the coverage note and the nearest-only banner
// grow, and the results scroller keeps a window a touch can reach, instead of collapsing to no height under them.

import type { ShellAmbientStory } from "@orb/testkit/browser";
import { PLATFORM_TEXT_SCALES, resolvedLength, seedShellState, setPlatformTextSize } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/test";
import { CORPUS_SEARCH_NAME, CORPUS_SEARCH_TARGET_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";
import { CORPUS_SEARCH_TARGETS } from "#client/features/discovery/lib/corpus-search-targets.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const PHONE = { width: 390, height: 844 } as const;
const FINDER_PROCEDURES = [
  "search.suggest",
  "search.spaceStatus",
  "search.search",
  "connection.list",
  "connection.listBindings",
  "workloads.list",
  "discovery.browseCharacters",
  "discovery.characterFacets",
  "discovery.catalog",
] as const;
const SCENES_TARGET = CORPUS_SEARCH_TARGETS.find((target) => target.kind === "unified" && target.over === "discover");
// A phrase no card or scene holds, so the engine answers its nearest rows and the pane adds its nearest-only banner above them.
const UNMATCHED_QUERY = "zzqqxwvfoobarbaz";

test.use({ hasTouch: true, isMobile: true, viewport: PHONE });

for (const scale of PLATFORM_TEXT_SCALES) {
  test(`the search results keep a window and a row in reach at ${String(scale * 100)}% text on a phone`, async ({ mount, page }) => {
    if (SCENES_TARGET === undefined) {
      throw new Error("The Corpus search has no Scenes target");
    }
    await using _textSize = await setPlatformTextSize(page, scale);
    const wire = createCorpusProviderExecution({
      modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
      embedding: () => CORPUS_EMBEDDING_VECTOR,
      chatText: "unused",
      structuredReplies: CORPUS_STRUCTURED_REPLIES,
      images: [],
    });
    await using root = await createCorpusHarness(undefined, { providerFetch: async (input, init) => await wire.execute(new Request(input, init)) });
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, ...FINDER_PROCEDURES]));
    await seedShellState(page, { activeSection: "corpus", panelOverrides: { corpus: { list: "docked", context: "collapsed" } } });
    await mount<typeof ShellAmbientStory>(STORY, {});
    await page.getByRole("combobox", { name: CORPUS_SEARCH_TARGET_NAME, exact: true }).click();
    await page.getByRole("option", { name: SCENES_TARGET.label, exact: true }).click();
    await page.getByRole("combobox", { name: CORPUS_SEARCH_NAME, exact: true }).fill(UNMATCHED_QUERY);
    const results = page.getByRole("list", { name: `Search results: ${SCENES_TARGET.label}`, exact: true });
    await expect(results).toBeVisible();
    await expect(results.getByRole("listitem").first()).toBeVisible();
    const floor = await resolvedLength(page, `var(${TOKENS["height.scroll-short"].cssVar})`, results);
    expect((await results.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(floor);
  });
}
