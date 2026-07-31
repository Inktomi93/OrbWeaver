// assembly/budget — the per-source context accounting behind the host Preview tab's stacked bar (D-4).
// Pins the invariants the surface's honesty rests on: the segments PARTITION the total exactly, the rows
// come back in prompt order with empty sources omitted (a plain chat has no game-state row), the history row
// carries cost-not-content, and the detail line stays a bounded one-liner.

import { buildAssemblyBudget } from "../../../../../packages/server/src/domain/chat/assembly/budget";
import type { AssemblySlice } from "../../../../../packages/server/src/domain/chat/contract/results";
import { expect, test } from "../../../../support/fixtures";

const NO_HISTORY = { usedTokens: 0, keptCount: 0, droppedCount: 0 } as const;

function slice(source: AssemblySlice["source"], label: string, text: string): AssemblySlice {
  return { source, label, text };
}

test("the source rows partition the total exactly, in prompt order, empties omitted", () => {
  const budget = buildAssemblyBudget({
    slices: [
      slice("cards", "character description", "a bold knight who never yields"),
      slice("system", "main prompt", "SYSTEM RULES"),
      slice("world-info", "world info (before)", "LORE: the lantern road"),
      slice("steering", "author's note", ""), // whitespace-empty ⇒ contributes nothing
    ],
    history: { usedTokens: 120, keptCount: 8, droppedCount: 2 },
    ceilingTokens: 8192,
    ceilingEstimated: false,
  });

  expect(budget.sources.map((s) => s.source)).toEqual(["system", "cards", "world-info", "history"]);
  expect(budget.sources.reduce((sum, s) => sum + s.tokens, 0)).toBe(budget.totalTokens);
  expect(budget.ceilingTokens).toBe(8192);
  // Every source's tokens are non-zero (an empty bucket is dropped, never a zero-width segment).
  expect(budget.sources.every((s) => s.tokens > 0)).toBe(true);
});

test("a plain (non-game) chat has NO game-state row; a game chat does", () => {
  const plain = buildAssemblyBudget({ slices: [slice("system", "main prompt", "RULES")], history: NO_HISTORY, ceilingTokens: 0, ceilingEstimated: false });
  expect(plain.sources.map((s) => s.source)).toEqual(["system"]);

  const game = buildAssemblyBudget({
    slices: [slice("system", "main prompt", "RULES"), slice("game-state", "state block", "## Game state\nroster: Mara")],
    history: NO_HISTORY,
    ceilingTokens: 0,
    ceilingEstimated: false,
  });
  expect(game.sources.map((s) => s.source)).toEqual(["system", "game-state"]);
  expect(game.sources.find((s) => s.source === "game-state")?.text).toContain("roster: Mara");
});

test("the history row carries COST and shape, never content", () => {
  const budget = buildAssemblyBudget({
    slices: [],
    history: { usedTokens: 1624, keptCount: 41, droppedCount: 3 },
    ceilingTokens: 8192,
    ceilingEstimated: false,
  });

  const history = budget.sources.find((s) => s.source === "history");
  expect(history).toEqual({ source: "history", detail: "41 turns · 3 dropped", tokens: 1624, parts: [], text: "" });
  // A one-turn chat reads singular, and a fit that dropped nothing says nothing about drops.
  const single = buildAssemblyBudget({ slices: [], history: { usedTokens: 40, keptCount: 1, droppedCount: 0 }, ceilingTokens: 8192, ceilingEstimated: false });
  expect(single.sources.find((s) => s.source === "history")?.detail).toBe("1 turn");
  // An empty chat has no history row at all.
  expect(buildAssemblyBudget({ slices: [], history: NO_HISTORY, ceilingTokens: 0, ceilingEstimated: false }).sources).toEqual([]);
});

test("the detail line dedupes contributors and caps the spelled-out set", () => {
  const budget = buildAssemblyBudget({
    slices: [
      slice("cards", "Mara", "a"),
      slice("cards", "Mara", "b"), // the same member across two sections ⇒ named ONCE
      slice("cards", "Niko", "c"),
      slice("cards", "Sera", "d"),
      slice("cards", "Nate (persona)", "e"),
    ],
    history: NO_HISTORY,
    ceilingTokens: 0,
    ceilingEstimated: false,
  });

  expect(budget.sources[0]?.detail).toBe("Mara · Niko · Sera · +1 more");
  // The drill-in body is every contribution joined — the whole card block, verbatim.
  expect(budget.sources[0]?.text).toBe("a\n\nb\n\nc\n\nd\n\ne");
});

test("each source carries its per-CONTRIBUTOR parts — a room member is ONE line with their own tokens", () => {
  // The owner's question the tab must answer: what is each character in the room costing me?
  const budget = buildAssemblyBudget({
    slices: [
      slice("cards", "Mara", "Mara is a bold knight of the Lantern Road."),
      slice("cards", "Niko", "Niko is a wary scout."),
      slice("cards", "Mara", "Mara's example dialogue: 'Hold the line.'"), // a 2nd section for the SAME member
      slice("system", "Main", "SYSTEM RULES"),
    ],
    history: { usedTokens: 40, keptCount: 2, droppedCount: 0 },
    ceilingTokens: 8192,
    ceilingEstimated: false,
  });

  const cards = budget.sources.find((s) => s.source === "cards");
  expect(cards?.parts.map((p) => p.label)).toEqual(["Mara", "Niko"]);
  // Mara's two sections FOLD into one line carrying both bodies + a real token count.
  const mara = cards?.parts.find((p) => p.label === "Mara");
  expect(mara?.text).toBe("Mara is a bold knight of the Lantern Road.\n\nMara's example dialogue: 'Hold the line.'");
  expect(mara?.tokens).toBeGreaterThan(0);
  expect(cards?.parts.every((p) => p.tokens > 0)).toBe(true);
  // A single-contributor source still reports its one part (the panel then skips the redundant sub-row).
  expect(budget.sources.find((s) => s.source === "system")?.parts).toEqual([{ label: "Main", tokens: expect.any(Number), text: "SYSTEM RULES" }]);
  // History has no contributor split (canon is everyone's, turn by turn).
  expect(budget.sources.find((s) => s.source === "history")?.parts).toEqual([]);
});
