// CT: chat's "Recent chats" HOME tile, driven through the REAL `HomeSurface` (so the per-tile
// QueryBoundary + the kicker frame + the trailing action are the shipped ones) over the REAL data layer
// (`chat.listChats` stubbed at the network by routeTrpc).
//
// These assertions MOVED here from `chat-landing-surface.ct.tsx` when the launcher moved to home
// (owner decision H1 = D-1) — same coverage, new owner.
//
// Opening a recent is a CROSS-SECTION navigation, so the click must land the chat AND move the rail:
// asserted against the shell STORE, never a rendered echo.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatRecentsTileStory } from "../_ct-stories";
import { makeChatSummary } from "../fixtures";

const RECENT = makeChatSummary({ id: "chat_recent", title: "A grand adventure", participantNames: ["Wren"] });

test("renders the recents rows inside the tile frame", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [RECENT] });

  const home = await mount(<ChatRecentsTileStory />);
  const tile = home.locator('[data-home-tile="chat.recents"]');

  await expect(tile.getByText("Recent chats")).toBeVisible();
  await expect(tile.getByText("A grand adventure")).toBeVisible();
  await expect(tile.getByText("Wren")).toBeVisible();
  await expect(tile.getByRole("button", { name: "All chats →" })).toBeVisible();
});

test("opening a recent selects the chat AND moves the rail to chats — assert the STORE", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [RECENT] });

  const home = await mount(<ChatRecentsTileStory />);
  const probe = home.locator("output");
  await expect(probe).not.toHaveText("section=chats");

  await home.getByText("A grand adventure").click();
  await expect(probe).toHaveText("section=chats");
});

test("the trailing action jumps to the chats section", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [RECENT] });

  const home = await mount(<ChatRecentsTileStory />);
  await home.getByRole("button", { name: "All chats →" }).click();

  await expect(home.locator("output")).toHaveText("section=chats");
});

test("the rows are real LIST ITEMS, and the trailing action sits inside the tile's own named region", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [RECENT] });

  const home = await mount(<ChatRecentsTileStory />);

  // A `role="list"` whose children are generic divs announces as an empty list to AT (side-eye F4).
  await expect(home.getByRole("list", { name: "Recent chats" }).getByRole("listitem")).toHaveCount(1);
  // …and "All chats →" is announced under the tile's heading instead of standing alone as an arrow.
  await expect(home.getByRole("region", { name: "Recent chats" }).getByRole("button", { name: "All chats →" })).toBeVisible();
});

test("an empty chats list renders a TEACHING empty state with an action, not a blank tile", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.listChats": [] });

  const home = await mount(<ChatRecentsTileStory />);
  const tile = home.locator('[data-home-tile="chat.recents"]');

  await expect(tile.getByText("No chats yet")).toBeVisible();
  await expect(tile.getByRole("button", { name: "New chat" })).toBeVisible();
});
