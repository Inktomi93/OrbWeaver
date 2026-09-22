// CT: the corpus omnibox's MEMORIES branch — the two defects the 2026-08-18 corpus forensics named as the
// owner's "search-and-select is SUPER useful… not" (docs/reviews/misc/2026-08-18-corpus-forensics.md §2).
//
// WHY THESE ASSERTIONS AND NOT THE TESTID. `data-testid="corpus-search-hit"` matched ZERO nodes in the
// rendered DOM for this branch — `ListRow` builds its body from named props and forwards no `data-*`
// (packages/ui/src/primitives/list-row/list-row.tsx), so the prop was dropped on the floor and any probe
// keyed on it was a silent no-op. The claim is gone; a memory hit is addressed the way a user meets it —
// a button whose accessible name is the ROOM it opens (see the U2 block below; it was the memory's whole
// text until 2026-08-19, which is the defect that block pins).
//
// WHAT EACH TEST PINS:
//   • RELEVANCE GOES THE RIGHT WAY. The rendered number used to be `cslsAdjust` — a hub-adjusted cosine
//     DISTANCE, clamped at 0 — so every good hit read `0.00` and only a nonsense query produced anything
//     non-zero. The row now reads a similarity (`1 − distance`) as a percent, and the CLOSER hit shows the
//     LARGER number. The fixture's two hits carry the SAME clamped score to make that the only difference.
//   • THE ROW IS A DOOR. It was a static `<div>` (`role: null`, no tab stop) over a `chatId` the wire
//     already carried. Clicking now selects the chat and switches to the chats section.
//   • THE ROW NAMES THE ROOM. The subtitle was `Chat 2y1mf5` — a 6-char id slice. It now reads the room's
//     authored title, falling back through the ONE chat-title chain (`deriveChatTitle`) to the digest's
//     scoped character when the room was never named.
//
// The block-level deep link (blockIdx → the exact moment) is deliberately NOT here: `MessageListHandle`
// exposes no scroll-to-index outside pin-prompt mode, so it is the moment-artifact work, not a quick win.
//
// BARRIER DISCIPLINE. These tests wait on the HIT'S OWN TEXT, never a container testid. The sibling
// lesson, paid live on the corpus overview: `[data-testid=corpus-home-surface]` attaches while the body is
// still inside its single QueryBoundary reading "Loading your corpus…", so a probe barriered on it reads
// an unsettled DOM and reports zeros; the settled barrier over there is `[data-corpus-focal]`. Same rule,
// different surface — barrier on a node only the SETTLED arm can produce.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { CorpusFieldsSearchStory, CorpusListSurfaceNavStory, CorpusSearchToDossierStory } from "../_ct-stories.tsx";

/**
 * THE CORPUS SECTION'S AMBIENT READS (#649) — spread FIRST into every `routeTrpc` call in this file.
 *
 * The mounts here ask for the section the way the shell does: the omnibox's typeahead and the
 * facet/catalog lenses the LIST pane resolves its chips from (`CorpusListSurfaceNavStory`), plus — in
 * `CorpusSearchToDossierStory`, which mounts `CorpusContent` beside the list — the CONTENT pane's home
 * dossier, which is what that region draws while nothing is selected. None of that is any ONE test's
 * subject here (the subject is what a search RESULT ROW says), but `routeTrpc` answers an unlisted
 * procedure `null`, which is not a view — so those pipelines ran INERT across every mount.
 *
 * Every value is the honest UN-DISTILLED default the corpus-list/-home CTs already use for the same reads:
 * an empty catalog, no facets, no families, no gems, a zero-coverage home. A test that needs one of them
 * populated lists the key AFTER the spread and wins (the suggestion test's `search.suggest` does).
 *
 * THE LAST FOUR ARE A CASCADE, AND THEY ARE WHY THIS BLOCK WAS STILL SHORT (#2226). They are the home
 * dossier's BELOW-FOLD, NON-SUSPENDING reads (`CorpusHomeBody`), so they cannot be requested at all until
 * the four suspending reads above stop answering `null` and the body renders — which made whether this
 * file tripped the CT unfed-read ratchet depend on the box: on a quiet scoped run the click navigated away
 * before they landed and the census saw nothing, while the whole-tree `browser:ct` run reported all four
 * (`reports/.../browser-ct.log`, 4 violations). Fed here with the same `[]` the whole-app census mount uses
 * (`tests/client/routes/app-root.ct.tsx`), and pinned by the ambient-feed test at the bottom of this file
 * so the observation no longer depends on load.
 */
const CORPUS_AMBIENT_ROUTES: TrpcRoutes<
  | "search.suggest"
  | "discovery.characterFacets"
  | "discovery.catalog"
  | "discovery.browseCharacters"
  | "discovery.home"
  | "discovery.visualArchetypes"
  | "discovery.forgottenGems"
  | "workloads.list"
  | "discovery.topKeywords"
  | "discovery.unusedCharacters"
  | "discovery.modelRouting"
> = {
  // The omnibox typeahead. `[]` is a real (empty) list, where null skipped the suggestion resolve entirely.
  "search.suggest": [],
  // The LIST pane's lens vocabularies, at the pre-distill floor.
  "discovery.characterFacets": { genres: [], tones: [] },
  "discovery.catalog": { genres: [], tones: [], topTags: [], tagPairs: [], totalDistilled: 0 },
  // The BROWSE view's keyset-paged infinite query (#1631) — `CorpusListSurfaceNavStory` mounts
  // `CorpusListSurface` → `CorpusBrowseView`, whose `discovery.browseCharacters` read was UNFED, so whether
  // this file tripped the CT unfed-read ratchet depended on the query landing before the test ended. Shape
  // source-verified against `BrowseCharactersPage` (server/domain/discovery/contract/results.ts:131) — an
  // empty FIRST page with no cursor, the same `EMPTY_BROWSE` the corpus-list-surface CT already serves.
  "discovery.browseCharacters": { items: [], nextCursor: null, totalCount: 0 },
  // The CONTENT pane's dossier reads — the shape `corpus-list-surface.ct.tsx`'s EMPTY_CORPUS_CONTENT uses.
  "discovery.home": {
    coverage: { characters: 0, digests: 0, segments: 0 },
    sceneThemes: [],
    arcThemes: [],
    duplicateCounts: { characters: 0, chats: 0, identicalCharacterPairs: 0 },
  },
  "discovery.visualArchetypes": [],
  "discovery.forgottenGems": [],
  // The below-fold cascade (see the header): the readiness rail's queue read and the three inventory
  // blocks the overview draws under it. `[]` is the honest pre-analysis answer for each — no runs, no
  // keywords, no never-played cards, no routing rows.
  "workloads.list": [],
  "discovery.topKeywords": [],
  "discovery.unusedCharacters": [],
  "discovery.modelRouting": [],
};

/** The line the row used to carry for its room: the literal word "Chat" plus a 6-character id slice. */
const RAW_CHAT_REF = /^Chat \w{6}$/;
const NAMED_CHAT = "chat_amethyst";
const UNNAMED_CHAT = "chat_unnamed";
/** The named room's authored title — since U2 this is the ROW'S NAME (and its accessible name). */
const NAMED_ROOM = "Amethyst Hollow";
const BATH_TEXT = "[Nate, Selene — hotel room bath scene] All three strip and settle into the copper tub.";
const FARM_TEXT = "[Nate, Kira — farmhouse porch] The harvest is in and the evening is quiet.";

/** Two digest hits whose CSLS `score` is identical at the clamp floor — so the only thing that can order or
 *  distinguish them on screen is the relevance the fix adds. */
const MEMORY_HITS: TrpcRoutes<"search.search"> = {
  "search.search": {
    over: "digests",
    hits: [
      {
        blockKey: { chatId: NAMED_CHAT, tier: 1, blockIdx: 4, scopedCharacterId: "character_selene" },
        score: 0,
        relevance: 0.88,
        text: BATH_TEXT,
        chatTitle: "Amethyst Hollow",
        scopedCharacterName: "Selene",
      },
      {
        blockKey: { chatId: UNNAMED_CHAT, tier: 1, blockIdx: 9, scopedCharacterId: "character_kira" },
        score: 0,
        relevance: 0.61,
        text: FARM_TEXT,
        chatTitle: null,
        scopedCharacterName: "Kira",
      },
    ],
  },
};

/** Drive the omnibox the way a user does: pick the Memories target, then type the query. The barrier is the
 *  hit's TEXT, never its role — a role barrier would make every test in this file fail on the same line and
 *  hide which assertion is actually red. */
async function searchMemories(component: ReturnType<Page["locator"]>): Promise<void> {
  await component.getByRole("button", { name: "Search Memories" }).click();
  await component.getByRole("combobox", { name: "Search your corpus" }).fill("shared bathing");
  await expect(component.getByText(BATH_TEXT)).toBeVisible();
}

test("a closer memory reads a HIGHER relevance than a further one", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...MEMORY_HITS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchMemories(component);
  await expect(component.getByText("88%")).toBeVisible();
  await expect(component.getByText("61%")).toBeVisible();
  // The anti-informative reading the forensics measured: every good hit rendered `0.00`.
  await expect(component.getByText("0.00")).toHaveCount(0);
});

// #537 — the score used to ride ListRow's `actions`, which is a SIBLING of the clickable body by the
// primitive's own contract: the number every sighted reader ranks the list by reached a screen reader as
// nothing at all. `meta` is the slot for exactly this (its prop doc names the defect: "unlike a stamp
// stranded in the `actions` sibling") — rendered inside the row's accessible content and carried on the
// body's `aria-describedby`, so the row is announced as "<room>, <memory> 88%".
test("#537 a hit's relevance is INSIDE the row's own button, on its accessible description", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...MEMORY_HITS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchMemories(component);
  const row = component.getByRole("button", { name: NAMED_ROOM });
  // The percent is a descendant of the row's BODY (the button itself), not of a sibling cluster.
  await expect(row.getByText("88%")).toBeVisible();
  // …and it is wired: the body's aria-describedby resolves to text containing the number.
  await expect
    .poll(
      async () =>
        await row.evaluate((el: HTMLElement) => {
          const ids = (el.getAttribute("aria-describedby") ?? "").split(" ").filter((id) => id !== "");
          return ids.map((id) => el.ownerDocument.getElementById(id)?.textContent ?? "").join(" ");
        }),
    )
    .toContain("88%");
});

test("a memory hit is a door: clicking it opens its chat", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...MEMORY_HITS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchMemories(component);
  // The row is named by the ROOM it opens (U2) — which is also the thing the click does.
  // NO DISMISSAL STEP. This test carried `page.keyboard.press("Escape")` here until 2026-08-18, because the
  // typeahead rendered as an anchored POPUP over the rows and an unforced click on result #1 waited for
  // actionability forever. The omnibox now renders its suggestions IN FLOW (`Autocomplete inline`), so the
  // first result is reachable the way a user reaches it — one click, no dismissal.
  await component.getByRole("button", { name: NAMED_ROOM }).click();

  await expect(component.getByTestId("ct-nav-readout")).toHaveText(`section:chats chat:${NAMED_CHAT}`);
});

// ── THE TYPEAHEAD MUST NOT EAT THE ANSWER (corpus quick-wins lane, 2026-08-18) ────────────────────────
// The two tests above run with `search.suggest` unstubbed, which is the EMPTY arm — and even that one
// covered the rows, because an anchored popup rendering "No suggestions." is still an overlay. This is the
// POPULATED arm: real server suggestions, which is the state the user is actually in while typing. The
// assertion is geometry, not a class — a suggestion list that reserves space above the results cannot cover
// them at any z-index, which is what the shared `Autocomplete` `inline` arm was built for (its founding
// caller is the prompt dialog, whose popup covered the confirm row it pointed at).
const SUGGESTIONS = [
  { suggestion: "shared bathing", score: 0.9 },
  { suggestion: "shared bath house", score: 0.8 },
];

test("an open typeahead never covers a result: row 1 is clickable with the suggestions showing", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...MEMORY_HITS, "search.suggest": SUGGESTIONS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchMemories(component);
  const suggestion = page.getByRole("option", { name: "shared bath house" });
  await expect(suggestion).toBeVisible();

  const [suggestionBox, rowBox] = await Promise.all([suggestion.boundingBox(), component.getByRole("button", { name: NAMED_ROOM }).boundingBox()]);
  if (suggestionBox === null || rowBox === null) {
    throw new Error("the typeahead suggestion or the first result row did not render a box");
  }
  expect(suggestionBox.y + suggestionBox.height, "the suggestion list ends above the first result row").toBeLessThanOrEqual(rowBox.y);

  // …and the door still opens on ONE unforced click, with the list still showing.
  await component.getByRole("button", { name: NAMED_ROOM }).click();
  await expect(component.getByTestId("ct-nav-readout")).toHaveText(`section:chats chat:${NAMED_CHAT}`);
});

// ── P2-B: A NEAREST-NEIGHBOUR ENGINE HAS NO EMPTY ARM, SO THE SURFACE HAS TO SAY SO ───────────────────
// `zzqqxwvfoobarbaz` returned twenty rows at 39-41% and the live region announced them as results: cosine
// always answers, so the omnibox structurally could not reach its "nothing matched" state. The fix labels
// rather than hides — the measurement in `CORPUS_NEAREST_ONLY_BELOW` (a coherent off-topic query scores
// BELOW gibberish on the digest index) is why hiding rows would be the wrong arm. These two tests are the
// pair: the degraded arm SAYS it, and a real answer is untouched.
/** Digest relevances under the measured digest band (0.61) — what gibberish scores against that index. */
const NOISE_HITS: TrpcRoutes<"search.search"> = {
  "search.search": {
    over: "digests",
    hits: [
      {
        blockKey: { chatId: NAMED_CHAT, tier: 1, blockIdx: 4, scopedCharacterId: "character_selene" },
        score: 0,
        relevance: 0.41,
        text: BATH_TEXT,
        chatTitle: NAMED_ROOM,
        scopedCharacterName: "Selene",
      },
      {
        blockKey: { chatId: UNNAMED_CHAT, tier: 1, blockIdx: 9, scopedCharacterId: "character_kira" },
        score: 0,
        relevance: 0.39,
        text: FARM_TEXT,
        chatTitle: null,
        scopedCharacterName: "Kira",
      },
    ],
  },
};

/** The banner's own words, loosely matched: the tell is the caveat, not the sentence's punctuation. */
const NEAREST_ONLY = /Nothing matched strongly/;
/** The same caveat as the live region speaks it (hoisted — a regex literal in a test body is lint-RED). */
const NEAREST_ONLY_SPOKEN = /nothing matched strongly/;

test("a nonsense query is LABELLED, not presented as an answer — and keeps its rows (P2-B)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...NOISE_HITS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchMemories(component);
  const banner = component.getByText(NEAREST_ONLY);
  await expect(banner).toBeVisible();
  // The ceiling is STATED, in the surface's one similarity spelling — not left as twenty confident rows.
  await expect(banner).toContainText("41%");
  // NOTHING IS HIDDEN: both rows still render. The measured reason is in `CORPUS_NEAREST_ONLY_BELOW` —
  // a low score is not a bad result, so the surface labels instead of dropping.
  await expect(component.locator('[data-slot="list-row-subtitle"]')).toHaveCount(2);
  // …and a listener hears the same caveat the reader sees, rather than "2 results".
  await expect(component.locator("[role=status]").getByText(NEAREST_ONLY_SPOKEN)).toBeVisible();
});

test("a real answer carries NO caveat — the banner is a state, not a disclaimer (P2-B)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...MEMORY_HITS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchMemories(component);
  await expect(component.getByText(NEAREST_ONLY)).toHaveCount(0);
});

// ── THE IMAGES TARGET IS A REAL RESULT LIST (side-eye corpus re-pass U4) ──────────────────────────────
// It shipped as twenty rows with a generic glyph, no image, no button and `cursor: auto`, in the SAME
// ListRow geometry as the Memories rows that ARE doors: an image search that showed no images, and a dead
// end dressed as a live one. Both halves are pinned here, in both directions — a thumbnail with a dead
// click would be the same defect wearing better clothes.
const AVATAR_HASH = "aaaa1111";
const ORPHAN_HASH = "bbbb2222";
const WORN_CAPTION = "a red-haired knight in the rain";
const ORPHAN_CAPTION = "an empty throne room";
/** A 1x1 transparent PNG — the smallest thing the CAS blob route can serve. */
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

const IMAGE_HITS: TrpcRoutes<"search.search"> = {
  "search.search": {
    over: "images",
    hits: [
      {
        assetId: "asset_worn",
        hash: AVATAR_HASH,
        characterId: "character_aria",
        characterName: "Aria",
        score: 0.12,
        relevance: 0.88,
        lens: "image-captioned",
        caption: WORN_CAPTION,
      },
      {
        assetId: "asset_orphan",
        hash: ORPHAN_HASH,
        characterId: null,
        characterName: null,
        score: 0.4,
        relevance: 0.6,
        lens: "image-captioned",
        caption: ORPHAN_CAPTION,
      },
    ],
  },
};

/** The two rows by their accessible names (hoisted — a regex literal in a test body is lint-RED). */
const WORN_ROW_NAME = /Aria/;
const ORPHAN_ROW_NAME = /empty throne room/;

/** The dossier the worn image's door lands on. Flat: only the LANDING is under test here. */
const ARIA_DOSSIER = {
  characterId: "character_aria",
  name: "Aria",
  genre: "fantasy",
  tone: "dark",
  elevatorPitch: null,
  tags: [],
  portrait: null,
  refineryScore: null,
  similar: [],
};

/** The CAS route has to ANSWER: Base UI's Avatar swaps to its fallback when the image ERRORS, so an
 *  unstubbed 404 makes a correctly-wired thumbnail indistinguishable from the glyph-only row that shipped. */
async function searchImages(component: ReturnType<Page["locator"]>, page: Page, extra: TrpcRoutes = {}): Promise<void> {
  await page.route("**/api/blob/*", async (route) => route.fulfill({ body: PIXEL, contentType: "image/png", status: 200 }));
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...IMAGE_HITS, ...extra });
  await component.getByRole("button", { name: "Search Images" }).click();
  await component.getByRole("combobox", { name: "Search your corpus" }).fill("knight in the rain");
  await expect(component.getByText(WORN_CAPTION)).toBeVisible();
}

test("an image search SHOWS THE IMAGES — every hit renders its own blob", async ({ mount, page }) => {
  const component = await mount(<CorpusListSurfaceNavStory />);
  await searchImages(component, page);

  // The hash off `ImageSearchHit.hash` reached an <img> — nothing else on this surface can produce that URL.
  // PREFIX match, not equality (C6, side-eye corpus re-pass 2026-08-19): a card-worn hit draws through
  // `CharacterAvatar`, which asks the CAS route for a display RUNG (`?w=48`) instead of the full-size
  // original — 1840x2752 decodes for a 24px box were part of the surface's mount long frame. The claim under
  // test is unchanged: this hit's own hash reached an image element.
  await expect(page.locator(`img[src^="/api/blob/${AVATAR_HASH}"]`)).toHaveCount(1);
  await expect(page.locator(`img[src^="/api/blob/${ORPHAN_HASH}"]`)).toHaveCount(1);
});

test("an image WORN BY A CARD is a door that LANDS: clicking it opens that character's dossier", async ({ mount, page }) => {
  const component = await mount(<CorpusSearchToDossierStory />);
  await searchImages(component, page, { "discovery.characterDossier": ARIA_DOSSIER, "discovery.characterKeywords": [], "search.similarArt": [] });

  // The row is named for the character it lands on; the caption is its subtitle.
  await component.getByRole("button", { name: WORN_ROW_NAME }).click();

  // THE RECEIPT IS THE RENDERED DESTINATION, not a store write: the dossier is what the CONTENT region
  // draws for a selected corpus character, so its presence is the door having landed.
  await expect(component.getByTestId("corpus-dossier-surface")).toBeVisible();
  await expect(component.getByRole("heading", { name: "Card quality" })).toBeVisible();
});

test("an image NO CARD wears is visibly NOT a door — and says why", async ({ mount, page }) => {
  const component = await mount(<CorpusListSurfaceNavStory />);
  await searchImages(component, page);

  // The whole U4 defect in one assertion: this row must not be a button while its sibling is.
  await expect(component.getByRole("button", { name: ORPHAN_ROW_NAME })).toHaveCount(0);
  await expect(component.getByRole("button", { name: WORN_ROW_NAME })).toHaveCount(1);
  // …and the reason is on the row, not left for the reader to discover by clicking nothing.
  await expect(component.getByText("No card uses this image — nothing to open")).toBeVisible();
});

test("a memory hit names its room, never a raw chat id", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...MEMORY_HITS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchMemories(component);
  // Read the TITLE slot specifically: "Kira" also appears inside its row's memory text, so a bare text
  // query would resolve to two nodes and prove nothing about where the name is rendered.
  const titles = component.locator('[data-slot="list-row-title"]');
  // The unnamed room falls through the chat-title chain to its cast, never to a hex slice.
  await expect(titles).toHaveText([NAMED_ROOM, "Kira"]);
  await expect(component.getByText(RAW_CHAT_REF)).toHaveCount(0);
});

// ── U2: THE ROOM IS THE NAME, THE MEMORY IS THE BODY (side-eye corpus re-pass 2026-08-19) ─────────────
// Measured on the live surface: `{ accNameLen: 1154, visibleTitleWidthPx: 221, fullTitleWidthPx: 8030 }` —
// 97% of the row's primary line was invisible, twenty rows opened with the same bracketed header, five were
// visually indistinguishable, and axe scored `label-content-name-mismatch` 0 across 6 nodes (WCAG 2.5.3: a
// spoken name must contain the read label, and nothing could read an 8030px line). The prescription said
// "room + date"; the DATE half is refused on the wire's own law — `DigestSourceHit` carries no timestamp and
// its contract header says why (`chats.updatedAt` is when the ROOM was touched, which would read as a lie).
// Whatever date a room's title holds is the room's authored name and arrives here for free.
test("a memory row's accessible name is its ROOM, short and readable — not the whole digest", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...MEMORY_HITS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchMemories(component);
  const row = component.getByRole("button", { name: NAMED_ROOM });
  await expect(row).toHaveAttribute("aria-label", NAMED_ROOM);
  const accName = (await row.getAttribute("aria-label")) ?? "";
  expect(accName.length, "an accessible name a person can hear").toBeLessThan(120);
  // LABEL-IN-NAME: the name is exactly the text rendered as the row's title.
  await expect(row.locator('[data-slot="list-row-title"]')).toHaveText(accName);
  // The memory itself is still on the row — as the body, where it is allowed to wrap.
  await expect(row.locator('[data-slot="list-row-subtitle"]')).toHaveText(BATH_TEXT);
});

// ── C1 + C2: HONEST BODIES, ONE PER PIECE OF EVIDENCE ────────────────────────────────────────────────
// C1: the wire hands back raw model prose sliced at 280 chars — markdown rendered as literal syntax, cut
// mid-word, then closed by the row's own quotation mark. C2: a duplicated room yields digest blocks whose
// text is byte-identical, and the ranked list showed both.
const MARKDOWN_DIGEST = "**Selene** said:\n\n> ### the copper tub\n\nThey settle in, and the steam takes the room.";
const DUPLICATE_HITS: TrpcRoutes<"search.search"> = {
  "search.search": {
    over: "digests",
    hits: [
      {
        blockKey: { chatId: NAMED_CHAT, tier: 1, blockIdx: 4, scopedCharacterId: "character_selene" },
        score: 0,
        relevance: 0.91,
        text: MARKDOWN_DIGEST,
        chatTitle: NAMED_ROOM,
        scopedCharacterName: "Selene",
      },
      {
        // The SAME evidence out of a duplicated room, one day later and one block over — two rows a reader
        // cannot tell apart, spending two of twenty slots on one memory.
        blockKey: { chatId: UNNAMED_CHAT, tier: 1, blockIdx: 5, scopedCharacterId: "character_selene" },
        score: 0,
        relevance: 0.9,
        text: MARKDOWN_DIGEST,
        chatTitle: "Amethyst Hollow (copy)",
        scopedCharacterName: "Selene",
      },
    ],
  },
};

// ── P1-1 + P2-2 + P2-3: THE SCENES BRANCH, WHERE THE EVIDENCE IS THE UNIT ────────────────────────────
// The re-pass measured three room doors — "Anika Jan 28" / "Jan 26 (3)" / "Jan 28 (2)" — each sitting over
// the byte-identical 220-char snippet, because the preview grouped a character's segments BY CHAT. Twenty
// slots, one memory, and a reader who reasonably concludes the search is broken. The C2 dedupe that fixed
// the Memories branch is deliberately NOT the fix here: dropping a hit would drop a real room. The grouping
// inverts instead — one body, every room that carries it hanging off it as a door.
const PASSAGE = "The rain came sideways off the harbour and neither of them moved for a long moment.";
const OTHER_PASSAGE = "She counted the coins twice, then pushed the whole stack back across the table.";
/** Three rooms: two share the passage (a duplicated import — note the numbered title), one has its own. */
const SCENE_HITS: TrpcRoutes<"search.search"> = {
  "search.search": {
    over: "discover",
    hits: [
      {
        characterId: "character_anika",
        score: 0.1,
        relevance: 0.83,
        name: "Anika",
        avatarHash: null,
        genre: "noir",
        tone: "wry",
        elevatorPitch: null,
        matchCount: 79,
        segments: [
          { chatId: "chat_harbour", blockIdx: 2, snippet: PASSAGE, score: 0.1, chatTitle: "Anika Jan 28" },
          { chatId: "chat_harbour_copy", blockIdx: 5, snippet: PASSAGE, score: 0.12, chatTitle: "Anika Jan 28 (2)" },
          { chatId: "chat_market", blockIdx: 9, snippet: OTHER_PASSAGE, score: 0.2, chatTitle: "Anika Jan 26" },
        ],
      },
    ],
  },
};

/** The three room doors the fixture must produce (hoisted — the loop body is a locator per name). */
const SCENE_ROOMS = ["Anika Jan 28", "Anika Jan 28 (2)", "Anika Jan 26"];
/** The numbering hint, matched loosely: the sentence is the client's, the tell is the word. */
const NUMBERED_HINT = /numbered/;

async function searchScenes(component: ReturnType<Page["locator"]>): Promise<void> {
  await component.getByRole("button", { name: "Search Scenes" }).click();
  await component.getByRole("combobox", { name: "Search your corpus" }).fill("harbour rain");
  await expect(component.getByText(PASSAGE)).toBeVisible();
}

test("SCENES: one passage renders ONCE, with a door into every room it was found in (P1-1)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...SCENE_HITS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchScenes(component);
  // THE DEFECT, as a count: the shared passage appeared under each of its rooms.
  await expect(component.getByText(PASSAGE)).toHaveCount(1);
  await expect(component.getByText(OTHER_PASSAGE)).toHaveCount(1);
  // …and NOTHING was dropped to get there — all three rooms are still reachable, as doors.
  // EXACT names: "Anika Jan 28" is a PREFIX of "Anika Jan 28 (2)", and Playwright's name match is a
  // substring by default — the loose form resolves two nodes for one room and reports a defect that is
  // the query's, not the surface's.
  await Promise.all(SCENE_ROOMS.map(async (room) => expect(component.getByRole("button", { name: room, exact: true })).toHaveCount(1)));
});

test("SCENES: a room is a door that LANDS, and it looks like one — left-aligned, muted, arrowed (P2-2)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...SCENE_HITS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchScenes(component);
  const door = component.getByRole("button", { name: "Anika Jan 28 (2)" });
  // DOOR VOCABULARY, measured: the label starts at the control's leading edge (it was centred) and the
  // arrow the surface's other doors carry is present. Colour is asserted as "not the body ink", which is
  // what "reads as a heading" meant — the exact token is the ghost intent's business.
  const shape = await door.evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    const body = globalThis.getComputedStyle(globalThis.document.body);
    return { justify: style.justifyContent, colour: style.color, bodyColour: body.color, text: el.textContent ?? "" };
  });
  expect(shape.justify, "a door's label starts where the reader's eye already is").toBe("flex-start");
  expect(shape.text, "…and carries the arrow every other door on this surface carries").toContain("→");
  expect(shape.colour, "…and is not painted in the body ink that made it read as a heading").not.toBe(shape.bodyColour);

  await door.click();
  await expect(component.getByTestId("ct-nav-readout")).toHaveText("section:chats chat:chat_harbour_copy");
});

test("SCENES: the honesty line is readable, not clipped to '…— showin' (P2-3)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...SCENE_HITS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchScenes(component);
  // The subtitle is the row's description: 79 matching moments, and how many of them are under it.
  const scent = component.locator('[data-slot="list-row-subtitle"]').first();
  await expect(scent).toContainText("79 matching moments");
  const clipped = await scent.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  expect(clipped, "the line that says what the list does NOT show must not itself be cut off").toBe(false);
});

// ── P3-D: ONE ROOM, SAID ONCE ────────────────────────────────────────────────────────────────────────
// The ordinary library case is the mirror of P1-1's duplicated-room case: several passages out of the SAME
// room, which printed byte-identical doors under each of them. The grouping is NOT inverted back (that trade
// was measured and lost); the door lifts out only when it is true of every passage — which is what the
// SCENE_HITS fixture above is the control for, since its rooms differ per passage.
const ONE_ROOM_HITS: TrpcRoutes<"search.search"> = {
  "search.search": {
    over: "discover",
    hits: [
      {
        characterId: "character_anika",
        score: 0.1,
        relevance: 0.83,
        name: "Anika",
        avatarHash: null,
        genre: "noir",
        tone: "wry",
        elevatorPitch: null,
        matchCount: 12,
        segments: [
          { chatId: "chat_harbour", blockIdx: 2, snippet: PASSAGE, score: 0.1, chatTitle: "Anika Jan 28" },
          { chatId: "chat_harbour", blockIdx: 9, snippet: OTHER_PASSAGE, score: 0.2, chatTitle: "Anika Jan 28" },
        ],
      },
    ],
  },
};

test("SCENES: two passages from ONE room render that room's door once (P3-D)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...ONE_ROOM_HITS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchScenes(component);
  // Both passages still render — nothing was collapsed but the echo.
  await expect(component.getByText(PASSAGE)).toHaveCount(1);
  await expect(component.getByText(OTHER_PASSAGE)).toHaveCount(1);
  await expect(component.getByRole("button", { name: "Anika Jan 28", exact: true })).toHaveCount(1);
});

test("SCENES: a numbered room title explains its own number (P3-6)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...SCENE_HITS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchScenes(component);
  // The `(2)` is part of the room's STORED title (rooms that arrive sharing a name are numbered at import),
  // so the label cannot explain itself and the hint states the app's rule — on the numbered door only.
  await expect(component.getByRole("button", { name: "Anika Jan 28 (2)" })).toHaveAttribute("title", NUMBERED_HINT);
  await expect(component.getByRole("button", { name: "Anika Jan 26" })).not.toHaveAttribute("title", NUMBERED_HINT);
});

test("a memory body reads as prose — flattened markdown, no raw syntax — and identical evidence renders ONCE", async ({ mount, page }) => {
  await routeTrpc(page, { ...CORPUS_AMBIENT_ROUTES, ...DUPLICATE_HITS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await component.getByRole("button", { name: "Search Memories" }).click();
  await component.getByRole("combobox", { name: "Search your corpus" }).fill("copper tub");

  const bodies = component.locator('[data-slot="list-row-subtitle"]');
  // C2: byte-identical evidence collapses to the higher-scored copy — the room that scored 0.91.
  await expect(bodies).toHaveCount(1);
  await expect(component.getByRole("button", { name: NAMED_ROOM })).toBeVisible();
  await expect(component.getByRole("button", { name: "Amethyst Hollow (copy)" })).toHaveCount(0);
  // C1: one line of prose — the emphasis markers, the quote/heading prefixes and the blank lines are gone.
  await expect(bodies).toHaveText("Selene said: the copper tub They settle in, and the steam takes the room.");
});

// ── #1500 · THE NAME MAP CAN FAIL ON ITS OWN ─────────────────────────────────────────────────────
// The lexical branch's hits are bare ids; the NAMES come from a second read (`character.list`). When that
// one failed, `byId` was empty and every row fell through to its `Character abc123` short-ref fallback — a
// real result set wearing fabricated labels, with nothing on screen saying the names were the broken half.
// The hits are still the answer, so they stay; what is added is the honest notice and a retry for exactly
// the read that failed.
const FIELDS_HIT_ID = "character_0000000000000000001";

test("a FAILED name map says the rows are showing ids, and its Retry re-reads the names (#1500)", async ({ mount, page }) => {
  let attempts = 0;
  const trpc = await routeTrpc(page, {
    "search.fields": () => [{ characterId: FIELDS_HIT_ID, score: 4.2 }],
    "character.list": () =>
      attempts++ === 0
        ? trpcError({ message: "name map read failed" })
        : { items: [{ id: FIELDS_HIT_ID, name: "The Crimson Court", avatarHash: null }], nextCursor: null, totalCount: 1 },
  });
  const results = await mount(<CorpusFieldsSearchStory />);

  await expect(results.getByText("Couldn't load your card names — these rows show ids.")).toBeVisible();
  await results.getByRole("button", { name: "Retry" }).click();

  await expect.poll(() => trpc.count("character.list"), { intervals: [20, 50, 100] }).toBe(2);
  // The row is named now, and the notice about the missing half is gone with the cause.
  await expect(results.getByText("The Crimson Court")).toBeVisible();
  await expect(results.getByText("Couldn't load your card names — these rows show ids.")).toHaveCount(0);
});

// ── THE AMBIENT FEED IS ITSELF PINNED (#2226) ────────────────────────────────────────────────────────
// The unfed-read census is a RUNTIME observation, so it can only see a pipeline the mount actually reached
// — and the CONTENT pane's home dossier reaches its below-fold reads only AFTER its suspending reads
// settle. Every other test here navigates away from that state (or never mounts CONTENT at all), which is
// how four inert pipelines survived in a file whose scoped run reports a clean census. This test is the
// one that stands still: it mounts the CONTENT-bearing story, barriers on the dossier's SETTLED rendered
// arm (a zero-coverage library renders the invitation to add a card — the phase the ambient `discovery.home`
// declares), and then asserts the recorder saw nothing it did not answer.
test("#2226 the ambient fixture FEEDS every pipeline the mounted section requests", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, CORPUS_AMBIENT_ROUTES);
  const component = await mount(<CorpusSearchToDossierStory />);

  // The settled arm of the home dossier: the body rendered, so its four non-suspending reads have fired.
  await expect(component.getByText("Nothing in your library yet")).toBeVisible();
  // …and every one of them was answered with a view rather than `null`.
  await expect.poll(() => trpc.unstubbed(), { intervals: [20, 50, 100, 250] }).toEqual([]);
});
