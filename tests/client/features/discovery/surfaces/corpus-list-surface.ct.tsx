// CT: the Corpus LIST navigator — the omnibox target dispatch + the browse facet filter. Drives the
// PRODUCTION path: `search.search` (routeTrpc, discriminated on the decoded `over` input) for the omnibox,
// and `characterFacets` + `browseCharacters` for the rest-state browse. Asserts: the Characters target
// renders a CharacterCardHit; switching to the Scenes target re-dispatches and renders the per-chat
// evidence preview (the J10 chat-search preview); and the browse catalog filter (the `q` param) narrows
// the rows client-visibly.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { CorpusListSurfaceStory } from "../_ct-stories";

const CHARACTER_HIT = {
  characterId: "char_aria",
  score: 0.42,
  name: "Aria Nightshade",
  avatarHash: null,
  genre: "fantasy",
  tone: "dark",
  elevatorPitch: "A rogue who reads the night market.",
};

const DISCOVER_HIT = {
  characterId: "char_aria",
  score: 0.31,
  name: "Aria Nightshade",
  avatarHash: null,
  genre: "fantasy",
  tone: "dark",
  elevatorPitch: "A rogue who reads the night market.",
  matchCount: 2,
  segments: [
    {
      chatId: "chat_market01",
      blockIdx: 3,
      snippet: "The night market hums with secrets.",
      score: 0.3,
    },
    { chatId: "chat_market01", blockIdx: 7, snippet: "She slips between the stalls.", score: 0.28 },
  ],
};

/** search.search — discriminate on the decoded `over` input so one responder serves every target. */
function searchResponder(input: unknown): unknown {
  const over = (input as { over?: string } | undefined)?.over;
  if (over === "characters") {
    return { over: "characters", hits: [CHARACTER_HIT] };
  }
  if (over === "discover") {
    return { over: "discover", hits: [DISCOVER_HIT] };
  }
  return { over: over ?? "characters", hits: [] };
}

const ARIA_ROW = {
  characterId: "char_aria",
  name: "Aria Nightshade",
  genre: "fantasy",
  tone: "dark",
  setting: null,
  tags: [],
  elevatorPitch: "A rogue.",
  avatarHash: null,
  createdAt: 2000,
};
const BOLT_ROW = { ...ARIA_ROW, characterId: "char_bolt", name: "Bolt", elevatorPitch: "A hound." };

const EMPTY_CATALOG = { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 0 };

test("the Characters target renders a character card hit", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": [],
    "search.suggest": [],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceStory />);

  await component.getByLabel("Search your corpus").fill("aria");
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("A rogue who reads the night market.")).toBeVisible();
});

test("switching to the Scenes target renders the per-chat evidence preview", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": [],
    "search.suggest": [],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceStory />);

  await component.getByRole("button", { name: "Search Scenes" }).click();
  await component.getByLabel("Search your corpus").fill("market");

  // The discover branch previews the matching chat moments (the J10 chat-search preview).
  await expect(component.getByText("2 matching moments")).toBeVisible();
  await expect(component.getByText("The night market hums with secrets.")).toBeVisible();
  await expect(component.getByText("She slips between the stalls.")).toBeVisible();
});

test("the browse catalog filter narrows the rows by the q param", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": (input: unknown) => {
      const q = (input as { q?: string } | undefined)?.q;
      const all = [ARIA_ROW, BOLT_ROW];
      return q === undefined
        ? all
        : all.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()));
    },
    "search.suggest": [],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceStory />);

  // Rest state = browse; both rows visible.
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();

  await component.getByRole("textbox", { name: "Filter the catalog" }).fill("bolt");
  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(component.getByText("Aria Nightshade")).toHaveCount(0);
});

test("the Text target runs the lexical fields search and names the hits from the card list", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": [],
    "search.suggest": [],
    // fields returns bare id+score; the picker names it against character.list.
    "search.fields": [{ characterId: "char_zed", score: 3.2 }],
    "character.list": {
      items: [{ id: "char_zed", name: "Zed the Lexeme", avatarHash: null }],
      nextCursor: null,
    },
  });
  const component = await mount(<CorpusListSurfaceStory />);

  await component.getByRole("button", { name: "Search Text" }).click();
  await component.getByLabel("Search your corpus").fill("lexeme");
  await expect(component.getByText("Zed the Lexeme")).toBeVisible();
});

test("the omnibox surfaces as-you-type suggestions from search.suggest", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": [],
    "search.suggest": [
      { suggestion: "night market", score: 0.9 },
      { suggestion: "nightshade", score: 0.8 },
    ],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceStory />);

  await component.getByLabel("Search your corpus").fill("night");
  // The typeahead popup renders the server suggestions (portaled — query via page).
  await expect(page.getByRole("option", { name: "night market" })).toBeVisible();
  await expect(page.getByRole("option", { name: "nightshade" })).toBeVisible();
});
