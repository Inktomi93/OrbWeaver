// CT: the Corpus LIST navigator — the omnibox target dispatch + the browse facet filter. Drives the
// PRODUCTION path: `search.search` (routeTrpc, discriminated on the decoded `over` input) for the omnibox,
// and `characterFacets` + `browseCharacters` for the rest-state browse. Asserts: the Characters target
// renders a CharacterCardHit; switching to the Scenes target re-dispatches and renders the per-chat
// evidence preview (the J10 chat-search preview); and the browse catalog filter (the `q` param) narrows
// the rows client-visibly.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import type { TrpcFixtureOutput, TrpcInput, TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CorpusListSurfaceRailBounceStory, CorpusListSurfaceStory, CorpusListSurfaceWidthStory, CorpusSectionArrivalStory } from "../_ct-stories.tsx";

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
function searchResponder(input: TrpcInput<"search.search">): TrpcFixtureOutput<"search.search"> {
  const over = input?.over;
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

/** `browseCharacters` is KEYSET-PAGED (A8) — one page, its boundary, and the census of the whole scope. */
function browsePage(
  rows: readonly (typeof ARIA_ROW)[],
  nextCursor: TrpcWireOutput<"discovery.browseCharacters">["nextCursor"],
  totalCount = rows.length,
): TrpcFixtureOutput<"discovery.browseCharacters"> {
  return { items: rows, nextCursor, totalCount };
}
const EMPTY_BROWSE: TrpcFixtureOutput<"discovery.browseCharacters"> = browsePage([], null, 0);

const EMPTY_CATALOG = { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 0 };

test("the Characters target renders a character card hit", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": EMPTY_BROWSE,
    "search.suggest": [],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceStory />);

  await component.getByLabel("Search your corpus").fill("aria");
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("A rogue who reads the night market.")).toBeVisible();
});

test("switching to the Scenes target renders the per-chat evidence preview", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": EMPTY_BROWSE,
    "search.suggest": [],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceStory />);

  await component.getByRole("button", { name: "Search Scenes" }).click();
  await component.getByLabel("Search your corpus").fill("market");

  // The discover branch previews the matching chat moments (the J10 chat-search preview).
  // The scent line says what EXISTS and what is under it (C3) — here the preview is complete, so it is
  // "in N rooms" rather than a promise the list below cannot keep.
  await expect(component.getByText("2 matching moments in 1 room")).toBeVisible();
  await expect(component.getByText("The night market hums with secrets.")).toBeVisible();
  await expect(component.getByText("She slips between the stalls.")).toBeVisible();
});

// ── ONE SEARCH INPUT IN THIS PANE (side-eye P2) ──────────────────────────────────────────────────────
// The browse view used to carry its OWN free-text box ("Filter the catalog", a substring `q`) four rows
// under the omnibox — two inputs, both narrowing the same list, whose difference (substring vs semantic) is
// invisible to the person typing. The omnibox is the truer home and the only one left; the browse view
// keeps the FACET selects. This replaces the CT that pinned the deleted filter's `q` param.
test("the pane offers exactly ONE free-text search — the omnibox; the browse view is facets only", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": browsePage([ARIA_ROW, BOLT_ROW], null),
    "search.suggest": [],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceStory />);

  // Rest state = browse; the catalog rows are there …
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();

  // … and the pane's ONLY text input is the omnibox. The count is the assertion: a second box reappearing
  // anywhere in this pane is the defect, whatever it is called.
  await expect(component.getByRole("textbox", { name: "Filter the catalog" })).toHaveCount(0);
  await expect(component.getByRole("combobox", { name: "Search your corpus" })).toBeVisible();
  // Counted by the thing a person recognises as "a place to type": an input carrying a PLACEHOLDER. The
  // facet Selects each render their own native input for form participation, so a bare `input` count reads
  // 6 and proves nothing.
  await expect(component.locator("input[placeholder]:not([placeholder=''])")).toHaveCount(1);
});

test("the Text target runs the lexical fields search and names the hits from the card list", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": EMPTY_BROWSE,
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

// ── U1: THE SEARCH IS A PLACE YOU CAN STAY ───────────────────────────────────────────────────────────
// The single defect behind the owner's "search and select a result is SUPER useful… not": `query` and
// `targetId` were component `useState` on a surface the shell UNMOUNTS on a rail switch, so opening a hit's
// room and coming back landed on an empty box with the target reset to Characters — while the dossier
// selection beside it survived the identical bounce, because that one is a store. This pin bounces the rail
// and reads the three things a returning user expects back: the words, the target, the answers.
test("a rail bounce restores the omnibox: the query, the target, and the results", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": EMPTY_BROWSE,
    "search.suggest": [],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceRailBounceStory />);

  await component.getByRole("button", { name: "Search Scenes" }).click();
  await component.getByRole("combobox", { name: "Search your corpus" }).fill("market");
  await expect(component.getByText("2 matching moments in 1 room")).toBeVisible();

  // Away (the shell unmounts the surface) …
  await component.getByRole("button", { name: "Leave Corpus" }).click();
  await expect(component.getByRole("combobox", { name: "Search your corpus" })).toHaveCount(0);
  // … and back.
  await component.getByRole("button", { name: "Back to Corpus" }).click();

  await expect(component.getByRole("combobox", { name: "Search your corpus" })).toHaveValue("market");
  await expect(component.getByRole("button", { name: "Search Scenes" })).toHaveAttribute("aria-pressed", "true");
  await expect(component.getByText("2 matching moments in 1 room")).toBeVisible();
});

// ── §5 TASTE: THE TARGET PICKER IS A FIT PROBLEM ─────────────────────────────────────────────────────
// Five content-sized cells in a wrapping flex row missed row one by ~2px: "Memories" dropped to a second
// line, leaving a hole beside "Scenes" and a ragged right edge on the first thing the pane renders (mobile
// wrapped 4+1). The fix is unconditional track sizing — a 6-track grid, 2-track cells on row one and
// 3-track cells on row two — so BOTH rows end flush at every width. Asserted at both ends of the real pane
// range, because a point measurement cannot prove a range property.
const PICKER_CELL_NAME = /^Search (Characters|Scenes|Memories|Images|Text)$/;

async function pickerCellBoxes(component: Locator): Promise<{ x: number; right: number; y: number }[]> {
  const cells = component.getByRole("button", { name: PICKER_CELL_NAME });
  await expect(cells).toHaveCount(5);
  const boxes = await cells.all();
  return Promise.all(
    boxes.map(async (cell) => {
      const box = await cell.boundingBox();
      if (box === null) {
        throw new Error("a target-picker cell did not render a box");
      }
      return { x: Math.round(box.x), right: Math.round(box.x + box.width), y: Math.round(box.y) };
    }),
  );
}

for (const width of [320, 360]) {
  test(`the target picker fills both of its rows at ${width}px — no hole, no ragged edge`, async ({ mount, page }) => {
    await routeTrpc(page, {
      "discovery.characterFacets": { genres: [], tones: [] },
      "discovery.catalog": EMPTY_CATALOG,
      "discovery.browseCharacters": EMPTY_BROWSE,
      "search.suggest": [],
      "search.search": searchResponder,
    });
    const component = await mount(<CorpusListSurfaceWidthStory width={width} />);

    const cells = await pickerCellBoxes(component);
    const rows = [...new Set(cells.map((cell) => cell.y))].sort((a, b) => a - b);
    expect(rows, "the picker is exactly two deliberate rows").toHaveLength(2);
    const first = cells.filter((cell) => cell.y === rows[0]);
    const second = cells.filter((cell) => cell.y === rows[1]);
    expect(first, "row one carries three targets").toHaveLength(3);
    expect(second, "row two carries the remaining two").toHaveLength(2);
    // BOTH rows start at the same left edge and END AT THE SAME RIGHT EDGE — that is what "no 99px hole
    // beside Scenes, no ragged right" means in geometry rather than in taste.
    expect(second.at(0)?.x).toBe(first.at(0)?.x);
    expect(second.at(-1)?.right).toBe(first.at(-1)?.right);
  });
}

// ── B4: THE TYPEAHEAD SHOWS WHAT ITS BOX CAN HOLD, AND ONLY REAL PHRASES ─────────────────────────────
// Measured on the live surface: `scrollHeight 210` vs `clientHeight 158` — two of six options cut with no
// visible scrollbar — with `"elf elf<"` (a torn tokenizer fragment) and the query already in the box among
// them. The shared inline list is deliberately a fixed ~4-row scroller that may not grow this pane, so the
// caller must not overfill it.
test("the typeahead renders only clean, non-echo suggestions — and never overflows its own box", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": EMPTY_BROWSE,
    "search.suggest": [
      { suggestion: "elf elf<", score: 0.99 },
      { suggestion: "elf", score: 0.95 },
      { suggestion: "elven ranger", score: 0.9 },
      { suggestion: "elf queen", score: 0.85 },
      { suggestion: "elfstone keep", score: 0.8 },
      { suggestion: "elven court", score: 0.75 },
      { suggestion: "**elf**", score: 0.7 },
      { suggestion: "elf market", score: 0.65 },
    ],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceWidthStory width={360} />);

  await component.getByRole("combobox", { name: "Search your corpus" }).fill("elf");
  await expect(page.getByRole("option", { name: "elven ranger" })).toBeVisible();

  // The tokenizer junk and the verbatim query are gone; what is left fits the box.
  await expect(page.getByRole("option", { name: "elf elf<" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "**elf**" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "elf", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option")).toHaveCount(4);

  const list = page.locator('[data-slot="autocomplete-inline-list"]');
  const fit = await list.evaluate((node) => ({ scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }));
  expect(fit.scrollHeight, `the suggestion list must fit its own box (${JSON.stringify(fit)})`).toBeLessThanOrEqual(fit.clientHeight);
});

// ── A6 + B3: THE RESULT LIST IS A REAL LIST, AND IT COUNTS ITSELF ────────────────────────────────────
// `role="list"` with non-`listitem` children makes every row generic to AT and the list announce empty
// (axe `aria-required-children`, score 0). And the only live region on this surface was the typeahead's,
// which counts SUGGESTIONS — a screen reader heard "2 results" over twenty rendered hits.
test("the result list owns listitem children and announces the REAL hit count", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": EMPTY_BROWSE,
    "search.suggest": [{ suggestion: "aria nightshade", score: 0.9 }],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceStory />);

  await component.getByRole("combobox", { name: "Search your corpus" }).fill("aria");
  // Barrier on the ROW, not on the name: the typeahead is populated here and its option carries the same
  // words, so a bare text query resolves to two nodes.
  await expect(component.getByRole("button", { name: "Aria Nightshade" })).toBeVisible();

  const list = component.getByRole("list", { name: "Search results — Characters" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  // The typeahead's own status counts what it is: suggestions. The RESULTS status counts hits.
  await expect(component.getByRole("status").filter({ hasText: "1 result in Characters" })).toBeVisible();
  await expect(page.locator('[data-slot="autocomplete-status"]')).toHaveText("1 suggestion");
});

// ── A8 + C5: EVERY DISTILLED CARD IS REACHABLE, AND THE DOM IS NOT ───────────────────────────────────
// The two halves of the same defect. The header above this pane prints the catalog census (313 on the
// audited library) while the list stopped at the verb's silent 200-row ceiling with no load-more, AND those
// 200 rows all lived in the DOM at once (`region:list count 21, maxMs 99`, inside the 654ms mount frame).
// The fix is one shape: a keyset page walked by `createCollectionSurface`, rendered through `VirtualList`.
// This mounts a two-page catalog and reads both facts off the rendered list.
const CATALOG_TOTAL = 60;
const PAGE_SIZE = 30;
/** `Card 01 … Card 60` — distinct, sortable names so a page boundary is visible in the assertions. */
function catalogRow(index: number): typeof ARIA_ROW {
  const n = String(index + 1).padStart(2, "0");
  return { ...ARIA_ROW, characterId: `char_${n}`, name: `Card ${n}`, elevatorPitch: `Pitch ${n}` };
}
const PAGE_ONE = Array.from({ length: PAGE_SIZE }, (_, i) => catalogRow(i));
const PAGE_TWO = Array.from({ length: CATALOG_TOTAL - PAGE_SIZE }, (_, i) => catalogRow(i + PAGE_SIZE));
const TAIL_CURSOR: NonNullable<TrpcWireOutput<"discovery.browseCharacters">["nextCursor"]> = {
  sort: "recent",
  createdAt: 2000,
  characterId: "char_30",
};
/** The first catalog row's own name — the button the role chain has to reach. */
const FIRST_CARD = /Card 01/u;

/** Serves page two only when the request CARRIES the cursor the first page handed back — so a client that
 *  never follows the boundary reads exactly the truncated list A8 is about. */
function browseResponder(input: TrpcInput<"discovery.browseCharacters">): TrpcFixtureOutput<"discovery.browseCharacters"> {
  const cursor = input?.cursor;
  return cursor === undefined || cursor === null ? browsePage(PAGE_ONE, TAIL_CURSOR, CATALOG_TOTAL) : browsePage(PAGE_TWO, null, CATALOG_TOTAL);
}

test("the browse list reaches the LAST card in the catalog — the tail pages itself in (A8)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": { ...EMPTY_CATALOG, totalDistilled: CATALOG_TOTAL },
    "discovery.browseCharacters": browseResponder,
    "search.suggest": [],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceStory />);

  const list = component.getByRole("list", { name: "Distilled catalog" });
  await expect(list.getByRole("listitem").first()).toBeVisible();

  // Scroll to the end REPEATEDLY: each pass drives the window to the current tail, the tail-fetch appends
  // the next page, and the list grows under it — which is exactly how a person reaches the bottom of a
  // paged list, and why one jump to `scrollHeight` only ever reaches the end of what is already loaded.
  // `Card 60` is the row the old 200-ceiling made unreachable at all.
  await expect
    .poll(
      async () => {
        await list.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        return await component.getByText("Card 60").count();
      },
      { message: "the catalog's last row never became reachable — the tail page did not load" },
    )
    .toBeGreaterThan(0);
});

test("…and the list is WINDOWED: sixty rows, a bounded DOM (C5)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": { ...EMPTY_CATALOG, totalDistilled: CATALOG_TOTAL },
    "discovery.browseCharacters": browseResponder,
    "search.suggest": [],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceStory />);

  const list = component.getByRole("list", { name: "Distilled catalog" });
  await expect(list.getByRole("listitem").first()).toBeVisible();
  // The rendered count is the WINDOW, not the page: an unvirtualized list of the same data renders all 30
  // of page one immediately (and 60 after the tail fetch). The 640px story pane holds ~11 rows at the 60px
  // estimate; the bound is generous so a row-height change cannot make this flap, and it still fails
  // outright the moment the list stops windowing.
  const rendered = list.getByRole("listitem");
  await expect.poll(async () => await rendered.count()).toBeGreaterThan(0);
  await expect
    .poll(async () => await rendered.count(), { message: "the catalog rendered every loaded row — a windowed list renders its viewport" })
    .toBeLessThan(PAGE_SIZE);

  // A6 SURVIVES THE MECHANISM CHANGE: the role chain is `VirtualList`'s own now (it emits role=list on the
  // scroller and role=listitem + setsize/posinset on every measured row shell), not a hand-wrapped Stack.
  await expect(list.getByRole("listitem").first().getByRole("button", { name: FIRST_CARD })).toBeVisible();
});

// ── C7: ARRIVING PUTS YOU IN THE SEARCH BOX ──────────────────────────────────────────────────────────
// Focus used to land on the surface ROOT — a `tabIndex={-1}` div that announces nothing — so the pane's own
// control was one more Tab away than it looked (the audited keyboard walk put the omnibox at stop 18). The
// rail bounce is the honest vehicle: `useFocusOnMount` deliberately declines on a COLD load (activeElement
// is `<body>`, and stealing focus there would move the start of the tab order past the rail nav), and it is
// a real navigation that must land somewhere useful.
test("coming back to Corpus lands focus in the omnibox, not on a wrapper (C7)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": EMPTY_BROWSE,
    "search.suggest": [],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceRailBounceStory />);

  await component.getByRole("button", { name: "Leave Corpus" }).click();
  await component.getByRole("button", { name: "Back to Corpus" }).click();

  await expect(component.getByRole("combobox", { name: "Search your corpus" })).toBeFocused();
});

// ── P2-4: …AND THE CONTENT PANE STOPS TAKING IT BACK ─────────────────────────────────────────────────
// C7 landed the omnibox focus and the re-pass still measured arrival on "an unnamed 869x7831 div with
// outline:none" — because BOTH corpus surfaces called `useFocusOnMount` on their own root, and CONTENT
// mounts after LIST. The C7 test above cannot see it: a list-only mount has no competitor. This one mounts
// the section the way the shell does, and it is the only arrangement where the defect exists.
const EMPTY_CORPUS_CONTENT: TrpcRoutes<
  | "discovery.home"
  | "discovery.visualArchetypes"
  | "discovery.forgottenGems"
  | "discovery.unusedCharacters"
  | "discovery.modelRouting"
  | "discovery.topKeywords"
  | "discovery.themeDrift"
  | "workloads.list"
> = {
  "discovery.home": {
    coverage: { characters: 0, digests: 0, segments: 0 },
    sceneThemes: [],
    arcThemes: [],
    duplicateCounts: { characters: 0, chats: 0, identicalCharacterPairs: 0 },
  },
  "discovery.visualArchetypes": [],
  "discovery.forgottenGems": [],
  "discovery.unusedCharacters": [],
  "discovery.modelRouting": [],
  "discovery.topKeywords": [],
  "discovery.themeDrift": [],
  "workloads.list": [],
};

test("arriving in the SECTION lands focus in the omnibox — the content pane does not steal it (P2-4)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": EMPTY_BROWSE,
    "search.suggest": [],
    "search.search": searchResponder,
    ...EMPTY_CORPUS_CONTENT,
  });
  const component = await mount(<CorpusSectionArrivalStory />);

  await component.getByRole("button", { name: "Leave Corpus" }).click();
  await component.getByRole("button", { name: "Back to Corpus" }).click();
  // SETTLED barrier: the CONTENT region's own rendered arm, so the assertion runs after the pane that used
  // to win the race has mounted, painted and had every chance to grab focus.
  await expect(component.getByText("Nothing in your library yet")).toBeVisible();

  await expect(component.getByRole("combobox", { name: "Search your corpus" })).toBeFocused();
});

test("the omnibox surfaces as-you-type suggestions from search.suggest", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": EMPTY_BROWSE,
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

// ── #537 · the corpus ARIA sweep ─────────────────────────────────────────────────────────────────────
// The omnibox is an INLINE Autocomplete, and Base UI derives `aria-expanded` as `open || inline` — so a
// pristine, never-typed-in search box announced itself EXPANDED onto a popup with nothing in it, from the
// moment the section mounted. The seal states the truth off the same filtered count its status region
// speaks: the inline list's visibility gate IS its item count.
test("#537 the omnibox reports COLLAPSED until the typeahead actually has suggestions", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": EMPTY_BROWSE,
    "search.suggest": [{ suggestion: "night market", score: 0.9 }],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceStory />);
  const omnibox = component.getByRole("combobox", { name: "Search your corpus" });

  // PRISTINE: nothing typed, nothing suggested, nothing on screen to be expanded onto.
  await expect(omnibox).toBeVisible();
  await expect(omnibox).toHaveAttribute("aria-expanded", "false");

  // …and it goes true only once the list it claims is rendered (SETTLED on the rendered option).
  await omnibox.fill("night");
  await expect(page.getByRole("option", { name: "night market" })).toBeVisible();
  await expect(omnibox).toHaveAttribute("aria-expanded", "true");
});

// The typeahead's status region was PERMANENT in the inline arm — it has no popup to gate it — so the
// corpus pane carried a live region reading "0 suggestions" over a resting catalog, competing with the
// shell's own status region for a reader's attention while saying nothing.
test("#537 the typeahead announces no count while it has nothing to suggest", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": browsePage([ARIA_ROW, BOLT_ROW], null),
    "search.suggest": [{ suggestion: "night market", score: 0.9 }],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceStory />);
  await expect(component.getByText("Aria Nightshade")).toBeVisible();

  const status = component.locator('[data-slot="autocomplete-status"]');
  await expect(status).toHaveCount(0);

  // It speaks again the moment there IS a list to count — the region is transient, not deleted.
  await component.getByRole("combobox", { name: "Search your corpus" }).fill("night");
  await expect(page.getByRole("option", { name: "night market" })).toBeVisible();
  await expect(status).toHaveText("1 suggestion");
});

// The #491 pane-scoped twin. The shell's own `Skip to content` moves focus to `<main>` — PAST this pane —
// so a keyboard user who came for the RESULTS had five target toggles, the omnibox and the typeahead in
// front of the first hit and no shortcut over them.
test("#537 the pane's skip link is first in DOM order and lands on the first result row", async ({ mount, page }) => {
  await routeTrpc(page, {
    "discovery.characterFacets": { genres: [], tones: [] },
    "discovery.catalog": EMPTY_CATALOG,
    "discovery.browseCharacters": browsePage([ARIA_ROW, BOLT_ROW], null),
    "search.suggest": [],
    "search.search": searchResponder,
  });
  const component = await mount(<CorpusListSurfaceStory />);
  await expect(component.getByText("Aria Nightshade")).toBeVisible();

  // FIRST among the pane's focusables, in DOM order — the whole contract: a skip control that is not the
  // first focusable is a second tab stop, not a skip.
  const skip = component.getByRole("button", { name: "Skip to results" });
  await expect
    .poll(
      async () =>
        await skip.evaluate((el: HTMLElement) => {
          const pane = el.closest<HTMLElement>('[data-testid="corpus-list-surface"]');
          const focusables = [...(pane?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])') ?? [])];
          const first = focusables[0];
          return { isSkip: first === el, name: first?.textContent ?? first?.getAttribute("aria-label") ?? "(none)" };
        }),
    )
    .toEqual({ isSkip: true, name: "Skip to results" });

  await skip.focus();
  await page.keyboard.press("Enter");
  await expect(component.locator('[data-slot="list-row-body"]').first()).toBeFocused();
});
