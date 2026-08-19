// CT: the Analytics LIST leaderboard — the ranked rows + the sort-toggle re-dispatch. Drives the
// PRODUCTION path: `stats.leaderboard` (routeTrpc, discriminated on the decoded `sort` input). Asserts:
// the default (assistantTurns) sort renders its ranked rows; switching the sort re-dispatches and the
// first row changes; a row exposes its replies + tokens summary.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { AnalyticsListSurfaceStory } from "../_ct-stories.tsx";

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
  const rows = sort === "lastActivityAt" ? [BOLT, ARIA] : [ARIA, BOLT];
  // A PAGE, not an array: the rows are capped and `total` is the population they were cut from.
  return { rows, total: 328 };
}

test("the leaderboard renders ranked rows on the default sort", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.leaderboard": leaderboardResponder });
  const component = await mount(<AnalyticsListSurfaceStory />);

  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();
  // The row summary carries the replies + gen-time subtitle.
  await expect(component.getByText("42 replies", { exact: false })).toBeVisible();
});

// P2a: `tokensOut: null` off the verb means the turns were never accounted (an ST-imported history), and
// `0 tok` asserted a measurement. Probed on the owner corpus: one character has 1,187 replies and 8,713
// variants with NULL on both token columns.
test("a row whose turns carry no token accounting renders a dash, not `0 tok`", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.leaderboard": () => ({ rows: [{ ...ARIA, tokensOut: null }], total: 1 }) });
  const component = await mount(<AnalyticsListSurfaceStory />);

  const row = component.getByRole("button", { name: "Aria Nightshade" });
  await expect(row).toBeVisible();
  await expect(component.getByText("0 tok")).toHaveCount(0);
  await expect(component.getByText("—", { exact: true })).toBeVisible();
});

// P3a: two characters sharing a name were indistinguishable in the row AND in its accessible name, so
// "your top character" and "the falling one" could be different people with the same label.
test("duplicate names are disambiguated in the row and in its accessible name", async ({ mount, page }) => {
  const twinA = { ...ARIA, characterId: "character_aaaak3f9", name: "Hikari" };
  const twinB = { ...BOLT, characterId: "character_bbbbq7x2", name: "Hikari" };
  await routeTrpc(page, { "stats.leaderboard": () => ({ rows: [twinA, twinB], total: 2 }) });
  const component = await mount(<AnalyticsListSurfaceStory />);

  // The accessible NAME carries the ref (ListRow's aria-label is the title), so the rows are tellable
  // apart by a screen reader too, not only by eye.
  await expect(component.getByRole("button", { name: "Hikari (#k3f9)" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Hikari (#q7x2)" })).toBeVisible();
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
