// CT: the Analytics CHARACTER drill (a single character's turn economics) — a mirror of the OVERVIEW
// dashboard's small honest set (#1221): its `padding="section"` pin, and a basic mount/landmark
// assertion, since the surface had NO CT file at all until now (the #1200 padding fix rode the
// overview's pinned pattern uncovered on this twin).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AnalyticsCharacterSurfaceStory } from "../_ct-stories.tsx";

const CHARACTER_STATS = {
  characterId: "character_ct_drill",
  name: "Kethryl",
  characters: 1,
  chats: 4,
  userTurns: 20,
  assistantTurns: 20,
  systemTurns: 0,
  swipes: 3,
  userWords: 1200,
  assistantWords: 3400,
  swipeWords: 500,
  tokensIn: 10_000,
  tokensOut: 20_000,
  tokensInProvenance: "measured",
  tokensOutProvenance: "measured",
  totalGenTimeMs: 90_000,
  avgGenMs: 900,
  p50GenMs: 800,
  p90GenMs: 1500,
  avgTtftMs: 300,
  p50TtftMs: 250,
  p90TtftMs: 500,
  reasoningRate: 0.1,
  contentBytes: 40_000,
  firstChatAt: 1_740_000_000_000,
  lastActivityAt: 1_750_000_000_000,
  computedAt: 1_750_000_000_000,
  reasoningMs: 4500,
  costUsd: 0.5,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  forkedChats: 0,
  variantMessages: 0,
  maxContextTokens: null,
  throughputTps: 12.5,
  avgSwipeDepth: 1.2,
  swipeRate: 0.05,
  cacheHitRate: null,
  avgReplyWords: 170,
};

const LATENCY = { avgTtftMs: 300, p50TtftMs: 250, p90TtftMs: 500, avgGenMs: 900, p50GenMs: 800, p90GenMs: 1500 };

test("the character drill's content region carries a non-zero inset (#1221, the overview's #1200 pin mirrored)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.character": () => CHARACTER_STATS,
    "stats.latency": () => LATENCY,
    "character.get": () => ({ id: "character_ct_drill", name: "Kethryl" }),
  });

  const component = await mount(<AnalyticsCharacterSurfaceStory />);
  await expect(component.getByText("Kethryl")).toBeVisible();

  const region = component.locator('[data-slot="analytics-content"]');
  const padding = await region.evaluate((el) => getComputedStyle(el).paddingTop);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): static CSS from the `padding="section"` prop, settled by the name-text visibility barrier above — it cannot change after mount.
  expect(padding).not.toBe("0px");
});

test("the drill mounts its economics landmarks with the character's real figures", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.character": () => CHARACTER_STATS,
    "stats.latency": () => LATENCY,
    "character.get": () => ({ id: "character_ct_drill", name: "Kethryl" }),
  });

  const component = await mount(<AnalyticsCharacterSurfaceStory />);
  await expect(component.getByText("Kethryl")).toBeVisible();

  await expect(component.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Economics" })).toBeVisible();
  await expect(component.getByRole("heading", { name: "Latency" })).toBeVisible();

  const words = component.locator('[data-slot="stat-figure"]', { hasText: "Words" }).first();
  // userWords (1200) + assistantWords (3400) = 4.6k — the ONE-definition rule the overview shares (P2d).
  await expect(words.locator('[data-slot="stat-figure-value"]')).toHaveText("4.6k");
});
