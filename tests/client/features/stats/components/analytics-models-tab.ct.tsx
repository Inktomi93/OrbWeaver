// CT: the Analytics CONTEXT "Models" tab. Covers the two things the side-eye ANALYTICS pass (2026-08-19)
// found wrong about how this tab SPEAKS: its breakdown announced as a list with no list items, and its
// ranked bar chart carried no reading at all for anyone who cannot see it.
import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { AnalyticsModelsTabStory } from "../_ct-stories.tsx";

const LATENCY = { avgTtftMs: 300, p90TtftMs: 900, avgGenMs: 1200, p90GenMs: 2400 };

const MODELS = [
  {
    model: "anthropic/claude-sonnet-4",
    provider: "openrouter",
    generations: 1200,
    tokensOut: 340_000,
    tokensOutProvenance: "measured" as const,
    costUsd: 1.25,
    charactersUsedWith: 7,
    avgTtftMs: 300,
    p90TtftMs: 900,
    throughputTps: 42.5,
    totalGenTimeMs: 8_000_000,
  },
  {
    model: "meta-llama/llama-3.3-70b",
    provider: "local",
    generations: 80,
    tokensOut: 12_000,
    tokensOutProvenance: "measured" as const,
    costUsd: 0,
    charactersUsedWith: 2,
    avgTtftMs: null,
    p90TtftMs: null,
    throughputTps: 10,
    totalGenTimeMs: 1_200_000,
  },
];

// An ST-imported library row: no token accounting was ever written, so the row must speak `—`, never
// a measured-looking number derived from a coalesced-to-null total.
const UNRECORDED_MODEL = {
  model: "openai/gpt-4-legacy-import",
  provider: null,
  generations: 40,
  tokensOut: null,
  tokensOutProvenance: "unrecorded" as const,
  costUsd: null,
  charactersUsedWith: 1,
  avgTtftMs: null,
  p90TtftMs: null,
  throughputTps: 0,
  totalGenTimeMs: 0,
};

test("price totals do not claim invoice provenance and an incompatible total is unavailable, not zero", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.byModel": () => [{ ...MODELS[0], provider: "claude-sub", costUsd: 0.125 }, UNRECORDED_MODEL],
    "stats.latency": () => LATENCY,
  });
  const component = await mount(<AnalyticsModelsTabStory />);
  const rows = component.getByRole("list", { name: "Models" }).getByRole("listitem");
  await expect(rows.first()).not.toContainText("Cost · Recorded");
  await expect(rows.last()).toContainText("Cost · Unavailable");
  await expect(rows.last()).not.toContainText("$0.00");
  const coverage = component.locator('[data-slot="accounting-coverage"]');
  await expect(coverage).toContainText("subscription-notional estimates");
  await expect(coverage).toContainText("Costs sum available compatible prices and omit missing prices");
  await expect(component.getByText(/A dash means unavailable/)).toBeVisible();
});

for (const width of [320, 420] as const) {
  test.describe(`model accounting at ${width}`, () => {
    test.use({ hasTouch: width === 320, viewport: { width: width === 320 ? 320 : 1280, height: 844 } });
    test("accounting provenance labels aggregate rows without deriving cost from estimated tokens", async ({ mount, page }) => {
      await routeTrpc(page, {
        "stats.byModel": () => [
          ...MODELS.map((model) => (model.costUsd > 0 ? { ...model, tokensOutProvenance: "estimated" as const, costUsd: null } : model)),
          UNRECORDED_MODEL,
        ],
        "stats.latency": () => LATENCY,
      });
      const component = await mount(<AnalyticsModelsTabStory width={width} />);
      const rows = component.getByRole("list", { name: "Models" }).getByRole("listitem");
      await expect(rows).toHaveCount(3);
      await expect(rows.first()).toContainText("~340k tok");
      await expect(rows.first()).toContainText("Output tokens · Estimated");
      await expect(rows.first()).toContainText("Cost · Unavailable");
      await expect(rows.nth(1)).toContainText("$0.00");
      await expect(rows.nth(1)).not.toContainText("Cost · Recorded");
      await expect(rows.last()).toContainText("Output tokens · Not recorded");
      for (const row of await rows.all()) {
        await expect(row).toContainText("Aggregate only");
      }
      await expect.poll(() => component.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    });
  });
}

// Per-model speed carries the same provenance honesty as the accounting line: a TTFT with no samples and a
// throughput with no recorded generation time read "Not recorded" and a dash, never a measured-looking zero.
test("each model row shows its time to first token and throughput, and says when either was never recorded", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.byModel": () => [...MODELS.map((model) => (model.costUsd > 0 ? model : { ...model, tokensOutProvenance: "estimated" as const })), UNRECORDED_MODEL],
    "stats.latency": () => LATENCY,
  });
  const component = await mount(<AnalyticsModelsTabStory />);
  const rows = component.getByRole("list", { name: "Models" }).getByRole("listitem");

  await expect(rows.first()).toContainText("Time to first token · Recorded: 300ms avg, 900ms p90");
  await expect(rows.first()).toContainText("Throughput · Recorded: 42.5 t/s");
  // Estimated tokens make an estimated rate; a TTFT with no samples is unrecorded on its own.
  await expect(rows.nth(1)).toContainText("Time to first token · Not recorded: — avg, — p90");
  await expect(rows.nth(1)).toContainText("Throughput · Estimated: ~10.0 t/s");
  // No generation time: the server's division-guard zero must not read as a measured rate.
  await expect(rows.last()).toContainText("Throughput · Not recorded: —");
  await expect(rows.last()).not.toContainText("0.0 t/s");
});

async function mountModels(page: Parameters<typeof routeTrpc>[0]): Promise<void> {
  await routeTrpc(page, {
    "stats.byModel": () => MODELS,
    "stats.latency": () => LATENCY,
  });
}

// ── P2c: `role="list"` WITH NON-LISTITEM CHILDREN IS A LIST THAT ANNOUNCES EMPTY ──────────────────────
// The breakdown wrapped 50 `ListRow`s in a bare `role="list"`. To assistive tech every row is then a
// generic node and the list reports no items — the same defect the regex/tag/world-info collections were
// already fixed for, whose spelling this copies (`listitem` wrapper + posinset/setsize).
test("the model breakdown announces as a list of real list items (P2c)", async ({ mount, page }) => {
  await mountModels(page);
  const component = await mount(<AnalyticsModelsTabStory />);

  const list = component.getByRole("list", { name: "Models" });
  await expect(list.getByRole("listitem")).toHaveCount(MODELS.length);
  await expect(list.getByRole("listitem").first()).toHaveAttribute("aria-setsize", String(MODELS.length));
  await expect(list.getByRole("listitem").first()).toHaveAttribute("aria-posinset", "1");
});

// ── P1e: the ranked chart is a canvas, so its reading has to be generated ─────────────────────────────
test("the generations chart carries its series as text, in the tab's own number voice (P1e)", async ({ mount, page }) => {
  await mountModels(page);
  const component = await mount(<AnalyticsModelsTabStory />);

  const table = component.getByRole("table", { name: "Generations by model" });
  await expect(table.getByRole("rowheader").first()).toHaveText("anthropic/claude-sonnet-4");
  // `formatCompact`, the same voice as the figures above it — not a raw 1200.
  await expect(table.getByRole("cell").first()).toHaveText("1.2k");
});

// Guards against the mock reverting to a wire shape without `tokensOutProvenance`: without it the row
// renders as-if-measured for every model, including one whose tokens were never recorded at all.
test("a model with unrecorded token accounting reads a dash, never a coalesced-to-zero number", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.byModel": () => [...MODELS, UNRECORDED_MODEL],
    "stats.latency": () => LATENCY,
  });
  const component = await mount(<AnalyticsModelsTabStory />);

  const list = component.getByRole("list", { name: "Models" });
  const unrecordedRow = list.getByRole("listitem").last();
  await expect(unrecordedRow).toContainText("—");
  await expect(unrecordedRow).not.toContainText("0 tok");
});

test("an input-only paid model remains visible without inventing output or throughput", async ({ mount, page }) => {
  await routeTrpc(page, {
    "stats.byModel": () => [
      {
        ...UNRECORDED_MODEL,
        model: "gemini-embedding-2",
        provider: "google",
        generations: 0,
        charactersUsedWith: 0,
        tokensIn: 34,
        tokensInProvenance: "measured",
        costUsd: 0.000_034,
        reasoningRate: null,
        throughputTps: null,
      },
    ],
    "stats.latency": () => LATENCY,
  });
  const component = await mount(<AnalyticsModelsTabStory />);
  const row = component.getByRole("list", { name: "Models" }).getByRole("listitem");
  await expect(row).toContainText("gemini-embedding-2");
  await expect(row).toContainText("0 generations");
  await expect(row).toContainText("Output tokens · Not recorded");
  await expect(row).not.toContainText("Cost · Recorded");
  await expect(row).toContainText("Throughput · Not recorded: —");
  await expect(row).not.toContainText("0.0 t/s");
});
