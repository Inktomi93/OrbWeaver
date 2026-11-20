// @subject packages/client/src/features/discovery/components/corpus-controls.tsx
// The corpus finder (the Corpus LIST pane on its Characters target) on a phone: its facet selects and its result list stay inside the
// pane at the browser's enlarged text, so the pane never scrolls sideways and no block hides the end of a result.

import type { ShellAmbientStory } from "@orb/testkit/browser";
import { LAYOUT_SUBPIXEL_PX, PLATFORM_TEXT_SCALES, seedShellState, setPlatformTextSize, sidewaysReach } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { expect, test } from "@playwright/test";
import { CORPUS_PARAM_NAMES, CORPUS_SEARCH_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
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
const PHONE = { width: 390, height: 844 } as const;
// A phrase no card holds, so the Characters search answers its nearest rows.
const SEARCH_QUERY = "zzqqxwvfoobarbaz";
// The two states of the Characters target: resting on the distilled catalog, and showing the hits of a typed query.
const STATES = [
  { label: "rest on the catalog", query: "" },
  { label: "a search's results", query: SEARCH_QUERY },
] as const;

test.use({ viewport: PHONE, hasTouch: true, isMobile: true });

for (const scale of PLATFORM_TEXT_SCALES) {
  for (const { label, query } of STATES) {
    test(`the Characters target's ${label} stays inside its pane at ${String(scale * 100)}% text on a phone`, async ({ mount, page }) => {
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

      const pane = page.locator('[data-list-page="bounded"]');
      await expect(pane).toBeVisible();
      await pane.getByRole("combobox", { name: CORPUS_SEARCH_NAME, exact: true }).fill(query);
      // The pane is measured once its own list is up, not while the read is still a skeleton.
      await expect(query === "" ? pane.getByRole("combobox", { name: CORPUS_PARAM_NAMES.setting, exact: true }) : pane.getByRole("list").first()).toBeVisible();
      const reach = await pane.evaluate(sidewaysReach);
      expect(reach.wideners).toEqual([]);
      expect(reach.scrolls).toBeLessThanOrEqual(LAYOUT_SUBPIXEL_PX);
    });
  }
}
