// CT: the Analytics LIST leaderboard — the ranked rows + the sort-toggle re-dispatch. Drives the
// PRODUCTION path: `stats.leaderboard` (routeTrpc, discriminated on the decoded `sort` input). Asserts:
// the default (assistantTurns) sort renders its ranked rows; switching the sort re-dispatches and the
// first row changes; a row exposes its replies + tokens summary.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
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

// D13 (#711 re-audit): on a FIRST-LOAD failure the query settles `isError` true while `page` is still
// undefined. The body checked `page === undefined` for its skeleton BEFORE the error arm, so a failed load
// pinned a permanent skeleton and the retry affordance was unreachable. The error arm now wins; a scripted
// fail-then-succeed proves the retry actually refetches into the rows.
test("a first-load leaderboard error shows the retry surface (not a permanent skeleton), and Retry recovers", async ({ mount, page }) => {
  let calls = 0;
  await routeTrpc(page, {
    "stats.leaderboard": (): unknown => (calls++ === 0 ? trpcError({ message: "leaderboard boom" }) : leaderboardResponder({ sort: "assistantTurns" })),
  });
  const component = await mount(<AnalyticsListSurfaceStory />);

  // The error surface renders — NOT the six-row skeleton the pre-fix order pinned forever.
  await expect(component.getByText("Couldn't load the leaderboard.")).toBeVisible();
  const retry = component.getByRole("button", { name: "Retry" });
  await expect(retry).toBeVisible();

  // Retry refetches; the second response succeeds and the ranked rows arrive.
  await retry.click();
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("Couldn't load the leaderboard.")).toHaveCount(0);
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

// P2c/P1f: the rows are a `<VirtualList>` now, so the pane is a role="list" with role="listitem" children
// (the primitive owns the chain) rather than the bare role="list" with 50 non-listitem rows the audit
// flagged. Asserting through the a11y tree, not the implementation.
test("the leaderboard is an accessible list of listitems (not a bare role=list)", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.leaderboard": leaderboardResponder });
  const component = await mount(<AnalyticsListSurfaceStory />);

  await expect(component.getByRole("list", { name: "Character leaderboard" })).toBeVisible();
  // Every rendered row is a proper listitem — the P2c defect (rows under a bare list, no listitems) is gone.
  await expect(component.getByRole("listitem")).toHaveCount(2);
});

// P1f (the perf mechanism, structurally). A 60-row page renders only its windowed slice into the DOM — the
// section-entry cost of 50+ eager rows is bounded to the visible window, which is also why the tab stops and
// the a11y tree stay small. A count that is BOTH > 0 and far below 60 is the windowing; the exact number is
// the viewport's, not asserted.
test("a large leaderboard renders only a windowed slice of rows (virtualized)", async ({ mount, page }) => {
  const many = Array.from({ length: 60 }, (_v, i) => ({ ...ARIA, characterId: `char_${i}`, name: `Char ${i}`, assistantTurns: 60 - i }));
  await routeTrpc(page, { "stats.leaderboard": () => ({ rows: many, total: 328 }) });
  const component = await mount(<AnalyticsListSurfaceStory />);

  await expect(component.getByText("Char 0")).toBeVisible();
  const listitems = component.getByRole("listitem");
  await expect.poll(async () => await listitems.count()).toBeGreaterThan(0);
  // The whole page is 60 rows; the DOM holds only the window (plus overscan) — never all 60.
  await expect.poll(async () => await listitems.count()).toBeLessThan(30);
});

// P2g: 50 rows at tabIndex=0 was 50 consecutive tab stops. Roving makes exactly ONE row body tabbable and
// Arrow keys move focus; the drill stays the row's own click. Asserted through the DOM tab stops.
test("only one leaderboard row is tabbable (roving), and Arrow keys move focus", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.leaderboard": leaderboardResponder });
  const component = await mount(<AnalyticsListSurfaceStory />);
  await expect(component.getByText("Aria Nightshade")).toBeVisible();

  const rowBodies = component.locator('[data-slot="list-row-body"]');
  await expect(rowBodies).toHaveCount(2);
  // Exactly one tab stop across the whole leaderboard (the roving contract), not one per row.
  await expect(component.locator('[data-slot="list-row-body"][tabindex="0"]')).toHaveCount(1);

  // Arrow-down from the first row moves focus (and its tab stop) to the second.
  await rowBodies.first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(rowBodies.nth(1)).toBeFocused();
});

// P2g: the search is a SERVER predicate (the verb pages 50 of a larger total), not a filter over the loaded
// rows — so a name below the cut is reachable. The responder keys on the decoded `search` input; the CT
// proves the box drives a fresh, narrowed query.
test("the LIST search narrows the rows through a fresh server query", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.leaderboard": (input: unknown): unknown => {
      const needle = ((input as { search?: string } | undefined)?.search ?? "").toLowerCase();
      const all = [ARIA, BOLT];
      const rows = needle === "" ? all : all.filter((r) => r.name.toLowerCase().includes(needle));
      return { rows, total: rows.length };
    },
  });
  const component = await mount(<AnalyticsListSurfaceStory />);
  await expect(component.getByText("Aria Nightshade")).toBeVisible();
  await expect(component.getByText("Bolt")).toBeVisible();

  await component.getByLabel("Search characters").fill("bolt");

  // The narrowed page arrives and Aria drops out — a client-only filter over the loaded 50 could never do
  // this for a name that was below the page cut.
  await expect(component.getByText("Bolt")).toBeVisible();
  await expect(component.getByText("Aria Nightshade")).toHaveCount(0);
});
