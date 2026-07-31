// CT: the Preview tab body (assembly-preview-panel.tsx — REBUILT to the panel-redesign mock, D-4). A
// QueryBoundary suspending on the host-only `chat.previewAssembly` + `chat.getShapeTrace` reads in PARALLEL
// (useSuspenseQueries). Proves the INSTRUMENT: the budget bar's segments partition the total, one row per
// source with its count, the drill-in reveals that source's assembled text, plain-chat vs game-chat row sets,
// the a11y model (text is the datum, the bar is hidden), plus the error + retry paths.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc";
import { AssemblyPreviewPanelStory } from "../_ct-stories";

// `AssembleTrace` is carried BOTH at `AssembledPrompt.trace` (the required field on the prompt shape) AND
// at the top-level `AssemblyPreview.trace` that `PreviewBody` destructures — same value, two homes on the
// real wire shape (contracts/chat/index.ts AssembledPrompt + AssemblyPreview).
const PREVIEW_TRACE = {
  staticSections: ["persona", "scenario"],
  dynamicSections: ["authorsNote"],
  worldInfoIncluded: 2,
  worldInfoDropped: [{ id: "wi_1", reason: "budget" as const }],
  worldInfoActivated: [
    { id: "we_dragon", keys: ["dragon", "wyrm"] },
    { id: "we_intro", keys: [] },
  ],
  matchedKeys: [{ key: "cake", matchedLatestUserMessage: true }],
  compactSummaryIncluded: true,
  memoryIncluded: false,
  guidedInstructionIncluded: true,
  staticCacheBusters: [],
  chatInjectionsIncluded: 1,
  afterHistorySections: [],
  overrideSources: { mainPrompt: "room override", scenario: "from Aria" },
};

/** A PLAIN chat's budget: no `game-state` row (the server omits an empty source). */
const PLAIN_BUDGET = {
  ceilingTokens: 8192,
  totalTokens: 4300,
  sources: [
    { source: "system" as const, detail: "main prompt", tokens: 412, text: "You are Aria, a helpful assistant." },
    { source: "cards" as const, detail: "character description · personality", tokens: 1208, text: "Aria — a bold knight." },
    { source: "world-info" as const, detail: "world info (before)", tokens: 356, text: "LORE: The Lantern Road" },
    { source: "steering" as const, detail: "author's note", tokens: 700, text: "Stay concise." },
    { source: "history" as const, detail: "41 turns · 3 dropped", tokens: 1624, text: "" },
  ],
};

const GAME_STATE_TEXT = "## Game state\nroster: Mara (VIT 24/30)";

const PREVIEW_ASSEMBLY_DATA = {
  prompt: {
    static: "You are Aria, a helpful assistant.",
    dynamic: "Stay concise.",
    afterHistory: [{ position: "in_chat" as const, depth: 0, role: "system" as const, content: "Remember the cake is a lie." }],
    sendHistory: true,
    trace: PREVIEW_TRACE,
  },
  trace: PREVIEW_TRACE,
  budget: PLAIN_BUDGET,
};

const SHAPE_TRACE_DATA = {
  multiCharacter: false,
  stageCounts: { withTail: 10, injected: 11, squashed: 9, named: 9 },
  squashMerges: 2,
  cacheBreakpointFromEnd: 3,
  breakpointDecision: "placed" as const,
};

// Regex literals hoisted to module scope (biome `useTopLevelRegex`).
const RE_ESTIMATED = /estimated locally/i;
const RE_WORLD_INFO = /World info/;
const RE_HISTORY = /History/;
const RE_TRANSCRIPT = /the wire history IS the transcript/i;
const RE_CARDS = /Cards/;
const RE_CARDS_COUNT = /1,208/;
const RE_DIAGNOSTICS = /Diagnostics/;

/** The label→count pairs every source row must render (the accessible datum beside each bar segment). */
const SOURCE_ROWS: readonly (readonly [string, string])[] = [
  ["System", "412"],
  ["Cards", "1,208"],
  ["World info", "356"],
  ["Steering", "700"],
  ["History", "1,624"],
];

test("the budget bar's segments partition the total, keyed to the per-source rows", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  // The used/ceiling line — grouped counts, the estimate's honesty line beside it.
  await expect(component.getByText("4,300 / 8,192 tok")).toBeVisible();
  await expect(component.getByText(RE_ESTIMATED)).toBeVisible();

  // One segment per source, each sized to its share of the total (geometry, not source).
  const bar = component.locator("[data-slot=segment-bar]");
  const rail = await bar.boundingBox();
  const cards = await bar.locator("[data-segment=cards]").boundingBox();
  const share = (cards?.width ?? 0) / (rail?.width ?? 1);
  expect(share).toBeGreaterThan(1208 / 4300 - 0.02);
  expect(share).toBeLessThan(1208 / 4300 + 0.02);

  // …and every source has its labelled TEXT row with its own count (the accessible datum).
  await Promise.all(
    SOURCE_ROWS.flatMap(([label, count]) => [
      expect(component.getByText(label, { exact: true })).toBeVisible(),
      expect(component.getByText(count, { exact: true })).toBeVisible(),
    ]),
  );
  await expect(component.getByText("41 turns · 3 dropped")).toBeVisible();
});

test("drilling into a source row reveals THAT source's assembled text", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  // Closed by default — the tab opens as an instrument, not a wall of prompt text.
  await expect(component.getByText("LORE: The Lantern Road")).toHaveCount(0);

  await component.getByRole("button", { name: RE_WORLD_INFO }).click();
  await expect(component.getByText("LORE: The Lantern Road")).toBeVisible();

  // The history row carries COST, not content: its drawer says so rather than re-serving canon.
  await component.getByRole("button", { name: RE_HISTORY }).click();
  await expect(component.getByText(RE_TRANSCRIPT)).toBeVisible();
});

test("the bar is decoration: the a11y datum is the row text, never the segments", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  await expect(component.locator("[data-slot=segment-bar]")).toHaveAttribute("aria-hidden", "true");
  await expect(component.locator("[data-slot=series-row-swatch]").first()).toHaveAttribute("aria-hidden", "true");
  // The drill-in trigger is named by the row's own text (label + detail + count), not by its colour.
  await expect(component.getByRole("button", { name: RE_CARDS })).toHaveAccessibleName(RE_CARDS_COUNT);
});

test("a GAME chat adds the game-state row + the mono state excerpt; a plain chat has neither", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => ({
      ...PREVIEW_ASSEMBLY_DATA,
      budget: {
        ...PLAIN_BUDGET,
        totalTokens: 4702,
        sources: [...PLAIN_BUDGET.sources, { source: "game-state" as const, detail: "state block", tokens: 402, text: GAME_STATE_TEXT }],
      },
    }),
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  await expect(component.getByText("Game state", { exact: true })).toBeVisible();
  await expect(component.getByText("state block")).toBeVisible();
  // The excerpt renders the state block VERBATIM, without needing a drill-in (the mock's honesty card).
  await expect(component.getByText("roster: Mara (VIT 24/30)")).toBeVisible();
});

test("a plain chat renders no game-state row (the row is game-conditional)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  await expect(component.getByText("Game state", { exact: true })).toHaveCount(0);
  await expect(component.getByText("roster: Mara (VIT 24/30)")).toHaveCount(0);
});

test("no trustworthy ceiling ⇒ the total stands alone, never a fabricated denominator", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => ({ ...PREVIEW_ASSEMBLY_DATA, budget: { ...PLAIN_BUDGET, ceilingTokens: 0 } }),
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  await expect(component.getByText("4,300 tok · no window limit")).toBeVisible();
});

test("the diagnostics drawer still carries the BUILD + SHAPE traces (collapsed by default)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  await expect(component.getByText("persona, scenario")).toHaveCount(0);
  await component.getByRole("button", { name: RE_DIAGNOSTICS }).click();

  await expect(component.getByText("persona, scenario")).toBeVisible();
  await expect(component.getByText("2 included, 1 dropped")).toBeVisible();
  await expect(component.getByText("room override")).toBeVisible();
  await expect(component.getByText("Remember the cake is a lie.", { exact: false })).toBeVisible();
  await expect(component.getByText("10 → 11 → 9 → 9")).toBeVisible();
  await expect(component.getByText("Placed (offset 3 from end)")).toBeVisible();
  await expect(component.getByText("World info — 2 activated")).toBeVisible();
  await expect(component.getByText("we_dragon")).toBeVisible();
  await expect(component.getByText("always")).toBeVisible();
  await expect(component.getByText("Memory")).toHaveCount(0); // memoryIncluded:false → not an active flag badge.
});

test("error surface renders when either read fails", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => trpcError({ message: "assembly blew up" }),
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  await expect(component.getByText("Couldn't load the preview.")).toBeVisible();
});

test("retry refetches both reads (the reset handshake) and renders on recovery", async ({ mount, page }) => {
  let previewCalls = 0;
  const trpc = await routeTrpc(page, {
    "chat.previewAssembly": (): unknown => (previewCalls++ === 0 ? trpcError({ message: "boom" }) : PREVIEW_ASSEMBLY_DATA),
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  await expect(component.getByText("Couldn't load the preview.")).toBeVisible();

  await component.getByRole("button", { name: "Retry" }).click();

  await expect(component.getByText("4,300 / 8,192 tok")).toBeVisible();
  await expect.poll(() => trpc.count("chat.previewAssembly")).toBe(2);
});
