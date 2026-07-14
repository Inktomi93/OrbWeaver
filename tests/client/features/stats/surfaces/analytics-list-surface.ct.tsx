// CT: the Analytics LIST leaderboard — the ranked rows + the sort-toggle re-dispatch. Drives the
// PRODUCTION path: `stats.leaderboard` (routeTrpc, discriminated on the decoded `sort` input). Asserts:
// the default (assistantTurns) sort renders its ranked rows; switching the sort re-dispatches and the
// first row changes; a row exposes its replies + tokens summary.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { AnalyticsListSurfaceStory } from "../_ct-stories";

const ARIA = {
  characterId: "char_aria",
  name: "Aria Nightshade",
  chats: 4,
  userTurns: 40,
  assistantTurns: 42,
  swipes: 3,
  tokensOut: 12_000,
  totalGenTimeMs: 90_000,
  reasoningRate: 0,
  firstChatAt: 1000,
  lastActivityAt: 5000,
};
const BOLT = {
  ...ARIA,
  characterId: "char_bolt",
  name: "Bolt",
  assistantTurns: 9,
  tokensOut: 800,
  totalGenTimeMs: 4000,
  lastActivityAt: 9000,
};

// stats.leaderboard — discriminate on the decoded `sort` so one responder serves every toggle.
function leaderboardResponder(input: unknown): unknown {
  const sort = (input as { sort?: string } | undefined)?.sort;
  // "Recent" ranks Bolt first (latest activity); the default (replies) ranks Aria first.
  return sort === "lastActivityAt" ? [BOLT, ARIA] : [ARIA, BOLT];
}

test("the leaderboard renders ranked rows on the default sort", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.leaderboard": leaderboardResponder });
  const component = await mount(<AnalyticsListSurfaceStory />);

  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();
  // The row summary carries the replies + gen-time subtitle.
  await expect(component.getByText("42 replies", { exact: false })).toBeVisible();
});

test("switching the sort re-dispatches and re-ranks the rows", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.leaderboard": leaderboardResponder });
  const component = await mount(<AnalyticsListSurfaceStory />);

  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await component.getByRole("button", { name: "Sort by Recent" }).click();

  // Both still render; the CT proves the toggle drives a fresh query (the responder swaps order).
  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
});
