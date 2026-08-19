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
import { CorpusListSurfaceNavStory } from "../_ct-stories.tsx";

/** The subtitle the row used to carry: the literal word "Chat" plus a 6-character id slice. */
const RAW_CHAT_REF = /^Chat \w{6}$/;
const NAMED_CHAT = "chat_amethyst";
const UNNAMED_CHAT = "chat_unnamed";
const BATH_TEXT = "[Nate, Selene — hotel room bath scene] All three strip and settle into the copper tub.";
const FARM_TEXT = "[Nate, Kira — farmhouse porch] The harvest is in and the evening is quiet.";

/** Two digest hits whose CSLS `score` is identical at the clamp floor — so the only thing that can order or
 *  distinguish them on screen is the relevance the fix adds. */
const MEMORY_HITS: TrpcRoutes = {
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
