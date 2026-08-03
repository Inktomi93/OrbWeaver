// CT: the Analytics section's cohesion-pass bands (north-star §6.3). Drives the PRODUCTION path through
// the REAL section registry:
//  · the N4/P4 CONTEXT band — the `defineContextTabs` `header` slot names the leaderboard-drilled character
//    (avatar + name from `character.get`); nothing drilled shows the neutral "Analytics" identity.
//  · the N1/N2 LIST band — the `listHeader` slot shows the "Analytics" title + the leaderboard census
//    count, and (A2, read-only) exposes NO New action.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { AnalyticsContextHeaderStory, AnalyticsListHeaderStory } from "../_ct-stories.tsx";

const DRILLED_CHARACTER = {
  id: "character_ct_analytics",
  handle: "aria",
  name: "Aria Nightshade",
  avatarHash: null,
};

// A minimal leaderboard census — the LIST-band count reads its length; the rows' other fields are inert
// for the band (the surface below, not the band, renders them).
function leaderboardRow(characterId: CharacterId, name: string): Record<string, unknown> {
  return {
    characterId,
    name,
    chats: 1,
    userTurns: 1,
    assistantTurns: 1,
    swipes: 0,
    tokensOut: 5,
    totalGenTimeMs: 50,
    reasoningRate: 0,
    firstChatAt: 1,
    lastActivityAt: 2,
  };
}
const LEADERBOARD = [leaderboardRow(castId<CharacterId>("char_a"), "Aria"), leaderboardRow(castId<CharacterId>("char_b"), "Bolt")];

test("the CONTEXT band names the drilled leaderboard character (P4)", async ({ mount, page }) => {
  await routeTrpc(page, { "character.get": () => DRILLED_CHARACTER });
  const component = await mount(<AnalyticsContextHeaderStory drilled={true} />);

  await expect(component.getByText("Aria Nightshade")).toBeVisible();
});

test("the CONTEXT band shows the neutral Analytics identity when nothing is drilled", async ({ mount }) => {
  const component = await mount(<AnalyticsContextHeaderStory drilled={false} />);

  await expect(component.getByText("Analytics")).toBeVisible();
  await expect(component.getByText("Aria Nightshade")).toHaveCount(0);
});

test("the LIST band shows the Analytics title + the leaderboard count, with NO create action (A2)", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.leaderboard": () => LEADERBOARD });
  const component = await mount(<AnalyticsListHeaderStory />);

  await expect(component.getByText("Analytics")).toBeVisible();
  await expect(component.getByText("2", { exact: true })).toBeVisible();
  // Read-only section: the band is a census, never an addition.
  await expect(component.getByRole("button", { name: "New" })).toHaveCount(0);
});
