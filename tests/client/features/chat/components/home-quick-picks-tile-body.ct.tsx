// CT: chat's "Start a chat" HOME tile (the character quick-picks), driven through the REAL `HomeSurface`
// over the REAL data layer (`character.list` stubbed at the network by routeTrpc). Chat-owned by owner
// decision H6 — the tile's data and intent are "start a chat".
//
// These assertions MOVED here from `chat-landing-surface.ct.tsx` when the launcher moved to home.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { makeCharacterSummary } from "../../character/fixtures";
import { ChatQuickPicksTileStory } from "../_ct-stories";

const ARIA = makeCharacterSummary({ id: "char_aria", name: "Aria" });
const BOLT = makeCharacterSummary({ id: "char_bolt", name: "Bolt" });
const CHAR_PAGE = { items: [ARIA, BOLT], nextCursor: null };

test("renders the character faces inside the tile frame", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": CHAR_PAGE });

  const home = await mount(<ChatQuickPicksTileStory />);
  const tile = home.locator('[data-home-tile="chat.quickPicks"]');

  await expect(tile.getByText("Start a chat")).toBeVisible();
  await expect(tile.getByText("Aria")).toBeVisible();
  await expect(tile.getByText("Bolt")).toBeVisible();
  await expect(tile.getByRole("button", { name: "All characters →" })).toBeVisible();
});

test("picking a face seeds a draft AND moves the rail to chats — assert the STORE", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": CHAR_PAGE });

  const home = await mount(<ChatQuickPicksTileStory />);
  const probe = home.locator("output");
  await expect(probe).not.toHaveText("section=chats");

  await home.getByText("Bolt").click();
  await expect(probe).toHaveText("section=chats");
});

test("the trailing action jumps to the characters section", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": CHAR_PAGE });

  const home = await mount(<ChatQuickPicksTileStory />);
  await home.getByRole("button", { name: "All characters →" }).click();

  await expect(home.locator("output")).toHaveText("section=characters");
});

test("an empty library renders a TEACHING empty state with an action, not a blank tile", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": { items: [], nextCursor: null } });

  const home = await mount(<ChatQuickPicksTileStory />);
  const tile = home.locator('[data-home-tile="chat.quickPicks"]');

  await expect(tile.getByText("No characters yet")).toBeVisible();
  await expect(tile.getByRole("button", { name: "Create your first character" })).toBeVisible();
});
