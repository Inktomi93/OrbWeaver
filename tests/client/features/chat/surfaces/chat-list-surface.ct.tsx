// CT: the Chats-section LIST surface end-to-end (UIP-301/302/303 + J5). Drives the PRODUCTION path —
// `chat.listChats` (routeTrpc, the KEYSET page `chatListResponder` serves) → `useChatListCollection`'s
// non-suspending `useInfiniteQuery` → the `@orb/ui/list-row` rows inside `<VirtualList>`. Asserts: rows
// render (title + participant names); selecting a row fires `onSelect` with the chat id; the empty-state New
// button fires `onNewChat` (the header New moved to the LIST chrome band — chat-list-header.tsx); the search
// field narrows via the SERVER query; the active row paints `aria-current`; the per-row kebab opens the
// actions menu; an empty list shows its own state; and a deep scroll never evicts the head page.
//
// Also pins F7 (visual-blech audit): a real participant PORTRAIT resolved off `participantCharacterIds` ×
// the character list, the initials fallback when nothing resolves, and the star/archived state markers.
//
// NOTE (mirrors the other surface CTs): `trpc.chat.listChats` is stubbed at the NETWORK (routeTrpc) — the
// tRPC proxy builds the path structurally, so the CT runs regardless of the transport verb landing.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { expectInstrumentTierLive } from "../../../../support/ct/tier-liveness.ts";
import { ChatListSurfaceStory } from "../_ct-stories.tsx";
import { chatListResponder, makeChatSummary } from "../fixtures.ts";

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
const MARKERS = '[data-slot="list-row-markers"]';
const CONTENT = '[data-slot="list-row-content"]';
/** A real LIST pane width — the row's width budget is only observable at one. */
const PANE_WIDTH = 290;
/** What the row's LEADING zone legitimately costs the text column: the 32px portrait + the row's gap + its
 *  inline padding + the selection bar. Everything else belongs to the title/subtitle at rest. */
const LEADING_BUDGET_PX = 60;
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
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });

  const component = await mount(<ChatListSurfaceStory />);

  await expect(component.getByText("A grand adventure")).toBeVisible();
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  // The null-title / empty-roster row falls back to honest placeholders.
  await expect(page.getByText("Untitled chat")).toBeVisible();
  await expect(page.getByText("No characters")).toBeVisible();
});

test("selecting a row fires onSelect with that chat's id", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();
  await component.getByText("A grand adventure").click();

  await expect(page.getByTestId("selected")).toHaveText("chat_adventure");
});

test("the empty-state New button fires onNewChat (the J2 picker trigger)", async ({ mount, page }) => {
  // The header New moved to the LIST chrome band (`chat-list-header.tsx`, north-star §4 N2) — outside this
  // surface. The surface's own `onNewChat` wiring now lives on the empty-state News, exercised here.
  await routeTrpc(page, { "chat.listChats": chatListResponder([]) });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(page.getByTestId("new-count")).toHaveText("0");
  await component.getByRole("button", { name: "New chat" }).click();

  await expect(page.getByTestId("new-count")).toHaveText("1");
});

test("the search field narrows the rows — the predicate rides the SERVER query, not a client pass", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  await component.getByRole("textbox", { name: "Search chats" }).fill("aria");
  await expect(component.getByText("A grand adventure")).toBeVisible();
  await expect(page.getByText("Untitled chat")).toBeHidden();
  // The term REACHED THE SERVER (2026-08-09): a client `.filter()` over the loaded page would narrow the same
  // rows here and be blind to every chat past the keyset, so "the right rows are showing" is not the assertion
  // that distinguishes the two — the wire input is.
  await expect.poll(() => trpc.inputs("chat.listChats").some((i) => (i as { search?: string } | undefined)?.search === "aria")).toBe(true);
});

test("a SEARCH that matches nothing says NO MATCHES — never the library-empty copy", async ({ mount, page }) => {
  // THE REGRESSION THIS FENCES (found on a live drive, 2026-08-09, not by any test here): once the predicate
  // is the server's, a search that matches nothing returns a genuinely EMPTY PAGE — indistinguishable from an
  // empty library to a bare `isEmpty` check. The surface showed "No chats yet — pick a character to start your
  // first conversation" over a library full of chats. The sibling arm below only caught it by accident,
  // because it also has a character filter set and lands in a different branch.
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  await component.getByRole("textbox", { name: "Search chats" }).fill("zzz-no-such-thread");

  await expect(component.locator('[data-slot="empty-state-title"]')).toHaveText("No matches");
  await expect(component.getByText('No chat matches "zzz-no-such-thread".')).toBeVisible();
  // The way OUT is clearing the search, not starting a chat — the library is not empty.
  await expect(component.getByRole("button", { name: "Clear search" })).toBeVisible();
});

test("the active chat's row is marked current", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]) });

  const component = await mount(<ChatListSurfaceStory activeChatId="chat_adventure" />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  const activeRow = page.getByRole("button", { name: ADVENTURE_ROW, exact: true });
  await expect(activeRow).toHaveAttribute("aria-current", "true");
  const otherRow = page.getByRole("button", { name: UNTITLED_ROW, exact: true });
  await expect(otherRow).not.toHaveAttribute("aria-current", "true");
});

test("the per-row kebab opens the actions menu", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE]) });

  const component = await mount(<ChatListSurfaceStory />);
  // Finding #4: the kebab is named after the row ("Chat actions for <title> · <stamp>"), not a bare,
  // indistinguishable "Chat actions" repeated N times — so N chat rows expose N distinct menu-trigger names.
  // The cluster rests hidden + inert (P3b), so reach it the way a user does: hover the row first.
  await component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" }).hover();
  await component.getByRole("button", { name: ADVENTURE_MENU }).click();

  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Star" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Archive" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Export transcript" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

// The lifecycle one-home ruling: EXPORT homes on the row kebab (import is the band's ghost; the room
// carries no lifecycle chrome). All THREE formats the host-gated route serves are plain download links —
// a non-host member's GET 404s at the verb, so the item can't leak a plane the requester can't already
// read. `.orb.json` (R6 fidelity container, listed first) rides `?format=orb`; `.jsonl` is the default
// route (ST/share transcript); `.txt` is the reading copy.
test("§12 export homes on the row kebab — all three formats link to the host-gated download route", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE]) });

  const component = await mount(<ChatListSurfaceStory />);
  await component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" }).hover();
  await component.getByRole("button", { name: ADVENTURE_MENU }).click();
  await page.getByRole("menuitem", { name: "Export transcript" }).click();

  const orb = page.getByRole("menuitem", { name: "Whole room (.orb.json)" });
  await expect(orb).toHaveAttribute("href", "/api/export/chat/chat_adventure?format=orb");
  await expect(orb).toHaveAttribute("download", "");
  const jsonl = page.getByRole("menuitem", { name: "Transcript (.jsonl)" });
  await expect(jsonl).toHaveAttribute("href", "/api/export/chat/chat_adventure");
  await expect(jsonl).toHaveAttribute("download", "");
  await expect(page.getByRole("menuitem", { name: "Plain text (.txt)" })).toHaveAttribute("href", "/api/export/chat/chat_adventure?format=txt");
});

test("a chat with a portrait-owning participant renders the REAL portrait; the others keep the initials blob (F7)", async ({ mount, page }) => {
  await page.route("**/api/blob/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: ONE_BY_ONE_PNG }));
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]), "character.list": CHARACTERS });

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
    "chat.listChats": chatListResponder([GROUP, ADVENTURE]),
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
    "chat.listChats": chatListResponder([makeChatSummary({ id: "chat_faceless", title: "Faceless chat", participantCharacterIds: ["char_faceless"] })]),
    "character.list": CHARACTERS,
  });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("Faceless chat")).toBeVisible();
  await expect(component.locator(AVATAR_IMAGE)).toHaveCount(0);
});

test("§12 the star is the row's state TOGGLE, and clicking it fires the star MUTATION with the row's id", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE, STARRED]), "character.list": CHARACTERS });

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
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE]) });

  const component = await mount(<ChatListSurfaceStory />);
  const row = component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" });
  await row.hover();
  await expect(component.getByRole("button", { name: ADVENTURE_STAR })).toBeVisible();

  await component.getByRole("button", { name: ADVENTURE_MENU }).click();
  // Inline is a SHORTCUT, never the only path — everything stays reachable from one menu.
  await expect(page.getByRole("menuitem", { name: "Star" })).toBeVisible();
});

test("starred and archived rows say so in ACCESSIBLE content, and the archived row recedes (F7)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE, STARRED, ARCHIVED]), "character.list": CHARACTERS });

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

test("the chats pane's INSTRUMENT tier is LIVE — its rows resolve the mapped step, not the tier-less default", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE]), "character.list": CHARACTERS });
  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();
  await expectInstrumentTierLive(component);
});

// side-eye P1 (round 2): the round-1 float gate (`actionsFloat={!restVisible}`) was inert on a real chats
// list — a game / starred / archived row is the NORM, so the hover-only cluster kept reserving ~76px of the
// title column on essentially every row. The trailing zone is split now: the rest-visible markers live on
// the TITLE LINE (where the mock draws them) and the floated cluster holds controls only, so the float is
// unconditional. Measured, not classes: `done ≠ rendered`.
test.describe("P1 the trailing zone is split: markers on the title line, the CONTROL cluster floats", () => {
  test("every chat row — game, starred, archived — keeps its text column at rest, and hover shifts it 0px", async ({ mount, page }) => {
    await routeTrpc(page, { "chat.listChats": chatListResponder([GAME, STARRED, ARCHIVED, ADVENTURE]), "character.list": CHARACTERS });
    const component = await mount(<ChatListSurfaceStory width={PANE_WIDTH} />);
    await expect(component.getByText("The Ashfell run")).toBeVisible();

    // The state rows are exactly the ones the round-1 gate excluded — measure THEM.
    const rested = await component.locator(CONTENT).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
    expect(rested).toHaveLength(4);
    // The text column keeps everything the row's leading portrait and its gaps don't take — a cluster that
    // is HIDDEN at rest must spend ZERO width. Stated as "the pane minus the leading budget" rather than a
    // bare number so the row's portrait step (side-eye P2-5 unified the panes on the mock's one 32px
    // avatar) is what it tracks; the regression it guards is the ~76px an in-flow control cluster eats.
    expect(Math.min(...rested)).toBeGreaterThanOrEqual(PANE_WIDTH - LEADING_BUDGET_PX);

    // …and the reveal reflows nothing: the truncation point does not move mid-read.
    const starredRow = component.locator(LIST_ROW_ROOT, { hasText: "A pinned thread" });
    const before = await starredRow.locator(CONTENT).evaluate((el) => el.getBoundingClientRect().width);
    await starredRow.hover();
    await expect(component.getByRole("button", { name: PINNED_UNSTAR })).toBeVisible();
    const after = await starredRow.locator(CONTENT).evaluate((el) => el.getBoundingClientRect().width);
    expect(after).toBe(before);
  });

  test("the markers render IN the title line and stay accessible content (aria-describedby, not the name)", async ({ mount, page }) => {
    await routeTrpc(page, { "chat.listChats": chatListResponder([GAME, STARRED, ARCHIVED, ADVENTURE]), "character.list": CHARACTERS });
    const component = await mount(<ChatListSurfaceStory width={PANE_WIDTH} />);
    await expect(component.getByText("The Ashfell run")).toBeVisible();

    // Three marked rows, one marker slot each — and the plain row grows no empty box.
    await expect(component.locator(MARKERS)).toHaveCount(3);
    await expect(component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" }).locator(MARKERS)).toHaveCount(0);
    // The slot is INSIDE the title line, beside the stamp — not a trailing sibling zone.
    const gameRow = component.locator(LIST_ROW_ROOT, { hasText: "The Ashfell run" });
    await expect(gameRow.locator('[data-slot="list-row-title-row"]').locator(MARKERS)).toHaveCount(1);
    await expect(gameRow.locator(MARKERS).getByLabel("Game chat")).toBeVisible();
    // The datum survives for a screen reader: the row body DESCRIBES itself with the marker span.
    const describedBy = await gameRow.locator('[data-slot="list-row-body"]').getAttribute("aria-describedby");
    const markersId = await gameRow.locator(MARKERS).getAttribute("id");
    expect(markersId).not.toBeNull();
    expect((describedBy ?? "").split(" ")).toContain(markersId);
  });

  test("a starred row never paints TWO stars: the title-line marker yields to the revealed toggle", async ({ mount, page }) => {
    await routeTrpc(page, { "chat.listChats": chatListResponder([STARRED]), "character.list": CHARACTERS });
    const component = await mount(<ChatListSurfaceStory width={PANE_WIDTH} />);
    await expect(component.getByText("A pinned thread")).toBeVisible();

    // At rest the marker carries the state and the toggle is hidden (D11's invariant, in the marker slot).
    const marker = component.locator(MARKERS).getByLabel("Starred");
    const toggle = component.getByRole("button", { name: PINNED_UNSTAR });
    await expect(marker).toBeVisible();
    await expect(toggle).toHaveCSS("opacity", "0");

    // Hovered, they swap — exactly one star is painted at a time.
    await component.locator(LIST_ROW_ROOT, { hasText: "A pinned thread" }).hover();
    await expect(toggle).toHaveCSS("opacity", "1");
    await expect(marker).toBeHidden();
  });
});

test("the SCENT line wins the subtitle and stays ONE truncated line; the GAME marker is labelled text (not color)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([GAME, ADVENTURE]) });

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
  await routeTrpc(page, { "chat.listChats": chatListResponder([GROUP, ADVENTURE, UNTITLED]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("The Crimson Court")).toBeVisible();

  const face = component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true });
  await expect(face).toBeVisible();
  await face.click();

  // The chip is the visible scope, and the rows narrowed to hers — the untitled (seat-less) row is gone.
  await expect(component.getByText("Filtered:")).toBeVisible();
  await expect(component.getByText("Aria Nightshade", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Untitled chat")).toHaveCount(0);
  // `aria-pressed`, not `aria-current`: the chats strip's faces TOGGLE a filter rather than navigate, and
  // `FaceStrip` states its one fact in one vocabulary (`selectMode:"toggle"` → aria-pressed; the character
  // library's favorites strip, which OPENS an editor, keeps aria-current). The source moved in the nightly
  // fix-all; this assertion was its unswept half.
  await expect(face).toHaveAttribute("aria-pressed", "true");
});

// Mock order (side-eye P2b/P2a): the faces are the shortcut you arrive for, so the strip is the FIRST thing
// in the pane — above the scope chip and the search box — and each face is CAPTIONED, because a portrait
// alone is not a name.
test("Arm B: the strip is the pane's FIRST element (above chip + search) and its faces are captioned", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]), "character.list": CHARACTERS });

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

// ── THE RESERVED STRIP BOX (shell-perf mop, measured 2026-08-09) ───────────────────────────────────
// The strip mounted only once BOTH its reads landed (`chat.listChats` for the cast, `character.list` for
// the portraits), so on arrival it pushed the search field and the entire row list down 74px — measured on
// a live boot as a 0.0070–0.0102 layout shift, which is exactly what UI-Architecture-and-Layout §4.3 rule 7
// forbids ("never layout shift on data arrival"). The strip's height is CHROME (a kicker line + one row of
// face boxes), knowable before either read, so the pending strip now reserves it.
//
// The in-flight phase is a HELD, settled render here, never a flash to race: the route handler below sleeps
// before falling through to `routeTrpc`, so the pending geometry is read from a page that cannot settle
// early. Contention can only make that window longer.
/** Long enough that the pending phase is unmistakably observable, short enough to keep the test quick. */
const PENDING_HOLD_MS = 1200;
/** Sub-pixel equality: the reserved box is built from the settled anatomy's own tokens, so any real
 *  regression is a whole row (74px), never a rounding hair. */
const NO_MOVE_PX = 1;

test("Arm B: the strip RESERVES its box while its reads are in flight — the search field does not move on arrival", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE]), "character.list": CHARACTERS });
  await page.route("**/api/trpc/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, PENDING_HOLD_MS));
    await route.fallback();
  });

  const component = await mount(<ChatListSurfaceStory />);
  const search = component.getByRole("textbox", { name: "Search chats" });
  await expect(search).toBeVisible();
  const pendingBox = await search.boundingBox();

  // SETTLED barrier: the faces are up AND the rows rendered — the pane is done moving.
  await expect(component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true })).toBeVisible();
  await expect(component.getByText("A grand adventure")).toBeVisible();
  const settledBox = await search.boundingBox();

  expect(Math.abs((settledBox?.y ?? 0) - (pendingBox?.y ?? -1))).toBeLessThan(NO_MOVE_PX);
});

// The face-verb ambiguity (home side-eye): one rail click away, on home, the same clickable character face
// LAUNCHES a chat. The strip's kicker is therefore the VERB, not the contents — "Faces" named the picture
// and left both readings open. It is the only line a sighted user gets BEFORE committing to a click.
test("Arm B: the strip's kicker names the FILTER verb, so a face here can't read as a launcher", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  const kicker = component.getByText("Filter by character", { exact: true });
  await expect(kicker).toBeVisible();
  await expect(kicker).toHaveCSS("text-transform", "uppercase");
  // The launcher noun is gone — a face in this pane never says only what it is.
  await expect(component.getByText("Faces", { exact: true })).toHaveCount(0);
});

test("Arm B: re-tapping the scoping face clears the scope (the same toggle its aria-pressed announces)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]), "character.list": CHARACTERS });

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
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE, UNTITLED]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true }).click();
  await component.getByRole("textbox", { name: "Search chats" }).fill("zzz-no-such-chat");

  await expect(component.getByText("No matches")).toBeVisible();
  await expect(component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true })).toBeVisible();
});

test("an empty chats list shows the 'no chats yet' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([]) });

  const component = await mount(<ChatListSurfaceStory />);

  await expect(component.getByText("No chats yet")).toBeVisible();
});

// ── FACEFILT: the strip FOLDS to one row, and the roster lives behind a picker ──────────────────────
// The owner's report: nine faces already scrolled sideways on a six-character library, so the shortcut
// row had become a second thing to navigate. The strip fits the PANE now — as many faces as its measured
// width holds, everyone else behind one picker tile — and the character it is filtering by is always one
// of the faces you can see (a pane cannot be scoped by an invisible control).

/** The narrowest REAL list pane: `--dimension-panel` clamps at 17rem (272px) and `.shell-panel-body`
 *  spends `--spacing-row` (8px) of inline padding on each side. The fold is only observable at one. */
const NARROW_PANE_WIDTH = 256;
const ROSTER_SIZE = 30;
const FACE_ROW = '[aria-label="Recent characters"]';
const FACE_ITEM = "[data-face-key]";
const OVERFLOW_TILE = "Filter by another character";
/** The one roster member the strip could never reach by scrolling — the picker's proof. */
const FOLDED_NAME = "Zoltan the Unfathomable";

function rosterName(index: number): string {
  return index === ROSTER_SIZE - 1 ? FOLDED_NAME : `Face ${index}`;
}

/** A library big enough to overflow any pane — the owner's 6 characters were already too many. */
function rosterCharacters(): { readonly items: readonly { id: string; name: string; avatarHash: null }[] } {
  return { items: Array.from({ length: ROSTER_SIZE }, (_unused, index) => ({ id: `char_f${index}`, name: rosterName(index), avatarHash: null })) };
}

/** One chat per roster member, newest-first — so the curation hands the strip all 30 faces. */
function rosterChats(): readonly ReturnType<typeof makeChatSummary>[] {
  return Array.from({ length: ROSTER_SIZE }, (_unused, index) =>
    makeChatSummary({
      id: `chat_f${index}`,
      title: `Thread ${index}`,
      participantNames: [rosterName(index)],
      participantCharacterIds: [`char_f${index}`],
    }),
  );
}

test("FACEFILT: 30 recent faces fit ONE unscrolled row at the narrowest real pane; the rest fold behind the picker tile", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder(rosterChats()), "character.list": rosterCharacters() });

  const component = await mount(<ChatListSurfaceStory width={NARROW_PANE_WIDTH} />);
  // Barrier on the SETTLED folded arm — the tile only exists once the strip has measured itself.
  const tile = component.getByRole("button", { name: OVERFLOW_TILE, exact: true });
  await expect(tile).toBeVisible();

  const geometry = await component.locator(FACE_ROW).evaluate((row) => {
    const box = row.getBoundingClientRect();
    return {
      scrollWidth: Math.round(row.scrollWidth),
      clientWidth: Math.round(row.clientWidth),
      overflowX: getComputedStyle(row).overflowX,
      overhang: [...row.querySelectorAll("[data-face-key]")].map((face) => face.getBoundingClientRect().right - box.right),
    };
  });
  // The scrollbar is DEAD: nothing to scroll, and no scroller to scroll it with.
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.overflowX).toBe("hidden");
  // …and every rendered face is inside the pane, not merely un-scrollable (clipping is not fitting).
  expect(geometry.overhang.length).toBeGreaterThan(0);
  expect(geometry.overhang.length).toBeLessThan(ROSTER_SIZE);
  expect(Math.max(...geometry.overhang)).toBeLessThanOrEqual(0);

  // The count is HONEST — the tile prints exactly the number of faces it is standing in for.
  await expect(tile.getByText(`+${ROSTER_SIZE - geometry.overhang.length}`, { exact: true })).toBeVisible();
});

test("FACEFILT: a folded character picked from the roster scopes the pane AND takes a visible slot in the strip", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder(rosterChats()), "character.list": rosterCharacters() });

  const component = await mount(<ChatListSurfaceStory width={NARROW_PANE_WIDTH} />);
  const tile = component.getByRole("button", { name: OVERFLOW_TILE, exact: true });
  await expect(tile).toBeVisible();
  // She is genuinely unreachable in the strip before the pick — that is what the tile is FOR.
  await expect(component.getByRole("button", { name: `Show chats with ${FOLDED_NAME}`, exact: true })).toHaveCount(0);

  await tile.click();
  await page.getByPlaceholder("Search characters…").fill("Zoltan");
  await page.getByRole("option", { name: FOLDED_NAME }).click();

  // The pane is scoped to her…
  await expect(component.getByText("Filtered:")).toBeVisible();
  await expect(component.getByRole("button", { name: `Thread ${ROSTER_SIZE - 1}`, exact: true })).toBeVisible();
  // …and she is a FACE now, current and inside the row's box — never a filter you can't see or re-tap.
  const face = component.getByRole("button", { name: `Show chats with ${FOLDED_NAME}`, exact: true });
  await expect(face).toHaveAttribute("aria-pressed", "true");
  const inside = await component.locator(FACE_ROW).evaluate((row) => {
    const box = row.getBoundingClientRect();
    const current = row.querySelector('[aria-pressed="true"]');
    const rect = current?.getBoundingClientRect();
    return rect === undefined ? null : { left: rect.left - box.left, right: rect.right - box.right };
  });
  expect(inside).not.toBeNull();
  expect(inside?.left).toBeGreaterThanOrEqual(0);
  expect(inside?.right).toBeLessThanOrEqual(0);
  // The picker got out of the way once it did its job.
  await expect(page.getByPlaceholder("Search characters…")).toHaveCount(0);
});

test("FACEFILT: the picker tile is KEYBOARD reachable and lands focus in its search field", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder(rosterChats()), "character.list": rosterCharacters() });

  const component = await mount(<ChatListSurfaceStory width={NARROW_PANE_WIDTH} />);
  const tile = component.getByRole("button", { name: OVERFLOW_TILE, exact: true });
  await expect(tile).toBeVisible();

  // Tab from the last visible face reaches the tile — it is the strip's own trailing stop, not a
  // pointer-only affordance parked outside the tab order.
  await component.locator(`${FACE_ROW} ${FACE_ITEM}`).last().focus();
  await page.keyboard.press("Tab");
  await expect(tile).toBeFocused();
  await page.keyboard.press("Enter");

  const search = page.getByPlaceholder("Search characters…");
  await expect(search).toBeFocused();
  await page.keyboard.type("Zoltan");
  await expect(page.getByRole("option", { name: FOLDED_NAME })).toBeVisible();
});

test("FACEFILT: a cast that already fits keeps every face and grows NO picker tile (the ≤N pane is today, minus the scrollbar)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([GROUP, ADVENTURE]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByRole("button", { name: "Show chats with Aria Nightshade", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Show chats with Sera", exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Show chats with Niko", exact: true })).toBeVisible();

  await expect(component.getByRole("button", { name: OVERFLOW_TILE, exact: true })).toHaveCount(0);
  const geometry = await component.locator(FACE_ROW).evaluate((row) => ({
    scrollWidth: Math.round(row.scrollWidth),
    clientWidth: Math.round(row.clientWidth),
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
});

test("FACEFILT: no chats means NO strip at all — the picker tile never becomes a lone shell", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([]), "character.list": rosterCharacters() });

  const component = await mount(<ChatListSurfaceStory width={NARROW_PANE_WIDTH} />);
  await expect(component.getByText("No chats yet")).toBeVisible();

  await expect(component.locator(FACE_ROW)).toHaveCount(0);
  await expect(component.getByRole("button", { name: OVERFLOW_TILE, exact: true })).toHaveCount(0);
  await expect(component.getByText("Filter by character", { exact: true })).toHaveCount(0);
});

// ── THE COARSE COLLAPSE ON THE ROSTER (side-eye 2026-08-07 finding 6) ────────────────────────────────
// At a coarse pointer `ROW_REVEAL` pins the row's star toggle permanently ON and the touch floor grows it
// to 48px, so EVERY row of the 320px roster spent ~96px on an unpressed star plus the kebab while
// "Example — The Ashen Spire" got 62px of 296 and truncated to ~10 characters. The kebab already carries
// Star for both pointers (the mirror-parity ruling in chat-list-row-menu.tsx), so the inline toggle stands
// down at coarse and the kebab is the one door. The title-line ★ MARKER stays — the state never leaves the
// row, only the affordance moves, which is the half a naive collapse gets wrong.
//
// `hasTouch: true` is what flips `matchMedia("(pointer: coarse)")` in chromium; the first assertion proves
// the emulation landed before any geometry is trusted.

const PHONE_WIDTHS = [320, 375] as const;

// Hoisted (a regex literal in a test body is a per-call recompile — biome `useTopLevelRegex`).
const PINNED_ROW_RE = /A pinned thread/u;
const STAR_TOGGLE_RE = /^(?:Star|Unstar) /u;
const UNSTAR_TOGGLE_RE = /^Unstar /u;
const ROW_KEBAB_RE = /^Chat actions for/u;

test.describe("coarse roster", () => {
  test.use({ hasTouch: true });

  for (const width of PHONE_WIDTHS) {
    test(`@${width}: the inline star stands down, the kebab stays, and the title gets the width back`, async ({ mount, page }) => {
      await routeTrpc(page, { "chat.listChats": chatListResponder([STARRED, ADVENTURE]), "character.list": CHARACTERS });
      await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

      const component = await mount(<ChatListSurfaceStory width={width} />);
      const row = component.getByRole("button", { name: PINNED_ROW_RE }).first();
      await expect(row).toBeVisible();

      // The star TOGGLE is gone from the coarse row entirely (`display:none` ⇒ out of the a11y tree too).
      await expect(component.getByRole("button", { name: STAR_TOGGLE_RE })).toHaveCount(0);
      // …but the STATE is still on the row: the title-line marker survives the collapse.
      await expect(component.getByRole("img", { name: "Starred" }).first()).toBeVisible();
      // …and the verb is one tap away in the kebab, which is still there.
      const kebab = component.getByRole("button", { name: ROW_KEBAB_RE }).first();
      await expect(kebab).toBeVisible();
      await kebab.click();
      await expect(page.getByRole("menuitem", { name: "Unstar" })).toBeVisible();
    });
  }
});

// The fine-pointer roster is untouched: the toggle is the affordance, the marker swaps out from under it
// on hover, and nothing about the desktop row moved.
test("a fine pointer keeps the inline star toggle on the roster row", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([STARRED, ADVENTURE]), "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByRole("button", { name: UNSTAR_TOGGLE_RE }).first()).toBeAttached();
});

// ── THE EVICTION TRAP (the character library's "rows vanish as I scroll", live here too) ─────────────
// `useChatListCollection` shipped `maxPages: 5` (× 50 rows) beside `getPreviousPageParam: () => undefined`:
// past 250 rows TanStack dropped page 1 and NOTHING could ever fetch it back, so the top of a deep-scrolled
// chat library was gone until the query key changed. The character tab retired its identical cap on
// 2026-08-13 and left this one annotated for the chat lane; this is the pin that keeps it retired.
//
// The proof is the SCROLL BACK, not a row count at the bottom: at the tail of a virtualized list the head
// rows are legitimately unmounted either way, so "is row 1 in the DOM" cannot tell eviction from
// virtualization. Returning to the top can — an evicted head page makes chat 51 the first row of the library,
// permanently. (The chats pane prints no loaded-vs-census readout — the band's count is its own `limit: 1`
// census read — so the character library's live-region instrument does not exist here.)
const EVICTION_CHATS = 300;
const EVICTION_SCROLL_STEP_PX = 2000;
/** The poll IS the scroll loop: each attempt wheels one step and reports whether the target row has arrived,
 *  so the walk needs no `waitForTimeout` and no awaits inside a `for` (both banned in CTs, and both would be
 *  a fixed sleep standing in for the settle this actually waits on). */
const EVICTION_POLL = { intervals: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], timeout: 20_000 };
const HEAD_CHAT = "Chat 000";
const TAIL_CHAT = "Chat 299";

test("the head page is NEVER evicted — a deep scroll and back still lands on the first chat", async ({ mount, page }) => {
  // Six pages of the collection's fixed 50 — one more than the old five-page window, which is where the head
  // page used to disappear.
  const library = Array.from({ length: EVICTION_CHATS }, (_unused, at) =>
    makeChatSummary({
      id: `chat_deep_${String(at)}`,
      title: `Chat ${String(at).padStart(3, "0")}`,
      participantNames: [],
      participantCharacterIds: [],
      updatedAt: 100_000_000 - at,
    }),
  );
  await routeTrpc(page, { "chat.listChats": chatListResponder(library), "character.list": { items: [], nextCursor: null } });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText(HEAD_CHAT)).toBeVisible();

  // Walk to the tail the way a user does — each step lets the tail-fetch guard pull the next page.
  const list = component.getByRole("list", { name: "Chats" });
  await list.hover();
  const tail = component.getByText(TAIL_CHAT);
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, EVICTION_SCROLL_STEP_PX);
      return tail.count();
    }, EVICTION_POLL)
    .toBeGreaterThan(0);

  // …and back. With the cap in place this poll can never succeed: page 1 is not in the cache and there is no
  // backward fetch to bring it back, so the library now starts at "Chat 050".
  const head = component.getByText(HEAD_CHAT);
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, -EVICTION_SCROLL_STEP_PX);
      return head.count();
    }, EVICTION_POLL)
    .toBeGreaterThan(0);
});
