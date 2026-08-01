// CT: chat's "Temp chat" HOME tile (home-section-spec §5). Driven through the REAL `HomeSurface` over the
// REAL data layer, so the per-tile QueryBoundary, the settings read, the mutation seam, and the topbar
// badge are all the shipped ones.
//
// The three things worth a wall:
//  1. the gloss renders the user's OWN TTL — a hardcoded "24h" lies the moment they change the setting;
//  2. starting a temp chat seeds `temporary: true` and moves the rail, and the DRAFT says "Temporary"
//     BEFORE any send (the flag is creation-only — a user who learns after sending cannot fix it);
//  3. the reaper actually FIRES on mount — assert the mutation reached the wire, not a UI reaction.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { ChatTempChatTileStory } from "../_ct-stories";

/** A settings blob with a caller-chosen temp-chat TTL. */
function settingsWithTtl(tempChatTtlHours: number): { userId: string; schemaVersion: number; config: unknown; updatedAt: number } {
  return {
    userId: "user_ct",
    schemaVersion: 1,
    config: { ...DEFAULT_USER_SETTINGS, chat: { ...DEFAULT_USER_SETTINGS.chat, tempChatTtlHours } },
    updatedAt: 0,
  };
}

test("the gloss renders the user's OWN TTL, never a hardcoded 24h", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": settingsWithTtl(72), "chat.reapTemporaryChats": { reaped: 0 } });

  const home = await mount(<ChatTempChatTileStory />);
  const tile = home.locator('[data-home-tile="chat.tempChat"]');

  await expect(tile.getByText("Temp chat")).toBeVisible();
  await expect(tile.getByText("72h")).toBeVisible();
});

test("starting a temp chat moves the rail to chats AND the draft says Temporary BEFORE any send", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": settingsWithTtl(24), "chat.reapTemporaryChats": { reaped: 0 } });

  const home = await mount(<ChatTempChatTileStory />);
  // Scoped to the TOPBAR: the tile's own gloss carries a sample chip showing what the badge looks like.
  const topbar = home.getByTestId("temp-topbar");
  const start = home.getByRole("button", { name: "Start a temp chat" });
  await expect(start).toBeVisible();
  // Nothing started yet ⇒ the topbar marks nothing.
  await expect(topbar.getByText("Temporary")).toHaveCount(0);

  await start.click();

  await expect(home.locator("output")).toHaveText("section=chats");
  // The topbar now marks the DRAFT — pre-send, the only window in which it matters.
  await expect(topbar.getByText("Temporary")).toBeVisible();
});

test("the reaper FIRES on mount — assert the mutation reached the wire", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, { "settings.getUserSettings": settingsWithTtl(24), "chat.reapTemporaryChats": { reaped: 3 } });

  const home = await mount(<ChatTempChatTileStory />);
  await expect(home.locator('[data-home-tile="chat.tempChat"]')).toBeVisible();

  await expect.poll(() => recorder.count("chat.reapTemporaryChats")).toBe(1);
});
