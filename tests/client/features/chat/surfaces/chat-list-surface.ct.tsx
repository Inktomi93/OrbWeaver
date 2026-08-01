// CT: the Chats-section LIST surface end-to-end (UIP-301/302/303 + J5). Drives the PRODUCTION path —
// `chat.listChats` (routeTrpc, an UNPAGED `ChatSummary[]`) → `useSuspenseQuery` in `<QueryBoundary>` →
// the `@orb/ui/list-row` rows. Asserts: rows render (title + participant names); selecting a row fires
// `onSelect` with the chat id; the empty-state New button fires `onNewChat` (the header New moved to the
// LIST chrome band — chat-list-header.tsx); the search field filters client-side; the active row paints
// `aria-current`; the per-row kebab opens the actions menu; an empty list shows its own state.
//
// Also pins F7 (visual-blech audit): a real participant PORTRAIT resolved off `participantCharacterIds` ×
// the character list, the initials fallback when nothing resolves, and the star/archived state markers.
//
// NOTE (mirrors the other surface CTs): `trpc.chat.listChats` is stubbed at the NETWORK (routeTrpc) — the
// tRPC proxy builds the path structurally, so the CT runs regardless of the transport verb landing.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatListSurfaceStory } from "../_ct-stories";
import { makeChatSummary } from "../fixtures";

const ADVENTURE = makeChatSummary({
  id: "chat_adventure",
  title: "A grand adventure",
  participantNames: ["Aria Nightshade"],
  participantCharacterIds: ["char_aria"],
});
const UNTITLED = makeChatSummary({
  id: "chat_untitled",
  title: null,
  participantNames: [],
});
// The two scent fields: the server-resolved snippet (long enough that it MUST clip) + the game marker.
const GAME = makeChatSummary({
  id: "chat_game",
  title: "The Ashfell run",
  participantNames: ["Aria Nightshade"],
  lastMessagePreview: "The door gives way and the market noise floods in from the street beyond, louder than anything you have…",
  isGame: true,
});
// F7 state rows: the summary already carries star/archived — the row must SHOW them.
const STARRED = makeChatSummary({ id: "chat_starred", title: "A pinned thread", star: true });
const ARCHIVED = makeChatSummary({ id: "chat_archived", title: "A shelved thread", archived: true });

// A 3-seat room — D3: it must lead with an AvatarStack, not borrow one member's portrait.
const GROUP = makeChatSummary({
  id: "chat_group",
  title: "The Crimson Court",
  participantNames: ["Aria Nightshade", "Sera", "Niko"],
  participantCharacterIds: ["char_aria", "char_sera", "char_niko"],
});

// The character library the portrait map resolves against: Aria has a face, the faceless one doesn't.
const CHARACTERS = {
  items: [
    { id: "char_aria", name: "Aria Nightshade", avatarHash: "hash_aria" },
    { id: "char_faceless", name: "Faceless", avatarHash: null },
    { id: "char_sera", name: "Sera", avatarHash: null },
    { id: "char_niko", name: "Niko", avatarHash: null },
  ],
};
const AVATAR_IMAGE = '[data-slot="avatar-image"]';
const AVATAR_STACK = '[data-slot="avatar-stack-root"]';
const LIST_ROW_ROOT = '[data-slot="list-row-root"]';
const SUBTITLE = '[data-slot="list-row-subtitle"]';
const ARIA_BLOB_RE = /\/api\/blob\/hash_aria$/u;
/** The archived row's receded skin — the visual reinforcement of the "Archived" text datum. */
const RECEDED_RE = /opacity-60/u;
/** A PRESSED star toggle's accessible name (§12 — the un-set verb names the on state). */
const ANY_PRESSED_STAR = /^Unstar /u;
// Base UI's Avatar mounts `avatar-image` only once the image reaches "loaded" status, so the blob route is
// fulfilled with a real 1×1 PNG (the message-row.ct.tsx precedent).
const ONE_BY_ONE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

// EXACT row names — the row button's accessible name is now the TITLE ALONE (finding #1: subtitle rides
// aria-describedby, not the name). A loose /regex/ would ALSO match the per-row kebab, whose label is now
// "Chat actions for <title>" (finding #4), so pin the row by its exact name.
const ADVENTURE_ROW = "A grand adventure";
const UNTITLED_ROW = "Untitled chat";

// ACTION names carry the row's own recency stamp after the title (side-eye P3a — N rows titled "Azarael"
// in the character projection produced N identical menu names). The stamp is clock-relative, so the CTs pin
// the SHAPE (a prefix) and the DISTINCTNESS, never the literal elapsed text.
const ADVENTURE_MENU = /^Chat actions for "A grand adventure" · /u;
const ADVENTURE_STAR = /^Star "A grand adventure" · /u;
const PINNED_UNSTAR = /^Unstar "A pinned thread" · /u;

test("renders each chat row (title + participant names), with a fallback title/subtitle", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE, UNTITLED] });

  const component = await mount(<ChatListSurfaceStory />);

  await expect(component.getByText("A grand adventure")).toBeVisible();
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  // The null-title / empty-roster row falls back to honest placeholders.
  await expect(page.getByText("Untitled chat")).toBeVisible();
  await expect(page.getByText("No characters")).toBeVisible();
});

test("selecting a row fires onSelect with that chat's id", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE, UNTITLED] });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();
  await component.getByText("A grand adventure").click();

  await expect(page.getByTestId("selected")).toHaveText("chat_adventure");
});

test("the empty-state New button fires onNewChat (the J2 picker trigger)", async ({ mount, page }) => {
  // The header New moved to the LIST chrome band (`chat-list-header.tsx`, north-star §4 N2) — outside this
  // surface. The surface's own `onNewChat` wiring now lives on the empty-state News, exercised here.
  await routeTrpc(page, { "chat.listChats": [] });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(page.getByTestId("new-count")).toHaveText("0");
  await component.getByRole("button", { name: "New chat" }).click();

  await expect(page.getByTestId("new-count")).toHaveText("1");
});

test("the search field filters the rows client-side (title + participants)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE, UNTITLED] });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  await component.getByRole("textbox", { name: "Search chats" }).fill("aria");
  await expect(component.getByText("A grand adventure")).toBeVisible();
  await expect(page.getByText("Untitled chat")).toBeHidden();
});

test("the active chat's row is marked current", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE, UNTITLED] });

  const component = await mount(<ChatListSurfaceStory activeChatId="chat_adventure" />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  const activeRow = page.getByRole("button", { name: ADVENTURE_ROW, exact: true });
  await expect(activeRow).toHaveAttribute("aria-current", "true");
  const otherRow = page.getByRole("button", { name: UNTITLED_ROW, exact: true });
  await expect(otherRow).not.toHaveAttribute("aria-current", "true");
});

test("the per-row kebab opens the actions menu", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE] });

  const component = await mount(<ChatListSurfaceStory />);
  // Finding #4: the kebab is named after the row ("Chat actions for <title> · <stamp>"), not a bare,
  // indistinguishable "Chat actions" repeated N times — so N chat rows expose N distinct menu-trigger names.
  // The cluster rests hidden + inert (P3b), so reach it the way a user does: hover the row first.
  await component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" }).hover();
  await component.getByRole("button", { name: ADVENTURE_MENU }).click();

  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Star" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Archive" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

test("a chat with a portrait-owning participant renders the REAL portrait; the others keep the initials blob (F7)", async ({ mount, page }) => {
  await page.route("**/api/blob/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: ONE_BY_ONE_PNG }));
  await routeTrpc(page, { "chat.listChats": [ADVENTURE, UNTITLED], "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  // Exactly ONE row resolved a face — the row whose participantCharacterIds hit an avatar-owning character.
  // Scoped to the ROWS: the Arm B faces strip above them paints the same portrait as a shortcut.
  const images = component.locator(LIST_ROW_ROOT).locator(AVATAR_IMAGE);
  await expect(images).toHaveCount(1);
  await expect(images).toHaveAttribute("src", ARIA_BLOB_RE);
  // …and the participant-less row still renders (its avatar is the hue-seeded initials fallback, no <img>).
  await expect(page.getByText("Untitled chat")).toBeVisible();
});

test("D3 a MULTI-SEAT room leads with an AvatarStack (shared, not one member's face); a 1:1 keeps its portrait", async ({ mount, page }) => {
  await page.route("**/api/blob/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: ONE_BY_ONE_PNG }));
  await routeTrpc(page, {
    "chat.listChats": [GROUP, ADVENTURE],
    "character.list": CHARACTERS,
  });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("The Crimson Court")).toBeVisible();

  // Exactly ONE row stacks — the 3-seat room — and the stack names its cast for a screen reader.
  const stack = component.locator(AVATAR_STACK);
  await expect(stack).toHaveCount(1);
  await expect(component.locator(LIST_ROW_ROOT, { hasText: "The Crimson Court" }).locator(AVATAR_STACK)).toBeVisible();
  await expect(stack.getByLabel("Aria Nightshade")).toBeVisible();
  // The single-seat row is untouched: one plain avatar, no stack.
  await expect(component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" }).locator(AVATAR_STACK)).toHaveCount(0);
});

test("a chat whose participants own no portrait falls back to initials (no broken image element)", async ({ mount, page }) => {
  await page.route("**/api/blob/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: ONE_BY_ONE_PNG }));
  await routeTrpc(page, {
    "chat.listChats": [makeChatSummary({ id: "chat_faceless", title: "Faceless chat", participantCharacterIds: ["char_faceless"] })],
    "character.list": CHARACTERS,
  });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("Faceless chat")).toBeVisible();
  await expect(component.locator(AVATAR_IMAGE)).toHaveCount(0);
});

test("§12 the star is the row's state TOGGLE, and clicking it fires the star MUTATION with the row's id", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, { "chat.listChats": [ADVENTURE, STARRED], "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A pinned thread")).toBeVisible();

  // One element, marker + affordance: the starred row announces pressed under the un-set name.
  const starred = component.getByRole("button", { name: PINNED_UNSTAR });
  await expect(starred).toHaveAttribute("aria-pressed", "true");
  const unstarred = component.getByRole("button", { name: ADVENTURE_STAR });
  await expect(unstarred).toHaveAttribute("aria-pressed", "false");

  // Assert the MUTATION fired (not a UI reaction — the row is bus-driven, so the optimistic repaint is
  // not the thing under test): the click hits `chat.star` with THIS row's id and the flipped value.
  await component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" }).hover();
  await unstarred.click();
  await expect.poll(() => recorder.lastInput("chat.star")).toEqual({ chatId: "chat_adventure", star: true });
  // ONESHOT-OK: settled — the recorded input above proves the request already landed, so the COUNT for that
  // same procedure is final at this point (a second fire would need another click).
  expect(recorder.count("chat.star")).toBe(1);
});

test("§12 the kebab KEEPS its Star item beside the inline toggle (N3 mirror parity)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE] });

  const component = await mount(<ChatListSurfaceStory />);
  const row = component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" });
  await row.hover();
  await expect(component.getByRole("button", { name: ADVENTURE_STAR })).toBeVisible();

  await component.getByRole("button", { name: ADVENTURE_MENU }).click();
  // Inline is a SHORTCUT, never the only path — everything stays reachable from one menu.
  await expect(page.getByRole("menuitem", { name: "Star" })).toBeVisible();
});

test("starred and archived rows say so in ACCESSIBLE content, and the archived row recedes (F7)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE, STARRED, ARCHIVED], "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A pinned thread")).toBeVisible();

  // The star is now the §12 pressable, so the state datum is its `aria-pressed` name — exactly one row
  // carries it, and the un-set rows announce the set verb instead.
  await expect(component.getByRole("button", { name: ANY_PRESSED_STAR })).toHaveCount(1);
  // Archived is TEXT, not just a dimming.
  await expect(component.getByText("Archived", { exact: true })).toHaveCount(1);
  // …and the dimming is the reinforcement: the archived row's root carries the receded class, others don't.
  const archivedRow = component.locator(LIST_ROW_ROOT, { hasText: "A shelved thread" });
  await expect(archivedRow).toHaveClass(RECEDED_RE);
  const plainRow = component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" });
  await expect(plainRow).not.toHaveClass(RECEDED_RE);
});

test("the SCENT line wins the subtitle and stays ONE truncated line; the GAME marker is labelled text (not color)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [GAME, ADVENTURE] });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("The Ashfell run")).toBeVisible();

  // The snippet REPLACES the participants line on a chat with history; the plain row keeps its identity line.
  await expect(component.getByText("The door gives way", { exact: false })).toBeVisible();
  await expect(component.getByText("Aria Nightshade", { exact: true })).toHaveCount(1);
  // done ≠ rendered: the long snippet must actually be clipped to one line, not wrap the row open.
  const subtitle = component.locator(LIST_ROW_ROOT, { hasText: "The Ashfell run" }).locator(SUBTITLE);
  const clipping = await subtitle.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      whiteSpace: s.whiteSpace,
      overflow: s.overflow,
      textOverflow: s.textOverflow,
      lines: Math.round(el.getBoundingClientRect().height / Number.parseFloat(s.lineHeight)),
    };
  });
  expect(clipping).toEqual({ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lines: 1 });

  // The game marker is a labelled glyph — the datum is TEXT for a screen reader — and only the game row has it.
  await expect(component.getByLabel("Game chat")).toHaveCount(1);
  const gameRow = component.locator(LIST_ROW_ROOT, { hasText: "The Ashfell run" });
  await expect(gameRow.getByLabel("Game chat")).toBeVisible();
});

// ── Arm B: the chats pane learns FACES (list-pane-projection §5.2) ─────────────────────────────────
// Tapping a face rides the LANDED filter-chip seam — the same pane becomes her threads, visibly "filtered
// by" a chip you can clear, never a second list that owns her chats (the D18 grammar).

test("Arm B: the faces strip curates the recent cast, and tapping one SCOPES the pane through the filter chip", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [GROUP, ADVENTURE, UNTITLED], "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("The Crimson Court")).toBeVisible();

  const face = component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true });
  await expect(face).toBeVisible();
  await face.click();

  // The chip is the visible scope, and the rows narrowed to hers — the untitled (seat-less) row is gone.
  await expect(component.getByText("Filtered:")).toBeVisible();
  await expect(component.getByText("Aria Nightshade", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Untitled chat")).toHaveCount(0);
  await expect(face).toHaveAttribute("aria-current", "true");
});

// Mock order (side-eye P2b/P2a): the faces are the shortcut you arrive for, so the strip is the FIRST thing
// in the pane — above the scope chip and the search box — and each face is CAPTIONED, because a portrait
// alone is not a name.
test("Arm B: the strip is the pane's FIRST element (above chip + search) and its faces are captioned", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE, UNTITLED], "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  const face = component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true });
  await expect(face).toBeVisible();
  // The caption is real text under the portrait, not just the accessible name.
  await expect(face.getByText("Aria Nightshade", { exact: true })).toBeVisible();

  // DOM order is the reading order: strip → (chip) → search. Compare positions, not classes.
  await face.click();
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const all = [...document.querySelectorAll("*")];
          const at = (el: Element | null | undefined): number => (el === null || el === undefined ? -1 : all.indexOf(el));
          const strip = at(document.querySelector('[aria-label="Recent characters"]'));
          const chip = at(all.find((el) => el.textContent === "Filtered:"));
          const search = at(document.querySelector('input[aria-label="Search chats"]'));
          return { stripBeforeChip: strip >= 0 && chip > strip, stripBeforeSearch: strip >= 0 && search > strip };
        }),
      { intervals: [20, 50, 100] },
    )
    .toEqual({ stripBeforeChip: true, stripBeforeSearch: true });
});

test("Arm B: re-tapping the scoping face clears the scope (the same toggle its aria-current announces)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE, UNTITLED], "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  const face = component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true });
  await face.click();
  await expect(page.getByText("Untitled chat")).toHaveCount(0);

  await face.click();
  await expect(component.getByText("Filtered:")).toHaveCount(0);
  await expect(page.getByText("Untitled chat")).toBeVisible();
});

test("Arm B: the strip STAYS while a scope is empty — it is the way out, not a dead end", async ({ mount, page }) => {
  // Aria's only seat is on a chat that is filtered out by the search, so the scoped list goes empty.
  await routeTrpc(page, { "chat.listChats": [ADVENTURE, UNTITLED], "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true }).click();
  await component.getByRole("textbox", { name: "Search chats" }).fill("zzz-no-such-chat");

  await expect(component.getByText("No matches")).toBeVisible();
  await expect(component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true })).toBeVisible();
});

test("an empty chats list shows the 'no chats yet' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [] });

  const component = await mount(<ChatListSurfaceStory />);

  await expect(component.getByText("No chats yet")).toBeVisible();
});
