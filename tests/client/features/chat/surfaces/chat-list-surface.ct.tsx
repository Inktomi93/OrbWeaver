// CT: the Chats-section LIST surface end-to-end (UIP-301/302/303 + J5). Drives the PRODUCTION path —
// `chat.listChats` (routeTrpc, an UNPAGED `ChatSummary[]`) → `useSuspenseQuery` in `<QueryBoundary>` →
// the `@orb/ui/list-row` rows. Asserts: rows render (title + participant names); selecting a row fires
// `onSelect` with the chat id; the empty-state New button fires `onNewChat` (the header New moved to the
// LIST chrome band — chat-list-header.tsx); the search field filters client-side; the active row paints
// `aria-current`; the per-row kebab opens the actions menu; an empty list shows its own state.
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
});
const UNTITLED = makeChatSummary({
  id: "chat_untitled",
  title: null,
  participantNames: [],
});

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

test("an empty chats list shows the 'no chats yet' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [] });

  const component = await mount(<ChatListSurfaceStory />);

  await expect(component.getByText("No chats yet")).toBeVisible();
});
