// CT: the J2 new-chat character picker end-to-end. Drives the PRODUCTION path — `character.list`
// (routeTrpc, one bounded page) → `useSuspenseQuery` in `<QueryBoundary>` → the cmdk multi-select list.
// Asserts: character rows render; the "Blank chat" escape hatch is present; the confirm item's label
// reflects the live selection count (proving the multi-select toggle is wired); the search reaches the
// SERVER (owner ruling 2026-08-13) — this picker used to be ONE `limit: 100` page filtered by cmdk, so a
// character past the hundredth card could not be found here at all while she sat in the library.

import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { testId } from "../../../../../packages/client/src/lib/test-ids.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { characterListResponder, makeCharacterSummary } from "../../character/fixtures.ts";
import { CreateOnStartClickStory, NewChatPickerStory } from "../_ct-stories.tsx";
import { makeMessagesPage } from "../fixtures.ts";

const ARIA = makeCharacterSummary({ id: "char_aria", name: "Aria" });
const BOLT = makeCharacterSummary({ id: "char_bolt", name: "Bolt" });

const charPage = { items: [ARIA, BOLT], nextCursor: null, totalCount: 2 };

test("renders the character rows + the Blank chat escape hatch", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": charPage });

  const component = await mount(<NewChatPickerStory />);

  await expect(component.getByText("Aria")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(page.getByText("Blank chat")).toBeVisible();
});

test("the confirm item's label reflects the multi-select count", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": charPage });

  const component = await mount(<NewChatPickerStory />);
  // Nothing picked yet — the confirm item teaches.
  await expect(component.getByText("Pick a character to start")).toBeVisible();

  await component.getByText("Aria").click();
  await expect(page.getByText("Start chat with 1 character")).toBeVisible();

  await component.getByText("Bolt").click();
  await expect(page.getByText("Start chat with 2 characters")).toBeVisible();
});

test("the search input filters the character rows", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": characterListResponder([ARIA, BOLT]) });

  const component = await mount(<NewChatPickerStory />);
  await expect(component.getByText("Aria")).toBeVisible();

  // cmdk owns the input's ARIA (combobox); there is exactly one per surface (its own CT queries it
  // name-less too — the aria-label doesn't resolve as the accessible name through cmdk's wiring).
  await component.getByRole("combobox").fill("bolt");
  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(page.getByText("Aria")).toBeHidden();
});

// THE OWNER'S SECOND P1 SURFACE: the picker's own bounded page. The pin is a character who is NOT on the
// first page — under the old one-page-plus-cmdk shape she was unreachable from "new chat" no matter what
// was typed, which is exactly how the owner "found her in the new-chat window" only by luck.
const DEEP_LIBRARY = [
  ...Array.from({ length: 120 }, (_unused, at) => makeCharacterSummary({ id: `char_bulk_${String(at)}`, name: `Bulk ${String(at)}` })),
  makeCharacterSummary({ id: "char_deep", name: "Zephyrine" }),
];

test("typing reaches the WHOLE library — a character past the first page is findable", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "character.list": characterListResponder(DEEP_LIBRARY) });

  const component = await mount(<NewChatPickerStory />);
  await expect(component.getByText("Bulk 0")).toBeVisible();
  // She is beyond the picker's page ceiling, so she is NOT in the DOM to be filtered client-side.
  await expect(component.getByText("Zephyrine")).toHaveCount(0);

  await component.getByRole("combobox").fill("zephyr");

  await expect.poll(() => (trpc.lastInput("character.list") as { search?: string } | undefined)?.search, { intervals: [50, 100, 200] }).toBe("zephyr");
  await expect(component.getByText("Zephyrine")).toBeVisible();
});

// ── CREATE-ON-START-CLICK (chat-creation-draft-mode-replacement.md §4.1/§4.11 R1) ────────────────────
//
// The Start affordance calls the REAL `chat.startChat` and navigates into the REAL room; the parallel
// draft-mode client runtime stops being the path. Both pins assert through affordances that exist in BOTH
// worlds, so they are defect proofs rather than build errors:
//   · the room's ⋯ menu "Rename" item — DISABLED on a draft (no server row to rename), enabled on a real
//     room. Same label, same aria-disabled attribute, in both shapes.
//   · the composer's own text — the §2.7 collision: `draftKey` was a MODULE COUNTER (`draft-N`) that resets
//     on reload, while `composer-draft-store` PERSISTS non-empty text under that key. Seed a previous
//     session's blob at `draft-2` (the first key `startNewChat` ever mints) and the first fresh room of the
//     next session inherits a stranger's unsent text. Keyed by the real ChatId the collision is
//     unrepresentable — there is no counter left to collide.

const CREATED_CHAT_ID = castId<ChatId>("chat_ct_created_on_start");

const CREATED_CHAT_DETAIL = {
  id: CREATED_CHAT_ID,
  title: null,
  participants: [],
  anchorPersonaId: null,
  cast: [],
  group: DEFAULT_GROUP_CONFIG,
  temporary: false,
  viewerIsHost: true,
  roomOverrides: {},
  background: null,
  rpg: null,
};

// The divider's present-tense preview — an unlisted-proc `null` is out-of-contract there and crashes the
// transcript (the chat-room-surface.ct.tsx note).
const PREVIEW_FIT_STUB = {
  boundaryMessageId: null,
  usedTokens: 0,
  ceilingTokens: 32_768,
  ceilingEstimated: false,
  reserveOutputTokens: 2048,
  droppedCount: 0,
  compactSummary: null,
};

/** Everything a created room needs to paint: the row itself (as `startChat`'s response AND as the read),
 *  its empty canon, and the fit preview. */
const CREATED_ROOM_ROUTES = {
  "character.list": { items: [ARIA, BOLT], nextCursor: null, totalCount: 2 },
  "chat.startChat": { chat: CREATED_CHAT_DETAIL, opening: null },
  "chat.getChat": CREATED_CHAT_DETAIL,
  "chat.listMessages": (): unknown => makeMessagesPage([]),
  "chat.previewContextFit": (): unknown => PREVIEW_FIT_STUB,
};

test("the Start click MINTS THE ROOM — the picker fires chat.startChat and lands in a real room, not a draft", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, CREATED_ROOM_ROUTES);

  const component = await mount(<CreateOnStartClickStory />);
  await page.getByText("Blank chat").click();

  // Barrier on the SETTLED rendered room (the composer is the room's own affordance), never on a request
  // count — a node-side count is not a browser-side settle.
  await expect(component.getByTestId(testId("composer"))).toBeVisible();

  // The room is REAL: "Rename" needs a server row, so a draft renders it aria-disabled with an unlock
  // reason. Enabled here is the whole claim.
  await component.getByRole("button", { name: "Chat options" }).click();
  const rename = page.getByRole("menuitem", { name: "Rename" });
  await expect(rename).toBeVisible();
  await expect(rename).not.toHaveAttribute("aria-disabled", "true");

  await expect.poll(() => trpc.count("chat.startChat"), { intervals: [20, 50, 100] }).toBe(1);
});

test("a previous session's unsent composer text CANNOT repopulate a different room (the §2.7 draftKey collision)", async ({ mount, page }) => {
  // Seeded BEFORE the page's JS runs: the store rehydrates at module init, so a post-mount write would
  // prove nothing (the composer-draft-store.ct.tsx posture). `draft-2` is the FIRST key the module counter
  // ever handed a new chat — `draft-1` was minted at module load for the landing state.
  await page.addInitScript(() => {
    const drafts = { ["draft-2"]: "a stranger's unsent line" };
    globalThis.localStorage.setItem("orb:composer-draft", JSON.stringify({ state: { drafts }, version: 1 }));
  });
  await page.reload();
  await routeTrpc(page, CREATED_ROOM_ROUTES);

  const component = await mount(<CreateOnStartClickStory />);
  await page.getByText("Blank chat").click();

  await expect(component.getByTestId(testId("composer"))).toBeVisible();
  await expect(component.getByRole("textbox", { name: "Message" })).toHaveValue("");
});
