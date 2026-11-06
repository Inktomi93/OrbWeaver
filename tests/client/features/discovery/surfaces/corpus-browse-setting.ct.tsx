// @subject packages/client/src/features/discovery/components/corpus-browse-view.tsx
// The catalog browse shows each card's distilled setting beside its genre and tone and filters on it the
// way genre and tone filter; a card with no setting reads as one with no genre.

import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
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

test.use({ hasTouch: false, isMobile: false });

test("the browse lists settings as a facet, shows them on the rows and narrows to the chosen one", async ({ mount, page, corpus }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const [first, second, third] = (await caller.discovery.browseCharacters({ limit: 200 })).items;
  if (first === undefined || second === undefined || third === undefined) {
    throw new Error("The corpus needs three characters to browse");
  }
  // A card with no pitch rests on its facet line, which is where genre and tone speak on the row.
  const rows = [
    { ...first, elevatorPitch: null, genre: "fantasy", tone: "gritty", setting: CASTLE },
    { ...second, elevatorPitch: null, genre: null, tone: null, setting: LOOM },
    { ...third, elevatorPitch: null, genre: null, tone: null, setting: null },
  ];
  const asked: (string | undefined)[] = [];
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, SERVED),
    "discovery.characterFacets": () => ({
      genres: [],
      tones: [],
      settings: [
        { value: CASTLE, count: 1 },
        { value: LOOM, count: 1 },
      ],
    }),
    "discovery.browseCharacters": (input) => {
      asked.push(input?.setting);
      const kept = rows.filter((row) => input?.setting === undefined || row.setting === input.setting);
      return { items: kept, nextCursor: null, totalCount: kept.length };
    },
  });
  const component = await mount<typeof CorpusSearchControlsStory>(STORY, { query: "", targetId: "characters" });
  const castleLine = component.getByText(`Fantasy · gritty · ${CASTLE}`, { exact: true });
  const loomLine = component.getByText(LOOM, { exact: true });
  await expect(castleLine).toBeVisible();
  await expect(loomLine).toBeVisible();
  // No genre, tone or setting: the same placeholder either way, with no stray separator.
  await expect(component.getByText("Not distilled", { exact: true })).toBeVisible();

  await component.getByRole("combobox", { name: "Setting", exact: true }).click();
  await page.getByRole("option", { name: `${CASTLE} (1)`, exact: true }).click();

  await expect(castleLine).toBeVisible();
  await expect(loomLine).toHaveCount(0);
  await expect(component.getByText("Not distilled", { exact: true })).toHaveCount(0);
  expect(asked.at(-1)).toBe(CASTLE);
});
