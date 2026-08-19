// CT: the corpus omnibox's MEMORIES branch — the two defects the 2026-08-18 corpus forensics named as the
// owner's "search-and-select is SUPER useful… not" (docs/reviews/misc/2026-08-18-corpus-forensics.md §2).
//
// WHY THESE ASSERTIONS AND NOT THE TESTID. `data-testid="corpus-search-hit"` matched ZERO nodes in the
// rendered DOM for this branch — `ListRow` builds its body from named props and forwards no `data-*`
// (packages/ui/src/primitives/list-row/list-row.tsx), so the prop was dropped on the floor and any probe
// keyed on it was a silent no-op. The claim is gone; a memory hit is now addressed the way a user meets
// it — a button with the memory's own text as its accessible name.
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
import type { TrpcRoutes } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { CorpusListSurfaceNavStory, CorpusSearchToDossierStory } from "../_ct-stories.tsx";

/** The subtitle the row used to carry: the literal word "Chat" plus a 6-character id slice. */
const RAW_CHAT_REF = /^Chat \w{6}$/;
const NAMED_CHAT = "chat_amethyst";
const UNNAMED_CHAT = "chat_unnamed";
const BATH_TEXT = "[Alex, Iris — hotel room bath scene] All three strip and settle into the copper tub.";
const FARM_TEXT = "[Alex, Kira — farmhouse porch] The harvest is in and the evening is quiet.";

/** Two digest hits whose CSLS `score` is identical at the clamp floor — so the only thing that can order or
 *  distinguish them on screen is the relevance the fix adds. */
const MEMORY_HITS: TrpcRoutes = {
  "search.search": {
    over: "digests",
    hits: [
      {
        blockKey: { chatId: NAMED_CHAT, tier: 1, blockIdx: 4, scopedCharacterId: "character_sample" },
        score: 0,
        relevance: 0.88,
        text: BATH_TEXT,
        chatTitle: "Amethyst Hollow",
        scopedCharacterName: "Iris",
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
  await routeTrpc(page, MEMORY_HITS);
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchMemories(component);
  await expect(component.getByText("88%")).toBeVisible();
  await expect(component.getByText("61%")).toBeVisible();
  // The anti-informative reading the forensics measured: every good hit rendered `0.00`.
  await expect(component.getByText("0.00")).toHaveCount(0);
});

test("a memory hit is a door: clicking it opens its chat", async ({ mount, page }) => {
  await routeTrpc(page, MEMORY_HITS);
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchMemories(component);
  // NO DISMISSAL STEP. This test carried `page.keyboard.press("Escape")` here until 2026-08-18, because the
  // typeahead rendered as an anchored POPUP over the rows and an unforced click on result #1 waited for
  // actionability forever. The omnibox now renders its suggestions IN FLOW (`Autocomplete inline`), so the
  // first result is reachable the way a user reaches it — one click, no dismissal.
  await component.getByRole("button", { name: BATH_TEXT }).click();

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
  await routeTrpc(page, { ...MEMORY_HITS, "search.suggest": SUGGESTIONS });
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchMemories(component);
  const suggestion = page.getByRole("option", { name: "shared bath house" });
  await expect(suggestion).toBeVisible();

  const [suggestionBox, rowBox] = await Promise.all([suggestion.boundingBox(), component.getByRole("button", { name: BATH_TEXT }).boundingBox()]);
  if (suggestionBox === null || rowBox === null) {
    throw new Error("the typeahead suggestion or the first result row did not render a box");
  }
  expect(suggestionBox.y + suggestionBox.height, "the suggestion list ends above the first result row").toBeLessThanOrEqual(rowBox.y);

  // …and the door still opens on ONE unforced click, with the list still showing.
  await component.getByRole("button", { name: BATH_TEXT }).click();
  await expect(component.getByTestId("ct-nav-readout")).toHaveText(`section:chats chat:${NAMED_CHAT}`);
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

const IMAGE_HITS: TrpcRoutes = {
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
  await routeTrpc(page, { ...IMAGE_HITS, ...extra });
  await component.getByRole("button", { name: "Search Images" }).click();
  await component.getByRole("combobox", { name: "Search your corpus" }).fill("knight in the rain");
  await expect(component.getByText(WORN_CAPTION)).toBeVisible();
}

test("an image search SHOWS THE IMAGES — every hit renders its own blob", async ({ mount, page }) => {
  const component = await mount(<CorpusListSurfaceNavStory />);
  await searchImages(component, page);

  // The hash off `ImageSearchHit.hash` reached an <img> — nothing else on this surface can produce that URL.
  await expect(page.locator(`img[src="/api/blob/${AVATAR_HASH}"]`)).toHaveCount(1);
  await expect(page.locator(`img[src="/api/blob/${ORPHAN_HASH}"]`)).toHaveCount(1);
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
  await routeTrpc(page, MEMORY_HITS);
  const component = await mount(<CorpusListSurfaceNavStory />);

  await searchMemories(component);
  // Read the SUBTITLE slot specifically: "Kira" also appears inside its row's memory text, so a bare
  // text query would resolve to two nodes and prove nothing about where the name is rendered.
  const subtitles = component.locator('[data-slot="list-row-subtitle"]');
  // The unnamed room falls through the chat-title chain to its cast, never to a hex slice.
  await expect(subtitles).toHaveText(["Amethyst Hollow", "Kira"]);
  await expect(component.getByText(RAW_CHAT_REF)).toHaveCount(0);
});
