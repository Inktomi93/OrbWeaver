// @subject packages/client/src/features/discovery/components/corpus-browse-view.tsx
// The catalog browse shows each card's distilled setting beside its genre and tone and filters on it the
// way genre and tone filter; a card with no setting reads as one with no genre.

import { createShellAmbientReads, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import { characterFacetLine } from "#client/features/discovery/lib/character-facet.ts";
import { CORPUS_NOT_DISTILLED_TEXT, CORPUS_PARAM_NAMES, corpusFacetOptionLabel } from "#client/features/discovery/lib/corpus-control-names.ts";
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
  const castleLine = component.getByText(characterFacetLine("fantasy", "gritty", CASTLE), { exact: true });
  const loomLine = component.getByText(LOOM, { exact: true });
  await expect(castleLine).toBeVisible();
  await expect(loomLine).toBeVisible();
  // No genre, tone or setting: the same placeholder either way, with no stray separator.
  await expect(component.getByText(CORPUS_NOT_DISTILLED_TEXT, { exact: true })).toBeVisible();
  // The line is text inside a whole-row button, so it reads at the label step, not the micro gloss.
  const [lineSize, labelSize] = await component.getByText(CORPUS_NOT_DISTILLED_TEXT, { exact: true }).evaluate((node, labelVar) => {
    const probe = document.createElement("span");
    probe.style.fontSize = `var(${labelVar})`;
    node.append(probe);
    const label = getComputedStyle(probe).fontSize;
    probe.remove();
    return [getComputedStyle(node).fontSize, label];
  }, TOKENS["text.label"].cssVar);
  expect(lineSize).toBe(labelSize);
  // A facet with nothing but its "All" entry is disabled and points at the visible line that says why; one with choices stays live.
  const genreSelect = component.getByRole("combobox", { name: CORPUS_PARAM_NAMES.genre, exact: true });
  await expect(genreSelect).toBeDisabled();
  await expect(component.getByRole("combobox", { name: CORPUS_PARAM_NAMES.setting, exact: true })).toBeEnabled();
  const reasonId = await genreSelect.getAttribute("aria-describedby");
  expect(reasonId).not.toBeNull();
  await expect(component.locator(`[id="${reasonId}"]`)).toBeVisible();

  await component.getByRole("combobox", { name: CORPUS_PARAM_NAMES.setting, exact: true }).click();
  await page.getByRole("option", { name: corpusFacetOptionLabel(CASTLE, 1), exact: true }).click();

  await expect(castleLine).toBeVisible();
  await expect(loomLine).toHaveCount(0);
  await expect(component.getByText(CORPUS_NOT_DISTILLED_TEXT, { exact: true })).toHaveCount(0);
  await expect.poll(() => asked).toContain(CASTLE);
});
