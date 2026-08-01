// CT: chat's "Start a chat" HOME tile (the character quick-picks), driven through the REAL `HomeSurface`
// over the REAL data layer (`character.list` stubbed at the network by routeTrpc). Chat-owned by owner
// decision H6 — the tile's data and intent are "start a chat".
//
// These assertions MOVED here from `chat-landing-surface.ct.tsx` when the launcher moved to home.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { makeCharacterSummary, makeTagFixture } from "../../character/fixtures";
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

test("each row carries an HONEST tagline off the summary it already reads — pitch → tag line → handle", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.list": {
      items: [
        makeCharacterSummary({ id: "char_pitch", name: "Pitched", elevatorPitch: "The winter-court envoy" }),
        makeCharacterSummary({ id: "char_tags", name: "Tagged", tags: [makeTagFixture({ id: "t1", name: "noir" })] }),
        makeCharacterSummary({ id: "char_bare", name: "Bare", handle: "bare_handle" }),
      ],
      nextCursor: null,
    },
  });

  const home = await mount(<ChatQuickPicksTileStory />);
  const tile = home.locator('[data-home-tile="chat.quickPicks"]');

  // Never invented copy: the distilled pitch when it exists, else the visible tag line, else the handle.
  await expect(tile.getByText("The winter-court envoy")).toBeVisible();
  await expect(tile.getByText("noir")).toBeVisible();
  await expect(tile.getByText("bare_handle")).toBeVisible();
});

test("the rows are real LIST ITEMS inside the list — a role=list of generic divs announces empty", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": CHAR_PAGE });

  const home = await mount(<ChatQuickPicksTileStory />);

  await expect(home.getByRole("list", { name: "Character quick-picks" }).getByRole("listitem")).toHaveCount(2);
});

test("the tile's trailing action lives INSIDE the tile's own named region — '→' is never an orphan", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": CHAR_PAGE });

  const home = await mount(<ChatQuickPicksTileStory />);

  await expect(home.getByRole("region", { name: "Start a chat" }).getByRole("button", { name: "All characters →" })).toBeVisible();
});

test("an empty library renders a TEACHING empty state with an action, not a blank tile", async ({ mount, page }) => {
  await routeTrpc(page, { "character.list": { items: [], nextCursor: null } });

  const home = await mount(<ChatQuickPicksTileStory />);
  const tile = home.locator('[data-home-tile="chat.quickPicks"]');

  await expect(tile.getByText("No characters yet")).toBeVisible();
  await expect(tile.getByRole("button", { name: "Create your first character" })).toBeVisible();
});
