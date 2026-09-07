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
  },
  {
    model: "meta-llama/llama-3.3-70b",
    provider: "local",
    generations: 80,
    tokensOut: 12_000,
    tokensOutProvenance: "measured" as const,
    costUsd: 0,
    charactersUsedWith: 2,
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
};

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
