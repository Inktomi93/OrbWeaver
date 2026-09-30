// CT: the Corpus Insights mode's cohesion-pass bands (north-star §6.3, D271). Drives the PRODUCTION path
// through the REAL section registry with Corpus in Insights:
//  · the N4/P4 CONTEXT band — the mode's `contextHeader` names the leaderboard-drilled character (avatar +
//    name from `character.get`); nothing drilled shows the neutral "Insights" identity.
//  · the N1/N2 LIST band — the mode's `listHeader` shows the "Insights" title + the leaderboard census
//    count, and (A2, read-only) exposes NO New action.

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { LatencyStats, ModelStatRow } from "@orb/server/domain/stats";
import { expect, test } from "@playwright/experimental-ct-react";
import type { TrpcRoutes, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AnalyticsContextHeaderStory, AnalyticsListHeaderStory } from "../_ct-stories.tsx";

const DRILLED_CHARACTER = {
  id: "character_ct_analytics",
  handle: "aria",
  name: "Aria Nightshade",
  avatarHash: null,
};

// A minimal leaderboard census — the LIST-band count reads its length; the rows' other fields are inert
// for the band (the surface below, not the band, renders them).
function leaderboardRow(characterId: CharacterId, name: string): TrpcWireOutput<"stats.leaderboard">["rows"][number] {
  return {
    characterId,
    name,
    chats: 1,
    userTurns: 1,
    assistantTurns: 1,
    swipes: 0,
    tokensOut: 5,
    tokensOutProvenance: "measured",
    totalGenTimeMs: 50,
    reasoningRate: 0,
    firstChatAt: 1,
    lastActivityAt: 2,
  };
}
const LEADERBOARD_ROWS = [leaderboardRow(castId<CharacterId>("char_a"), "Aria"), leaderboardRow(castId<CharacterId>("char_b"), "Bolt")];

/** The real CONTEXT host opens the Models tab by default. These are its honest fresh-library views: no
 * model buckets and a correctly shaped latency population with no recorded samples. */
const EMPTY_CONTEXT_ROUTES: TrpcRoutes<"stats.byModel" | "stats.latency"> = {
  "stats.byModel": [] satisfies ModelStatRow[],
  "stats.latency": {
    avgTtftMs: null,
    p50TtftMs: null,
    p90TtftMs: null,
    avgGenMs: null,
    p50GenMs: null,
    p90GenMs: null,
  } satisfies LatencyStats,
};

test("the CONTEXT band names the drilled leaderboard character (P4)", async ({ mount, page }) => {
  await routeTrpc(page, { ...EMPTY_CONTEXT_ROUTES, "character.get": () => DRILLED_CHARACTER });
  const component = await mount(<AnalyticsContextHeaderStory drilled={true} />);
  await component.getByRole("button", { name: "show insights" }).click();

  await expect(component.getByText("Aria Nightshade")).toBeVisible();
});

test("the CONTEXT band says Whole corpus when nothing is drilled, in the Explore band's title voice", async ({ mount, page }) => {
  await routeTrpc(page, EMPTY_CONTEXT_ROUTES);
  const component = await mount(<AnalyticsContextHeaderStory drilled={false} />);
  await component.getByRole("button", { name: "show insights" }).click();

  const band = component.locator('[data-slot="context-bracket-band"]');
  // Owner-wide context is labelled `Whole corpus` in every mode (D271), in the same title voice as Explore.
  const label = band.getByText("Whole corpus", { exact: true });
  await expect(label).toBeVisible();
  await expect(label).toHaveAttribute("data-voice", "promoted");
  await expect(component.getByText("Aria Nightshade")).toHaveCount(0);
});

test("the LIST band shows the Insights title + the leaderboard count, with NO create action (A2)", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.leaderboard": () => ({ rows: LEADERBOARD_ROWS, total: 2 }) });
  const component = await mount(<AnalyticsListHeaderStory />);
  await component.getByRole("button", { name: "show insights" }).click();

  await expect(component.getByText("Insights", { exact: true })).toBeVisible();
  await expect(component.getByText("2", { exact: true })).toBeVisible();
  // Read-only section: the band is a census, never an addition.
  await expect(component.getByRole("button", { name: "New" })).toHaveCount(0);
});

// P2g: the band read `ANALYTICS 50` against a 328-character library, because `rows.length` on a page
// capped at 50 IS the cap. A census that silently reports its own limit is not a census.
test("the LIST band states the RELATIONSHIP when the page is capped, not the page length", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.leaderboard": () => ({ rows: LEADERBOARD_ROWS, total: 328 }) });
  const component = await mount(<AnalyticsListHeaderStory />);
  await component.getByRole("button", { name: "show insights" }).click();

  await expect(component.getByText("2 of 328")).toBeVisible();
  // The bare page length must NOT be what the band says.
  await expect(component.getByText("2", { exact: true })).toHaveCount(0);
});
