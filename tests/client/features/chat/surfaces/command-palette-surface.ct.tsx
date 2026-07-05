// CT: the J4 ⌘K command palette end-to-end. Drives the PRODUCTION path — `chat.listChats` (routeTrpc,
// the already-cached list read) → `useSuspenseQuery` in the palette's own `<QueryBoundary>` → the cmdk
// groups. Asserts: the three groups render (Threads · Go to · Create); a thread row + the go-to section
// rows + the create rows render; the search input filters across groups.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { CommandPaletteSurfaceStory } from "../_ct-stories";
import { makeChatSummary } from "../fixtures";

const ADVENTURE = makeChatSummary({
  id: "chat_adventure",
  title: "A grand adventure",
  participantNames: ["Aria Nightshade"],
});

test("renders the Threads / Go to / Create groups with their rows", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE] });

  const component = await mount(<CommandPaletteSurfaceStory />);

  await expect(component.getByText("Threads")).toBeVisible();
  await expect(component.getByText("A grand adventure")).toBeVisible();
  await expect(component.getByText("Go to")).toBeVisible();
  // The route-supplied go-to sections (CT literal: Chats · Characters · Corpus).
  await expect(page.getByRole("option", { name: "Corpus" })).toBeVisible();
  await expect(component.getByText("Create")).toBeVisible();
  await expect(page.getByRole("option", { name: "New chat" })).toBeVisible();
  await expect(page.getByRole("option", { name: "New character" })).toBeVisible();
});

test("the search input filters rows across groups (matches on thread title)", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { "chat.listChats": [ADVENTURE] });

  const component = await mount(<CommandPaletteSurfaceStory />);
  await expect(component.getByText("A grand adventure")).toBeVisible();

  // cmdk owns the input's ARIA (combobox); there is exactly one per surface (its own CT queries it
  // name-less too — the aria-label doesn't resolve as the accessible name through cmdk's wiring).
  await component.getByRole("combobox").fill("grand");
  await expect(component.getByText("A grand adventure")).toBeVisible();
  // A non-matching row (a Create action) is filtered out by cmdk.
  await expect(page.getByRole("option", { name: "New character" })).toBeHidden();
});

test("an empty thread list still renders the Go to + Create groups", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [] });

  const component = await mount(<CommandPaletteSurfaceStory />);

  await expect(component.getByText("Go to")).toBeVisible();
  await expect(component.getByText("Create")).toBeVisible();
  await expect(page.getByText("Threads")).toBeHidden();
});
