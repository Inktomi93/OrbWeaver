// @subject packages/client/src/features/discovery/components/corpus-browse-view.tsx
// Two characters can share a name in the corpus browse, so each row's name carries a place qualifier. At the default font setting a short
// name shares its line with the qualifier, and a long name is cut short while the qualifier stays whole.

import { createCharacterSchema } from "@orb/contracts/character";
import { resolvedLength, titleFit } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import { CORPUS_DISTILLED_CATALOG_NAME } from "#client/features/discovery/lib/corpus-control-names.ts";
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
  "discovery.characterFacets",
] as const;
const SAME_NAME_CHARACTERS = 2;
const SHORT_NAME = "Zephyr";
const LONG_NAME = "Zephyr of the northern lighthouse keepers' guild and the long vigil at the cottage through the storm season";
// The place qualifier is a short ordinal, so it stays beside the name at a docked side pane's width and at a narrow one.
const CASES = [
  { label: "short", name: SHORT_NAME, width: 373 },
  { label: "long", name: LONG_NAME, width: 373 },
  { label: "short", name: SHORT_NAME, width: 280 },
  { label: "long", name: LONG_NAME, width: 280 },
] as const;
const EXPECTED = {
  short: { qualifierBesideName: true, nameKeepsItsFloor: true, nameTruncated: false, qualifierWhole: true },
  long: { qualifierBesideName: true, nameKeepsItsFloor: true, nameTruncated: true, qualifierWhole: true },
} as const;

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 1200 } });

for (const { label, name, width } of CASES) {
  test(`a ${label} name in a ${String(width)}px pane keeps its floor and the place qualifier stays whole`, async ({ mount, page, corpus }) => {
    await using root = await createCorpusHarness(undefined, { startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    for (let copy = 0; copy < SAME_NAME_CHARACTERS; copy += 1) {
      await caller.character.create({ input: createCharacterSchema.parse({ handle: `title-floor-${String(copy)}`, name, description: "Keeps the light." }) });
    }
    await routeTrpc(page, { ...createShellAmbientReads(corpus, root.ownerId), ...serveCorpusProcedures(caller, SERVED) });
    await mount<typeof CorpusSearchControlsStory>(STORY, { query: "", targetId: "characters", width });

    const rows = page
      .getByRole("list", { name: CORPUS_DISTILLED_CATALOG_NAME, exact: true })
      .locator('[data-slot="list-row-root"]')
      .filter({ has: page.locator('[data-slot="list-row-title"]').getByText(name, { exact: true }) });
    await expect(rows).toHaveCount(SAME_NAME_CHARACTERS);
    const floor = await resolvedLength(page, `var(${TOKENS["width.title-floor"].cssVar})`, rows.first());
    for (const row of await rows.all()) {
      expect(await titleFit(row, floor)).toEqual(EXPECTED[label]);
    }
  });
}
