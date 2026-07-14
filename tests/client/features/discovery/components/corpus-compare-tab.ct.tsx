// CT: the Corpus CONTEXT "Compare" tab — the two-select → facet-diff → deep-compare flow. Drives the
// PRODUCTION path: `browseCharacters` fills the pickers; `compareCharacters` renders once two DIFFERENT
// characters are picked; the "Deep compare" primary adds `compareCharactersDeep`'s narrative. Asserts the
// diff surfaces the shared/only tags and that Deep compare renders the grounded summary.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { CorpusCompareTabStory } from "../_ct-stories";

const CATALOG = [
  {
    characterId: "char_aria",
    name: "Aria",
    genre: "fantasy",
    tone: "dark",
    setting: null,
    tags: [],
    elevatorPitch: null,
    avatarHash: null,
    createdAt: 2000,
  },
  {
    characterId: "char_bolt",
    name: "Bolt",
    genre: "fantasy",
    tone: "bright",
    setting: null,
    tags: [],
    elevatorPitch: null,
    avatarHash: null,
    createdAt: 1000,
  },
];

const COMPARISON = {
  a: { characterId: "char_aria", name: "Aria", genre: "fantasy", tone: "dark", pitch: null },
  b: { characterId: "char_bolt", name: "Bolt", genre: "fantasy", tone: "bright", pitch: null },
  sameGenre: true,
  sameTone: false,
  sharedTags: ["rogue"],
  onlyA: ["mage"],
  onlyB: ["warrior"],
  redundancy: 0.5,
};

test("picking two characters renders the facet diff; deep compare adds the narrative", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "discovery.browseCharacters": CATALOG,
    "discovery.compareCharacters": COMPARISON,
    "discovery.compareCharactersDeep": {
      ...COMPARISON,
      narrative: {
        summary: "Two fantasy rogues split on mood.",
        overlap: "Both work the shadows.",
        distinction: "Aria broods; Bolt bounds.",
      },
    },
  });
  const component = await mount(<CorpusCompareTabStory />);

  // Pick the pair (the Select options portal outside the mount root → query via page). Between the two
  // picks, wait for the first portal to fully unmount — opening the second while the first's focus-return/
  // close animation is in flight intermittently closes it (the "element is not stable" flake).
  await component.getByRole("combobox", { name: "First character" }).click();
  await page.getByRole("option", { name: "Aria" }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(component.getByRole("combobox", { name: "First character" })).toContainText("Aria");
  await component.getByRole("combobox", { name: "Second character" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("option", { name: "Bolt" }).click();

  // The no-LLM facet diff renders the shared + only tags.
  await expect(component.getByText("rogue")).toBeVisible();
  await expect(component.getByText("mage")).toBeVisible();
  await expect(component.getByText("warrior")).toBeVisible();

  // The one primary — Deep compare — adds the grounded narrative.
  await component.getByRole("button", { name: "Deep compare" }).click();
  await expect(component.getByText("Two fantasy rogues split on mood.")).toBeVisible();
});
