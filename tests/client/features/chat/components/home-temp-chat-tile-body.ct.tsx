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

/** The creation-only teaching, in the user's own terms — the gloss line that replaced the sample Badge. */
const CREATION_ONLY_TEACHING_RE = /Marked Temporary from the moment it opens/u;

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

test("the launcher opens the SHARED new-chat picker with the temporary flag preset — it never mints its own seed", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": settingsWithTtl(24), "chat.reapTemporaryChats": { reaped: 0 } });

  const home = await mount(<ChatTempChatTileStory />);
  const intent = home.getByTestId("new-chat-intent");
  const start = home.getByRole("button", { name: "Start a temp chat" });
  await expect(start).toBeVisible();
  // Nothing started yet: no modal, no preset, and no chat room anywhere.
  await expect(intent).toHaveText("modal=none temporary=false");
  await expect(home.getByTestId("temp-topbar").getByText("Temporary")).toHaveCount(0);

  await start.click();

  // ONE creation ceremony: the tile hands the cast pick to the same modal every "New chat" opens, with
  // the creation-only flag preset — it does NOT bypass the picker with a seed of its own. (The rest of
  // the ceremony — picker → seeded room → Temporary on the draft pre-send — is the app-root route CT.)
  await expect(intent).toHaveText("modal=newChat temporary=true");
});

test("the teaching about the creation-only flag rides the GLOSS — never a sample Badge (a picture of a badge is not a state)", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": settingsWithTtl(24), "chat.reapTemporaryChats": { reaped: 0 } });

  const home = await mount(<ChatTempChatTileStory />);
  const tile = home.locator('[data-home-tile="chat.tempChat"]');

  await expect(tile.getByText(CREATION_ONLY_TEACHING_RE)).toBeVisible();
  await expect(tile.locator('[data-slot="badge"]')).toHaveCount(0);
});

test("the reaper FIRES on mount — assert the mutation reached the wire", async ({ mount, page }) => {
  const recorder = await routeTrpc(page, { "settings.getUserSettings": settingsWithTtl(24), "chat.reapTemporaryChats": { reaped: 3 } });

  const home = await mount(<ChatTempChatTileStory />);
  await expect(home.locator('[data-home-tile="chat.tempChat"]')).toBeVisible();

  await expect.poll(() => recorder.count("chat.reapTemporaryChats")).toBe(1);
});
