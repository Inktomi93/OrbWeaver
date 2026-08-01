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
// F7 state rows: the summary already carries star/archived — the row must SHOW them.
const STARRED = makeChatSummary({ id: "chat_starred", title: "A pinned thread", star: true });
const ARCHIVED = makeChatSummary({ id: "chat_archived", title: "A shelved thread", archived: true });

// The character library the portrait map resolves against: Aria has a face, the faceless one doesn't.
const CHARACTERS = {
  items: [
    { id: "char_aria", name: "Aria Nightshade", avatarHash: "hash_aria" },
    { id: "char_faceless", name: "Faceless", avatarHash: null },
  ],
};
const AVATAR_IMAGE = '[data-slot="avatar-image"]';
const LIST_ROW_ROOT = '[data-slot="list-row-root"]';
const ARIA_BLOB_RE = /\/api\/blob\/hash_aria$/u;
/** The archived row's receded skin — the visual reinforcement of the "Archived" text datum. */
const RECEDED_RE = /opacity-60/u;
// Base UI's Avatar mounts `avatar-image` only once the image reaches "loaded" status, so the blob route is
// fulfilled with a real 1×1 PNG (the message-row.ct.tsx precedent).
const ONE_BY_ONE_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

// EXACT row names — the row button's accessible name is now the TITLE ALONE (finding #1: subtitle rides
// aria-describedby, not the name). A loose /regex/ would ALSO match the per-row kebab, whose label is now
// "Chat actions for <title>" (finding #4), so pin the row by its exact name.
const ADVENTURE_ROW = "A grand adventure";
const UNTITLED_ROW = "Untitled chat";

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
  // Finding #4: the kebab is named after the row ("Chat actions for <title>"), not a bare, indistinguishable
  // "Chat actions" repeated N times — so N chat rows expose N distinct menu-trigger names.
  await component.getByRole("button", { name: "Chat actions for A grand adventure", exact: true }).click();

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
  const images = component.locator(AVATAR_IMAGE);
  await expect(images).toHaveCount(1);
  await expect(images).toHaveAttribute("src", ARIA_BLOB_RE);
  // …and the participant-less row still renders (its avatar is the hue-seeded initials fallback, no <img>).
  await expect(page.getByText("Untitled chat")).toBeVisible();
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

test("starred and archived rows say so in ACCESSIBLE content, and the archived row recedes (F7)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE, STARRED, ARCHIVED], "character.list": CHARACTERS });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(component.getByText("A pinned thread")).toBeVisible();

  // The star is an Icon with an accessible label (a11y-datum rule: state is never color-only) — exactly one.
  await expect(component.getByLabel("Starred")).toHaveCount(1);
  // Archived is TEXT, not just a dimming.
  await expect(component.getByText("Archived", { exact: true })).toHaveCount(1);
  // …and the dimming is the reinforcement: the archived row's root carries the receded class, others don't.
  const archivedRow = component.locator(LIST_ROW_ROOT, { hasText: "A shelved thread" });
  await expect(archivedRow).toHaveClass(RECEDED_RE);
  const plainRow = component.locator(LIST_ROW_ROOT, { hasText: "A grand adventure" });
  await expect(plainRow).not.toHaveClass(RECEDED_RE);
});

test("an empty chats list shows the 'no chats yet' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [] });

  const component = await mount(<ChatListSurfaceStory />);

  await expect(component.getByText("No chats yet")).toBeVisible();
});
