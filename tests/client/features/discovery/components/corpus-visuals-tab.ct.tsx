// CT: the Corpus "Visuals" tab speaks the portrait↔card fit in WORDS — Mean fit, Median fit and each
// worst-matched row — never as a bare percentage.

import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CorpusVisualsTabStory } from "../_ct-stories.tsx";

const NO_FACETS = {
  total: 0,
  captioned: 0,
  artStyles: [],
  palettes: [],
  moods: [],
  ratings: [],
  shotTypes: [],
  cameraAngles: [],
  genders: [],
  coverage: [],
  bodyTypes: [],
  chestSizes: [],
  skinTones: [],
  outfitTypes: [],
  clothingStates: [],
  nudityLevels: [],
  exposedParts: [],
  topTags: [],
} satisfies TrpcWireOutput<"discovery.imageFacets">;

const REPORT = {
  count: 2,
  mean: 0.32,
  median: 0.25,
  characters: [
    { characterId: "character_weak", name: "Weaver", avatarHash: null, alignment: 0.05, rating: null, artStyle: null },
    { characterId: "character_good", name: "Goodwin", avatarHash: null, alignment: 0.25, rating: null, artStyle: null },
  ],
} satisfies TrpcWireOutput<"discovery.portraitAlignment">;

test("portrait fit reads in words: Mean fit, Median fit and each worst-matched row", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.imageFacets": NO_FACETS, "discovery.portraitAlignment": REPORT });
  const component = await mount(<CorpusVisualsTabStory />);

  await expect(component.getByText("Mean fit").locator("xpath=..")).toContainText("Strong");
  await expect(component.getByText("Median fit").locator("xpath=..")).toContainText("Good");
  await expect(component.locator('[data-slot="list-row-root"]', { hasText: "Weaver" })).toContainText("Weak");
  await expect(component.locator('[data-slot="list-row-root"]', { hasText: "Goodwin" })).toContainText("Good");
  await expect(component.getByText("%")).toHaveCount(0);
});
