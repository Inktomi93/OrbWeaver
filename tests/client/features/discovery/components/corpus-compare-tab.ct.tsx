// CT: the Corpus CONTEXT "Compare" tab — the two-select → facet-diff → deep-compare flow. Drives the
// PRODUCTION path: `browseCharacters` fills the pickers; `compareCharacters` renders once two DIFFERENT
// characters are picked; the "Deep compare" primary adds `compareCharactersDeep`'s narrative. Asserts the
// diff surfaces the shared/only tags and that Deep compare renders the grounded summary.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CorpusCompareTabStory } from "../_ct-stories.tsx";

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

/** `browseCharacters` answers a keyset PAGE since A8 (`{items, nextCursor, totalCount}`); this tab reads
 *  one page to fill its two pickers. */
const CATALOG_PAGE = { items: CATALOG, nextCursor: null, totalCount: CATALOG.length };

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

/** Pick Aria + Bolt in the two Selects. The options portal renders OUTSIDE the mount root → query via `page`.
 *  Between the two picks, wait for the first portal to fully unmount: opening the second while the first's
 *  focus-return/close animation is in flight intermittently closes it (the "element is not stable" flake). */
async function pickThePair(component: Locator, page: Page): Promise<void> {
  await component.getByRole("combobox", { name: "First character" }).click();
  await page.getByRole("option", { name: "Aria" }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(component.getByRole("combobox", { name: "First character" })).toContainText("Aria");
  await component.getByRole("combobox", { name: "Second character" }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.getByRole("option", { name: "Bolt" }).click();
}

test("picking two characters renders the facet diff; deep compare adds the narrative", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.browseCharacters": CATALOG_PAGE,
    "discovery.compareCharacters": COMPARISON,
    "discovery.compareCharactersDeep": {
      ...COMPARISON,
      narrative: {
        summary: "Two fantasy rogues split on mood.",
        overlap: "Both work the shadows.",
        distinction: "Aria broods; Bolt bounds.",
        degraded: false,
      },
    },
  });
  const component = await mount(<CorpusCompareTabStory />);
  await pickThePair(component, page);

  // The no-LLM facet diff renders the shared + only tags.
  await expect(component.getByText("rogue")).toBeVisible();
  await expect(component.getByText("mage")).toBeVisible();
  await expect(component.getByText("warrior")).toBeVisible();

  // The one primary — Deep compare — adds the grounded narrative, with both halves of the structured payload.
  await component.getByRole("button", { name: "Deep compare" }).click();
  await expect(component.getByText("Two fantasy rogues split on mood.")).toBeVisible();
  await expect(component.getByText("Both work the shadows.")).toBeVisible();
  // A VALIDATED narrative carries no degrade marker — the absence is what tells the two states apart.
  await expect(component.getByTestId("corpus-compare-deep-degraded")).toHaveCount(0);
});

test("a DEGRADED narrative is labelled as the model's raw reply, not rendered as a comparison", async ({ mount, page }) => {
  // The server's degrade arm: the model ignored the payload schema twice, so `summary` is its raw text and
  // overlap/distinction are empty. Rendering that as a narrative shows unparsed output beside two blank
  // sections — indistinguishable from a real comparison, which is the whole reason `degraded` travels as data.
  await routeTrpc(page, {
    "discovery.browseCharacters": CATALOG_PAGE,
    "discovery.compareCharacters": COMPARISON,
    "discovery.compareCharactersDeep": {
      ...COMPARISON,
      narrative: { summary: "Sure! Here's my take: they're both cool.", overlap: "", distinction: "", degraded: true },
    },
  });
  const component = await mount(<CorpusCompareTabStory />);
  await pickThePair(component, page);
  await component.getByRole("button", { name: "Deep compare" }).click();

  // Barrier on the SETTLED degraded arm (the query has resolved and painted), never an in-flight state.
  const degraded = component.getByTestId("corpus-compare-deep-degraded");
  await expect(degraded).toBeVisible();
  // The user is TOLD what they're looking at, and the raw text is still shown (it may be useful).
  await expect(degraded).toContainText("Unstructured reply");
  await expect(degraded).toContainText("raw answer");
  await expect(degraded).toContainText("Sure! Here's my take: they're both cool.");
  // The two empty structured sections are GONE — a blank "Overlap" body reads as "the model found none".
  await expect(component.getByText("Overlap", { exact: true })).toHaveCount(0);
  await expect(component.getByText("Distinction", { exact: true })).toHaveCount(0);
});
