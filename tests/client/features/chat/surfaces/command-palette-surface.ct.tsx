// CT: the J4 ⌘K command palette end-to-end. Drives the PRODUCTION path — `chat.listChats` (routeTrpc,
// the already-cached list read) → `useSuspenseQuery` in the palette's own `<QueryBoundary>` → the cmdk
// groups, over the REAL slash-command registry the door assembles.
//
// The unification is what these tests pin: the palette's rows come from three sources with three different
// natures — Threads (a query), Go to (the section registry), and Commands (the slash-command registry the
// composer dispatches against). A command DECLARED once is therefore both typeable and discoverable, and
// a build with zero registrants degrades to exactly the two navigation groups.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { CommandPaletteSurfaceStory } from "../_ct-stories.tsx";
import { chatListResponder, makeChatSummary } from "../fixtures.ts";

const ADVENTURE = makeChatSummary({
  id: "chat_adventure",
  title: "A grand adventure",
  participantNames: ["Aria Nightshade"],
});

test("renders the Recent threads / Go to / Create groups with their rows", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE]) });

  const component = await mount(<CommandPaletteSurfaceStory />);

  await expect(component.getByText("Recent threads", { exact: true })).toBeVisible();
  await expect(component.getByText("A grand adventure")).toBeVisible();
  await expect(component.getByText("Go to")).toBeVisible();
  // The route-supplied go-to sections (CT literal: Chats · Characters · Corpus).
  await expect(page.getByRole("option", { name: "Corpus" })).toBeVisible();
  // The Create group is now the `group: "create"` slash commands the door registers (chat's /new-chat +
  // character's /new-character) — the rows a user sees are unchanged by the re-homing.
  await expect(component.getByText("Create")).toBeVisible();
  await expect(page.getByRole("option", { name: "New chat" })).toBeVisible();
  await expect(page.getByRole("option", { name: "New character" })).toBeVisible();
});

test("the search input filters rows across groups (matches on thread title)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE]) });

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
  await routeTrpc(page, { "chat.listChats": chatListResponder([]) });

  const component = await mount(<CommandPaletteSurfaceStory />);

  await expect(component.getByText("Go to")).toBeVisible();
  await expect(component.getByText("Create")).toBeVisible();
  await expect(page.getByText("Recent threads", { exact: true })).toBeHidden();
});

test("a Recent threads failure stays visible and Retry restores only that group", async ({ mount, page }) => {
  let attempts = 0;
  await routeTrpc(page, {
    "chat.listChats": (): unknown => (attempts++ === 0 ? trpcError({ message: "recent threads unavailable" }) : chatListResponder([ADVENTURE])({})),
  });

  const component = await mount(<CommandPaletteSurfaceStory />);

  await expect(component.getByText("Couldn't load recent threads.")).toBeVisible();
  await expect(component.getByRole("status")).toHaveText("Couldn't load recent threads.");
  await expect(component.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(component.getByText("Go to")).toBeVisible();
  await expect(component.getByText("Create")).toBeVisible();
  await expect(page.getByRole("option", { name: "New chat" })).toBeVisible();

  await component.getByRole("button", { name: "Retry" }).click();
  await expect(component.getByText("Recent threads", { exact: true })).toBeVisible();
  await expect(component.getByText("A grand adventure")).toBeVisible();
  await expect(component.getByText("Couldn't load recent threads.")).toBeHidden();
});

for (const key of ["Enter", "Space"] as const) {
  test(`focused Retry owns ${key} and restores Recent threads without activating a command`, async ({ mount, page }) => {
    let attempts = 0;
    await routeTrpc(page, {
      "chat.listChats": (): unknown => (attempts++ === 0 ? trpcError({ message: "recent threads unavailable" }) : chatListResponder([ADVENTURE])({})),
    });

    const component = await mount(<CommandPaletteSurfaceStory />);
    const retry = component.getByRole("button", { name: "Retry" });
    await expect(retry).toBeVisible();
    await retry.focus();
    await retry.press(key);

    await expect(component.getByText("Recent threads", { exact: true })).toBeVisible();
    await expect(component.getByText("A grand adventure")).toBeVisible();
    await expect(component.getByText("Couldn't load recent threads.")).toBeHidden();
  });
}

test("a contributed command appears in the palette and RUNS when picked", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([]) });

  const component = await mount(<CommandPaletteSurfaceStory commands="contributed" />);

  // It lands in the generic Commands bucket (its contribution declares no group) — one declaration made it
  // both palette-discoverable and composer-typeable.
  await expect(component.getByText("Commands")).toBeVisible();
  const row = page.getByRole("option", { name: "Fake contributed command" });
  await expect(row).toBeVisible();

  await row.click();
  // The runner FIRED — the palette invokes the same runner the composer's `/id` dispatch would.
  await expect(component.getByTestId("ct-palette-command-ran")).toHaveText("ran");
});

test("with ZERO registrations the palette shows exactly its native groups (no command groups at all)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": chatListResponder([ADVENTURE]) });

  const component = await mount(<CommandPaletteSurfaceStory commands="none" />);

  await expect(component.getByText("Recent threads", { exact: true })).toBeVisible();
  await expect(component.getByText("Go to")).toBeVisible();
  await expect(page.getByText("Create")).toBeHidden();
  await expect(page.getByText("Commands")).toBeHidden();
});
