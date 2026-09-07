// CT: the Preview tab body (assembly-preview-panel.tsx — REBUILT to the panel-redesign mock, D-4). A
// QueryBoundary suspending on the host-only `chat.previewAssembly` + `chat.getShapeTrace` reads in PARALLEL
// (useSuspenseQueries). Proves the INSTRUMENT: the budget bar's segments partition the total, one row per
// source with its count, the drill-in reveals that source's assembled text, plain-chat vs game-chat row sets,
// the a11y model (text is the datum, the bar is hidden), plus the error + retry paths.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { AssemblyPreviewPanelStory } from "../_ct-stories.tsx";

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
  // The recall slice (#250) — the wire shape `recallMemory` produces: two surfaced blocks with the scores
  // they were admitted on, plus the rejects carrying the STAGE that eliminated each.
  memoryRecall: {
    mode: "mixC" as const,
    queryText: "Nate: is the bath house still open?",
    queryEmbedded: true,
    poolSize: 5,
    candidateCount: 4,
    surfaced: 2,
    ms: 31,
    note: null,
    candidates: [
      { tier: 0, blockIdx: 3, scopedCharacterId: "character_group", verdict: "admitted" as const, rank: 0, score: -0.81, relevance: 0.81 },
      { tier: 1, blockIdx: 0, scopedCharacterId: "character_group", verdict: "admitted" as const, rank: 1, score: -0.62, relevance: 0.62 },
      { tier: 0, blockIdx: 2, scopedCharacterId: "character_group", verdict: "below-floor" as const },
      { tier: 0, blockIdx: 1, scopedCharacterId: "character_group", verdict: "bridge-covered" as const },
      { tier: 0, blockIdx: 0, scopedCharacterId: "character_group", verdict: "live-window" as const },
    ],
  },
  guidedInstructionIncluded: true,
  staticCacheBusters: [],
  chatInjectionsIncluded: 1,
  afterHistorySections: [],
  overrideSources: { mainPrompt: "room override", scenario: "from Aria" },
};

/** A PLAIN chat's budget: no `game-state` row (the server omits an empty source). The `cards` row carries the
 *  ROOM's members as parts — the owner's question ("what is each character in the room costing me") is the
 *  per-contributor breakdown, not the bucket total. */
const MARA_CARD = "Mara — a bold knight of the Lantern Road.";
const NIKO_CARD = "Niko — a wary scout.";

const PLAIN_BUDGET = {
  ceilingTokens: 8192,
  ceilingEstimated: false,
  totalTokens: 4300,
  sources: [
    {
      source: "system" as const,
      detail: "main prompt",
      tokens: 412,
      parts: [{ label: "main prompt", tokens: 412, text: "You are Aria, a helpful assistant." }],
      text: "You are Aria, a helpful assistant.",
    },
    {
      source: "cards" as const,
      detail: "Mara · Niko",
      tokens: 1208,
      parts: [
        { label: "Mara", tokens: 812, text: MARA_CARD },
        { label: "Niko", tokens: 396, text: NIKO_CARD },
      ],
      text: `${MARA_CARD}\n\n${NIKO_CARD}`,
    },
    {
      source: "world-info" as const,
      detail: "world info (before)",
      tokens: 356,
      parts: [{ label: "world info (before)", tokens: 356, text: "LORE: The Lantern Road" }],
      text: "LORE: The Lantern Road",
    },
    {
      source: "steering" as const,
      detail: "author's note",
      tokens: 700,
      parts: [{ label: "author's note", tokens: 700, text: "Stay concise." }],
      text: "Stay concise.",
    },
    { source: "history" as const, detail: "41 turns · 3 dropped", tokens: 1624, parts: [], text: "" },
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

// The DELIVERED wire rows, in order — the projection that makes the INJECT-NAMED-AS-PLAYER class visible: row
// 3 is an `assembled` steering block delivered under `role: user` with the PLAYER's name on it, which no stage
// COUNT could ever show. Row 4 is `merged` — a canon turn a same-role squash folded an assembled row into.
const SHAPE_TRACE_ROWS = [
  // A `standard` canon row states its kind; the readout must NOT print it — the default is not information.
  { role: "user" as const, name: "Nate", source: "canon" as const, kind: "standard" as const, chars: 128 },
  // A NARRATOR canon row (D129): declared purpose, and — by the label policy — deliberately NO speaker label.
  // Without the purpose on the line this row reads as a bare "assistant", indistinguishable from a defect.
  { role: "assistant" as const, source: "canon" as const, kind: "narrator" as const, chars: 640 },
  { role: "user" as const, name: "Nate", source: "assembled" as const, chars: 3037 },
  { role: "user" as const, name: "Nate", source: "merged" as const, chars: 212 },
  { role: "system" as const, source: "assembled" as const, chars: 96 },
];

const SHAPE_TRACE_DATA = {
  multiCharacter: false,
  stageCounts: { withTail: 10, injected: 11, squashed: 9, named: 9 },
  squashMerges: 2,
  cacheBreakpointFromEnd: 3,
  breakpointDecision: "placed" as const,
  rows: SHAPE_TRACE_ROWS,
};

const RE_ESTIMATED = /estimated locally/i;
const RE_WORLD_INFO = /World info/;
const RE_HISTORY = /History/;
const RE_TRANSCRIPT = /the wire history IS the transcript/i;
const RE_CARDS = /Cards/;
const RE_SYSTEM = /System/;
const RE_CARDS_COUNT = /1,208/;
const RE_DIAGNOSTICS = /Diagnostics/;
const RE_WINDOW_UNPUBLISHED = /context window isn.t published/;
const RE_WIRE_ROW_1 = /1\. user · Nate/;

/** The label→count pairs every source row must render (the accessible datum beside each bar segment). */
const SOURCE_ROWS: readonly (readonly [string, string])[] = [
  ["System", "412"],
  ["Cards", "1,208"],
  ["World info", "356"],
  ["Steering", "700"],
  ["History", "1,624"],
];

/** What fraction of the rail the segments actually cover — the fill-vs-headroom datum (1 ⇒ no headroom
 *  drawn, i.e. composition-only). */
async function filledFraction(component: Locator): Promise<number> {
  const bar = component.locator("[data-slot=segment-bar]");
  const rail = await bar.boundingBox();
  const widths = await bar.locator("[data-slot=segment-bar-segment]").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  return widths.reduce((sum, w) => sum + w, 0) / (rail?.width ?? 1);
}

test("the budget bar's segments partition the total, keyed to the per-source rows", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  // The used/ceiling line — grouped counts, the estimate's honesty line beside it.
  await expect(component.getByText("4,300 / 8,192 tok")).toBeVisible();
  await expect(component.getByText(RE_ESTIMATED)).toBeVisible();

  // FILL-VS-HEADROOM (owner ruling): the bar's FILLED length is used/window — 4,300 of 8,192 fills ~52% of
  // the rail and the rest is visible headroom — and each segment is its share of the WINDOW, not of the fill.
  const bar = component.locator("[data-slot=segment-bar]");
  const rail = await bar.boundingBox();
  const segmentWidths = await Promise.all(
    PLAIN_BUDGET.sources.filter((s) => s.tokens > 0).map(async (s) => (await bar.locator(`[data-segment=${s.source}]`).boundingBox())?.width ?? 0),
  );
  const filled = segmentWidths.reduce((sum, w) => sum + w, 0) / (rail?.width ?? 1);
  expect(filled).toBeGreaterThan(4300 / 8192 - 0.02);
  expect(filled).toBeLessThan(4300 / 8192 + 0.02);

  const cards = await bar.locator("[data-segment=cards]").boundingBox();
  const share = (cards?.width ?? 0) / (rail?.width ?? 1);
  expect(share).toBeGreaterThan(1208 / 8192 - 0.02);
  expect(share).toBeLessThan(1208 / 8192 + 0.02);

  // …and every source has its labelled TEXT row with its own count (the accessible datum).
  await Promise.all(
    SOURCE_ROWS.flatMap(([label, count]) => [
      expect(component.getByText(label, { exact: true })).toBeVisible(),
      expect(component.getByText(count, { exact: true })).toBeVisible(),
    ]),
  );
  await expect(component.getByText("41 turns · 3 dropped")).toBeVisible();
});

test("a barely-used window renders as a SLIVER, not a full bar (the fill-vs-headroom ruling)", async ({ mount, page }) => {
  // The live case that prompted the ruling: 891 tokens of a real 200k window. Under the old composition-only
  // reading the bar looked FULL at 0.4% usage — the exact misread the owner called out.
  await routeTrpc(page, {
    "chat.previewAssembly": () => ({
      ...PREVIEW_ASSEMBLY_DATA,
      budget: {
        ceilingTokens: 200_000,
        ceilingEstimated: false,
        totalTokens: 891,
        sources: [{ source: "system" as const, detail: "Main", tokens: 891, parts: [{ label: "Main", tokens: 891, text: "You are…" }], text: "You are…" }],
      },
    }),
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  await expect(component.getByText("891 / 200,000 tok")).toBeVisible();
  expect(await filledFraction(component)).toBeLessThan(0.02);
});

test("the Cards row breaks down PER ROSTER MEMBER — each character's own token size + their card text", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  // The room's members are named on the closed row…
  await expect(component.getByText("Mara · Niko")).toBeVisible();

  // …and drilling in lists them one per line with THEIR token count, not one opaque bucket total.
  await component.getByRole("button", { name: RE_CARDS }).click();
  await expect(component.getByText("Mara", { exact: true })).toBeVisible();
  await expect(component.getByText("812", { exact: true })).toBeVisible();
  await expect(component.getByText("Niko", { exact: true })).toBeVisible();
  await expect(component.getByText("396", { exact: true })).toBeVisible();

  // Each member drills one level further into the exact bytes their card contributes. (The member trigger is
  // named by its OWN row — "Mara 812" — distinct from the source row, whose name carries the detail line.)
  await expect(component.getByText(MARA_CARD)).toHaveCount(0);
  await component.getByRole("button", { name: "Mara 812", exact: true }).click();
  await expect(component.getByText(MARA_CARD)).toBeVisible();
  await expect(component.getByText(NIKO_CARD)).toHaveCount(0);
});

test("a single-contributor source drills straight to its text (no redundant one-line breakdown)", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  // The five sources are five rows; expanding a SINGLE-contributor one adds no sixth (a sub-row repeating
  // the source's own count would be pure chrome).
  await expect(component.locator("[data-slot=series-row]")).toHaveCount(PLAIN_BUDGET.sources.length);
  await component.getByRole("button", { name: RE_SYSTEM }).click();
  await expect(component.getByText("You are Aria, a helpful assistant.")).toBeVisible();
  await expect(component.locator("[data-slot=series-row]")).toHaveCount(PLAIN_BUDGET.sources.length);
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
        sources: [
          ...PLAIN_BUDGET.sources,
          {
            source: "game-state" as const,
            detail: "state block",
            tokens: 402,
            parts: [{ label: "state block", tokens: 402, text: GAME_STATE_TEXT }],
            text: GAME_STATE_TEXT,
          },
        ],
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
  // No window ⇒ no headroom truth to draw, so no fill fraction is invented: the segments span the full rail
  // as pure composition (the owner's carve-out).
  await expect.poll(async () => await filledFraction(component)).toBeGreaterThan(0.98);
});

test("an ESTIMATED ceiling is never drawn as a ratio — the panel says the window is unknown", async ({ mount, page }) => {
  // The owner-reported defect: a cold catalog makes the server fit against a blanket fallback, and the tab
  // showed it as "4,300 / 200,000" — a denominator no model published. The number still drives the fit; this
  // surface refuses to present it as the connected model's window (D41).
  await routeTrpc(page, {
    "chat.previewAssembly": () => ({
      ...PREVIEW_ASSEMBLY_DATA,
      budget: { ...PLAIN_BUDGET, ceilingTokens: 200_000, ceilingEstimated: true },
    }),
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  await expect(component.getByText("4,300 tok · window unknown")).toBeVisible();
  await expect(component.getByText(RE_WINDOW_UNPUBLISHED)).toBeVisible();
  // The fabricated denominator appears NOWHERE on the surface.
  await expect(component.getByText("200,000", { exact: false })).toHaveCount(0);
  // …and the BAR tells the same truth: a 2%-of-200k sliver would be a fill fraction against a window nobody
  // published, so the bar stays composition-only across the full rail.
  await expect.poll(async () => await filledFraction(component)).toBeGreaterThan(0.98);
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
  // memoryIncluded:false → no active flag BADGE. Scoped to the badge and exact-matched on purpose: a bare
  // `getByText("Memory")` now also matches the recall section's heading (#250), which would make this pin
  // fail for a reason that has nothing to do with the flag it is about.
  await expect(component.locator("[data-slot=badge]").getByText("Memory", { exact: true })).toHaveCount(0);
});

test("the diagnostics drawer explains MEMORY RECALL — what was fetched, on what score, and why the rest lost", async ({ mount, page }) => {
  // #250: before this section the ONLY observable memory fact was the `Memory` flag badge — "something was
  // included", with no way to see WHICH blocks or why. The owner's words: "no real easy way to see what
  // memories were fetched and why".
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);
  await component.getByRole("button", { name: RE_DIAGNOSTICS }).click();

  await expect(component.getByText("Memory recall — 2 of 5 surfaced")).toBeVisible();
  // The funnel, in one line: what it chose from → what it scanned → what landed.
  await expect(component.getByText("5 → 4 → 2")).toBeVisible();
  // The QUERY is the "why did it match that" datum — nothing else on the tab carries it.
  await expect(component.getByText("Nate: is the bath house still open?")).toBeVisible();

  const candidates = component.locator("[data-slot=memory-recall-candidate]");
  await expect(candidates).toHaveCount(5);
  // Admitted blocks lead in RANK order and carry the relevance they won on, as a percentage a host can read.
  await expect(candidates.nth(0)).toContainText("#1 tier 0 · block 3");
  await expect(candidates.nth(0)).toContainText("81% match");
  await expect(candidates.nth(1)).toContainText("#2 tier 1 · block 0");
  // …and every reject states the STAGE that eliminated it, in a host's words rather than the internal arm name.
  await expect(candidates.nth(2)).toContainText("below the score floor");
  await expect(candidates.nth(3)).toContainText("covered by a higher tier");
  await expect(candidates.nth(4)).toContainText("still in the live history");
});

test("the diagnostics drawer lists the DELIVERED wire rows in order, with role · speaker · provenance", async ({ mount, page }) => {
  // RPG-NO-PROMPT-DEBUG: block order was reconstructed by hand from wire captures because the shape trace
  // projected stage COUNTS only. These rows are the order/role/voice datum, content-free.
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });

  const component = await mount(<AssemblyPreviewPanelStory />);

  // Collapsed by default — the drawer is a diagnostic, not the tab's headline.
  await expect(component.getByText(RE_WIRE_ROW_1)).toHaveCount(0);
  await component.getByRole("button", { name: RE_DIAGNOSTICS }).click();

  await expect(component.getByText("Wire rows — 5 delivered")).toBeVisible();

  // The ORDER is the datum: each row leads with its position, then role, then the speaker label it carries.
  const rows = component.locator("[data-slot=wire-row-trace]");
  await expect(rows).toHaveCount(5);
  await expect(rows.nth(0)).toContainText("1. user · Nate");
  // The narrator row reads its DECLARED purpose where a speaker label would otherwise sit — and the
  // `standard` row above it prints none, so the axis only shows up when it says something.
  await expect(rows.nth(1)).toContainText("2. assistant · narrator");
  await expect(rows.nth(0)).not.toContainText("standard");
  await expect(rows.nth(4)).toContainText("5. system");

  // The INJECT-NAMED-AS-PLAYER tell, made visible: a row in the PLAYER's voice that is not the player's turn.
  await expect(rows.nth(2)).toContainText("3. user · Nate");
  await expect(rows.nth(2)).toContainText("assembled");
  await expect(rows.nth(2)).toContainText("3,037 chars");

  // A squash that folded an assembled row into a canon turn reports as MERGED — never silently as canon.
  await expect(rows.nth(3)).toContainText("merged");
  // A canon row says so, so "assembled" is a positive claim rather than the absence of a badge.
  await expect(rows.nth(0)).toContainText("canon");
});

// #1462 — the merged room-override fallback is a hard-capped join, so a roster member's card prose can be
// SHORTENED (and, before the per-member allocation, dropped whole) on its way to the model while the trace
// said only "merged (present characters)". The names are the fact that makes it actionable, so they have to
// be VISIBLE, not merely carried on the wire shape.
test("the Trace section names the members whose merged fallback was cut", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => ({
      ...PREVIEW_ASSEMBLY_DATA,
      trace: { ...PREVIEW_TRACE, mergedFallbackTruncated: { mainPrompt: ["Mara", "Niko"], postHistory: ["Niko"] } },
    }),
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });
  const component = await mount(<AssemblyPreviewPanelStory />);
  await component.getByRole("button", { name: RE_DIAGNOSTICS }).click();

  // Both fields fold into ONE line, deduped — Niko is cut in both and must not read as two contributors.
  await expect(component.getByText("Merged fallback cut")).toBeVisible();
  await expect(component.getByText("Mara, Niko", { exact: true })).toBeVisible();
});

test("nothing cut ⇒ the line is ABSENT, not an empty row", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });
  const component = await mount(<AssemblyPreviewPanelStory />);
  await component.getByRole("button", { name: RE_DIAGNOSTICS }).click();
  await expect(component.getByText("World info", { exact: false }).first()).toBeVisible();

  await expect(component.getByText("Merged fallback cut")).toHaveCount(0);
});

// ── side-eye 2026-08-06 (the wire readout's legibility) ─────────────────────────────────────────────
test("the readout is a real LIST, defines its provenance words, and badges only the non-canon arms", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });
  const component = await mount(<AssemblyPreviewPanelStory />);
  await component.getByRole("button", { name: RE_DIAGNOSTICS }).click();
  await expect(component.getByText("Wire rows — 5 delivered")).toBeVisible();

  // ARIA: 24 rows announced as 48 loose paragraphs, with no "1 of 24" and no way to page by item. A list
  // role is what makes the ORDER — the whole subject of this readout — perceptible without sight.
  const list = component.locator('[role="list"]:has([data-slot=wire-row-trace])');
  const rows = component.locator("[data-slot=wire-row-trace]");
  await expect(list).toHaveCount(1);
  await expect(list.getByRole("listitem")).toHaveCount(5);

  // The VOCABULARY, defined where it is read: three bare words meant nothing to anyone who had not read
  // `SHAPE_ROW_SOURCES`' doc comment.
  await expect(component.getByText("canon = a stored message", { exact: false })).toBeVisible();

  // WEIGHT on the anomalies only: `canon` is the expected arm and stays plain type; the two arms that mean
  // "assembly did something to this row" wear the Badge the ShapeTrace summary already uses.
  // The fixture's 5 rows are canon · canon · assembled · merged · assembled ⇒ exactly 3 badged.
  const badges = component.locator("[data-slot=wire-row-trace]").locator("[data-slot=badge]");
  await expect(badges).toHaveCount(3);
  await expect(badges).toHaveText(["assembled", "merged", "assembled"]);
  // …and NEITHER canon row wears one — the quiet arm is the point.
  await expect(rows.nth(0).locator("[data-slot=badge]")).toHaveCount(0);
  await expect(rows.nth(1).locator("[data-slot=badge]")).toHaveCount(0);
});

// The nested 256px scroller hid 17 of 24 rows behind no scrollbar, no fade and no count. It is the LAST
// section of the drawer, so the cap bought nothing — the drawer already lives in the panel's own scroller.
test("the wire readout has NO inner scroller — every delivered row is reachable by scrolling the panel", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => SHAPE_TRACE_DATA,
  });
  const component = await mount(<AssemblyPreviewPanelStory />);
  await component.getByRole("button", { name: RE_DIAGNOSTICS }).click();
  await expect(component.getByText("Wire rows — 5 delivered")).toBeVisible();

  await expect
    .poll(async () =>
      component
        .locator("[data-slot=wire-row-trace]")
        .first()
        .evaluate((row: HTMLElement): boolean => {
          const list = row.parentElement as HTMLElement;
          const style = getComputedStyle(list);
          return style.overflowY !== "visible" && list.scrollHeight > list.clientHeight + 1;
        }),
    )
    .toBe(false);
});

test("no delivered rows ⇒ the drawer says so rather than rendering an empty block", async ({ mount, page }) => {
  await routeTrpc(page, {
    "chat.previewAssembly": () => PREVIEW_ASSEMBLY_DATA,
    "chat.getShapeTrace": () => ({ ...SHAPE_TRACE_DATA, rows: [] }),
  });

  const component = await mount(<AssemblyPreviewPanelStory />);
  await component.getByRole("button", { name: RE_DIAGNOSTICS }).click();

  await expect(component.getByText("Wire rows — 0 delivered")).toBeVisible();
  await expect(component.getByText("This turn delivers no history rows.")).toBeVisible();
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
