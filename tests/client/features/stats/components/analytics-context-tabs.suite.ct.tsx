// CT: WHAT THE CONTEXT TABS CLAIM TO BE ABOUT (side-eye rail-analytics 2026-08-19 P1b).
//
// The CONTEXT band names the leaderboard-drilled character (§6.3 N4/P4), which reads as a claim that the
// numbers under it are that character's. Two of the three dimension tabs cannot honour it — `model_stats`
// is owner+model grain and `daily_stats` is owner+day grain, neither has a character axis — and the third
// can, because `personaUsage` is a live canon GROUP BY. Measured before this landed: the drilled
// character's face over the whole library's numbers, including the latency quartet rendering DIFFERENT
// values from the ones CONTENT showed for that same character, simultaneously.
//
// These drive the PRODUCTION path: the real tabs over the real data layer, with the drill seeded through
// the same `#state` selection the leaderboard writes.

import type { CharacterId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AnalyticsModelsTabStory, AnalyticsPersonasTabStory } from "../_ct-stories.tsx";

const MODEL_ROW = {
  model: "anthropic/claude-opus-4.5",
  provider: "openrouter",
  generations: 26_636,
  charactersUsedWith: 41,
  tokensIn: null,
  tokensOut: null,
  totalGenTimeMs: 900_000,
  avgGenMs: 1200,
  avgTtftMs: 300,
  p50TtftMs: 280,
  p90TtftMs: 800,
  reasoningRate: 0,
  throughputTps: 12,
  costUsd: null,
  reasoningMs: 0,
  cacheHitRate: null,
};

const LATENCY = { avgTtftMs: 300, p50TtftMs: 280, p90TtftMs: 800, avgGenMs: 1200, p50GenMs: 1000, p90GenMs: 2400 };

function personaRow(name: string, messageCount: number): Record<string, unknown> {
  return { personaId: `persona_${name}`, name, chatCount: 2, messageCount, tokensOut: null, lastUsedAt: 1_750_000_000_000 };
}

test("the Models tab says WHOSE numbers these are when a character is drilled", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.byModel": () => [MODEL_ROW], "stats.latency": () => LATENCY });
  const component = await mount(<AnalyticsModelsTabStory drilled={true} />);

  await expect(component.getByText("Whole library", { exact: false })).toBeVisible();
});

// THE SHARPEST HALF OF P1b: the quartet HAS a character arm, and CONTENT already renders it for the
// drilled character. Two live values for one metric on screen at once is not a caption problem.
test("the Models tab drops its owner-wide latency quartet while a character is drilled", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.byModel": () => [MODEL_ROW], "stats.latency": () => LATENCY });
  const component = await mount(<AnalyticsModelsTabStory drilled={true} />);

  // SETTLED: the byModel read has landed, so the tab has painted everything it is going to paint.
  // The barrier is the HEADING, not the text — `getByText` is a case-insensitive substring match and the
  // scope notice above contains the word "breakdown".
  await expect(component.getByRole("heading", { name: "Breakdown" })).toBeVisible();
  await expect(component.getByText("Latency (all models)")).toHaveCount(0);
  await expect(component.locator('[data-slot="stat-figure"]', { hasText: "p90 TTFT" })).toHaveCount(0);
});

test("with nothing drilled the Models tab keeps its latency quartet and states no scope", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.byModel": () => [MODEL_ROW], "stats.latency": () => LATENCY });
  const component = await mount(<AnalyticsModelsTabStory drilled={false} />);

  await expect(component.getByText("Latency (all models)")).toBeVisible();
  // Library scope is the unsurprising default with nothing drilled; a permanent caption teaches the eye
  // to skip it exactly when it starts mattering.
  await expect(component.getByText("Whole library", { exact: false })).toHaveCount(0);
});

// P2a on the per-model rows: 50 buckets reading `0 tok · $0.00` were 50 imported buckets with no
// accounting at all — the read now returns null and the row prints a dash.
test("a model bucket with no accounting renders dashes, not `0 tok · $0.00`", async ({ mount, page }) => {
  await routeTrpc(page, { "stats.byModel": () => [MODEL_ROW], "stats.latency": () => LATENCY });
  const component = await mount(<AnalyticsModelsTabStory drilled={false} />);

  await expect(component.getByText("— · —")).toBeVisible();
  await expect(component.getByText("$0.00")).toHaveCount(0);
});

// THE TAB THAT CAN SCOPE, DOES (§4.2 CONTEXT-follows-CONTENT). The responder answers differently for a
// scoped request, so the assertion proves the characterId reached the wire — not merely that a caption
// changed.
test("the Personas tab narrows its read to the drilled character", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.personaUsage": (input: unknown) =>
      (input as { characterId?: CharacterId } | undefined)?.characterId === undefined
        ? [personaRow("Alex", 4200), personaRow("Vex", 900)]
        : [personaRow("Alex", 118)],
  });
  const component = await mount(<AnalyticsPersonasTabStory drilled={true} />);

  await expect(component.getByText("Only the chats with the character you opened.")).toBeVisible();
  await expect(component.getByText("118 messages", { exact: false })).toBeVisible();
  // The library-wide persona is absent from the scoped answer, so the tab is not showing library numbers.
  await expect(component.getByText("Vex")).toHaveCount(0);
});

test("with nothing drilled the Personas tab reads the whole library and says so", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.personaUsage": (input: unknown) =>
      (input as { characterId?: CharacterId } | undefined)?.characterId === undefined
        ? [personaRow("Alex", 4200), personaRow("Vex", 900)]
        : [personaRow("Alex", 118)],
  });
  const component = await mount(<AnalyticsPersonasTabStory drilled={false} />);

  await expect(component.getByText("Across every chat in your library.")).toBeVisible();
  // Scoped to the persona LIST: charts' P1e a11y work added a visually-hidden <table> whose <th>Vex</th>
  // also matches getByText — the list is role=list, the a11y table is role=table (side-eye P2c×P1e seam).
  await expect(component.getByRole("list", { name: "Personas" }).getByText("Vex")).toBeVisible();
});
