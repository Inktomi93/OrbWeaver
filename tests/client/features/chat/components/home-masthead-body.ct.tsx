// CT: home's MASTHEAD sentence, driven through the REAL `HomeSurface` over the REAL data layer
// (`chat.listChats` stubbed at the network by routeTrpc) so the derived count + the "you left off …"
// subtitle are the shipped ones.
//
// ── RED-FIRST (stickler 2026-08-16 F1): the SUB-MINUTE recency arm never reads "now ago" ────────────
// The subtitle composed `formatRelativeCompact(when)` — which returns the WORD "now" for any span under a
// minute — with a literal " ago", so opening home seconds after sending a message rendered "You left off
// now ago in …". The fix is the kit's sentence form `formatRelativeAgo` ("just now" sub-minute). Asserted
// through the rendered sentence (not the new API), so it compiles and fails against the old composition.

import { expect, test } from "@playwright/experimental-ct-react";
import { pixelContrast } from "../../../../support/browser/pixel-contrast.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ChatMastheadTileStory } from "../_ct-stories.tsx";
import { HomePartialThemeProseStory } from "../_theme-prose-ct-stories.tsx";
import type { ScopedChatSummaryFixture } from "../fixtures.ts";
import { chatListResponder, makeChatSummary } from "../fixtures.ts";

/** The masthead's subtitle sentence — the one line whose whole job is "how long has it been". */
const LEFT_OFF = /^You left off/u;
/** The ROOM NAME the sentence used to end with. It moved out on the 2026-08-17 rail sweep (P2-6): the hero
 *  island directly below is titled with that room, so the page said it twice inside 90px. This sentence
 *  keeps the INSTANT (its whole job); the hero keeps the room. */
const ROOM_NAME_IN_SENTENCE = /in The /u;

test("F1 the masthead reads 'You left off just now', never 'now ago', for a seconds-old room", async ({ mount, page }) => {
  // Freeze the page clock so the component's "now" and the message time agree deterministically — no
  // ambient Date.now() (test-determinism gate; Spine-Testing §3). A zero-span read exercises the sub-minute arm.
  await page.clock.setFixedTime(FROZEN_AT_MS);
  const recent = makeChatSummary({ id: "chat_recent", title: "The Ashen Spire", participantNames: ["Wren"], lastMessageAt: FROZEN_AT_MS });
  await routeTrpc(page, { "chat.listChats": chatListResponder([recent]) });

  const home = await mount(<ChatMastheadTileStory />);
  const subtitle = home.getByText(LEFT_OFF);

  await expect(subtitle).toBeVisible();
  await expect(subtitle).toHaveText("You left off just now.");
  await expect(subtitle).not.toContainText("now ago");
  // …and it does NOT name the room — the hero island below is the one thing that does (rail sweep P2-6).
  await expect(subtitle).not.toHaveText(ROOM_NAME_IN_SENTENCE);
});

// The sentence dates the VIEWER'S OWN last turn: not the chat row's stamp (a turn does not touch it), and not the
// room's newest message, which someone else may have written after the viewer left.
const HOUR_MS = 3_600_000;
const FORTNIGHT_MS = 14 * 24 * HOUR_MS;
const TEN_MINUTES_MS = 600_000;

test("the subtitle dates the viewer's own last turn, not the row's stamp or someone else's later message", async ({ mount, page }) => {
  await page.clock.setFixedTime(FROZEN_AT_MS);
  const talked = makeChatSummary({
    id: "chat_talked",
    title: "The Rust Lecture",
    participantNames: ["Wren"],
    lastMessageAt: FROZEN_AT_MS - TEN_MINUTES_MS,
    viewerLastTurnAt: FROZEN_AT_MS - HOUR_MS,
    updatedAt: FROZEN_AT_MS - FORTNIGHT_MS,
  });
  await routeTrpc(page, { "chat.listChats": chatListResponder([talked]) });

  const subtitle = (await mount(<ChatMastheadTileStory />)).getByText(LEFT_OFF);

  await expect(subtitle).toHaveText("You left off 1h ago.");
  await expect(subtitle).not.toContainText("2w");
});

// ── RED-FIRST (review 2026-08-17 F3): the COUNT is the server census, never the page ─────────────────
// The heading counted `items.length` and appended "and more" whenever that equalled `RECENTS_LIMIT` (8) —
// a page size, not a total. So the sentence lied in BOTH directions at the page boundary: a user with
// exactly eight rooms was told there were more, and a user with eighty was told the same thing as a user
// with nine. `ChatListPage.totalCount` is a real server COUNT over the scope this page windows and rides
// the SAME cache entry. Asserted through the rendered h1 (not the new read), so these compile and fail
// against the old composition.

/** A library of N rooms. At N >= `RECENTS_LIMIT` (8) the responder serves a FULL page — `items.length`
 *  equals the requested limit — which is the exact state the old "and more" hedge fired on. */
function rooms(count: number): ScopedChatSummaryFixture[] {
  return Array.from({ length: count }, (_unused, index) =>
    makeChatSummary({ id: `chat_count_${String(index)}`, title: `Room ${String(index)}`, lastMessageAt: FROZEN_AT_MS - index }),
  );
}

test("F3 exactly a full page of rooms reads the true count, never 'and more'", async ({ mount, page }) => {
  // EIGHT is `RECENTS_LIMIT`: items.length === limit AND totalCount === 8. The page is full and the house
  // is not — the one state the old hedge got exactly backwards.
  await page.clock.setFixedTime(FROZEN_AT_MS);
  await routeTrpc(page, { "chat.listChats": chatListResponder(rooms(8)) });

  const heading = (await mount(<ChatMastheadTileStory />)).getByRole("heading", { level: 1 });

  await expect(heading).toHaveText("Eight rooms, still warm.");
  await expect(heading).not.toContainText("and more");
});

test("F3 more rooms than a page holds prints the census, not the page size", async ({ mount, page }) => {
  // Twelve rooms, eight served. The old copy said "Eight rooms and more" — the same sentence a user with
  // nine rooms got. Past ten the numeral is how the sentence reads.
  await page.clock.setFixedTime(FROZEN_AT_MS);
  await routeTrpc(page, { "chat.listChats": chatListResponder(rooms(12)) });

  const heading = (await mount(<ChatMastheadTileStory />)).getByRole("heading", { level: 1 });

  await expect(heading).toHaveText("12 rooms, still warm.");
});

test("F3 a short page spells its count (census and page agree below the limit)", async ({ mount, page }) => {
  await page.clock.setFixedTime(FROZEN_AT_MS);
  await routeTrpc(page, { "chat.listChats": chatListResponder(rooms(3)) });

  const heading = (await mount(<ChatMastheadTileStory />)).getByRole("heading", { level: 1 });

  await expect(heading).toHaveText("Three rooms, still warm.");
});

// P2-4 — a friend who has just joined a room and never spoken has left off nowhere: the masthead greets them.
test("an account that has never spoken gets the first-run title and line, never 'You left off'", async ({ mount, page }) => {
  await page.clock.setFixedTime(FROZEN_AT_MS);
  const joined = makeChatSummary({ id: "chat_joined", title: "Tavern Night", lastMessageAt: FROZEN_AT_MS - TEN_MINUTES_MS, viewerLastTurnAt: null });
  await routeTrpc(page, { "chat.listChats": chatListResponder([joined]) });

  const home = await mount(<ChatMastheadTileStory />);
  await expect(home.getByRole("heading", { level: 1 })).toHaveText("Welcome in.");
  await expect(home.getByText(LEFT_OFF)).toHaveCount(0);
});

test("F3 an empty library opens the empty house, never 'No rooms, still warm.'", async ({ mount, page }) => {
  await page.clock.setFixedTime(FROZEN_AT_MS);
  await routeTrpc(page, { "chat.listChats": chatListResponder([]) });

  const heading = (await mount(<ChatMastheadTileStory />)).getByRole("heading", { level: 1 });

  await expect(heading).toHaveText("An empty house.");
});

for (const [polarity, background, ambientBackground, ambientInk] of [
  ["light", "oklch(0.96 0.01 80)", "oklch(0.158 0.006 60)", "oklch(0.9 0.008 72)"],
  ["dark", "oklch(0.18 0.01 60)", "oklch(0.98 0.004 75)", "oklch(0.28 0.012 60)"],
] as const) {
  test(`#985 a background-only ${polarity} theme keeps Home masthead and resume subtitle above AA`, async ({ mount, page }) => {
    await page.clock.setFixedTime(FROZEN_AT_MS);
    const chat = makeChatSummary({
      id: "chat_theme_prose",
      title: "The Lantern Room",
      participantNames: ["Wren"],
      lastMessagePreview: "The lanterns answer in amber.",
    });
    await routeTrpc(page, { "chat.listChats": chatListResponder([chat]) });

    const home = await mount(<HomePartialThemeProseStory ambientBackground={ambientBackground} ambientInk={ambientInk} background={background} />);
    const mastheadSubtitle = home.getByText(LEFT_OFF);
    const resumeSubtitle = home.getByText("The lanterns answer in amber.");

    await expect(mastheadSubtitle).toBeVisible();
    await expect(resumeSubtitle).toBeVisible();
    for (const subject of [mastheadSubtitle, resumeSubtitle]) {
      const receipt = await pixelContrast(page, subject);
      expect(receipt.ratio, receipt.describe).toBeGreaterThanOrEqual(4.5);
    }
  });
}
