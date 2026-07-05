// CT: the Chats-section LIST surface end-to-end. Drives the PRODUCTION path — `chat.listChats`
// (routeTrpc, an UNPAGED `ChatSummary[]`) → `useSuspenseQuery` in `<QueryBoundary>` → the row list.
// Asserts: rows render (title + participant names); selecting a row fires `onSelect` with the chat id;
// "New chat" fires `onNewChat`; the active row paints `aria-pressed`; an empty list shows its own state.
//
// NOTE (mirrors the other surface CTs): `trpc.chat.listChats` is stubbed at the NETWORK (routeTrpc) —
// the tRPC proxy builds the path structurally, so the CT runs regardless of the transport verb landing.

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

const ADVENTURE_ROW = /A grand adventure/;
const UNTITLED_ROW = /Untitled chat/;

test("renders each chat row (title + participant names), with a fallback title/subtitle", async ({
  mount,
  page,
}) => {
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

test("the New chat button fires onNewChat", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE] });

  const component = await mount(<ChatListSurfaceStory />);
  await expect(page.getByTestId("new-count")).toHaveText("0");
  await component.getByRole("button", { name: "Start a new chat" }).click();

  await expect(page.getByTestId("new-count")).toHaveText("1");
});

test("the active chat's row is marked pressed", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE, UNTITLED] });

  const component = await mount(<ChatListSurfaceStory activeChatId="chat_adventure" />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  const activeRow = page.getByRole("button", { name: ADVENTURE_ROW });
  await expect(activeRow).toHaveAttribute("aria-pressed", "true");
  const otherRow = page.getByRole("button", { name: UNTITLED_ROW });
  await expect(otherRow).toHaveAttribute("aria-pressed", "false");
});

test("an empty chats list shows the 'no chats yet' empty state", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [] });

  const component = await mount(<ChatListSurfaceStory />);

  await expect(component.getByText("No chats yet")).toBeVisible();
});
