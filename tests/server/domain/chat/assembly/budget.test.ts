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
  });

  expect(budget.sources.map((s) => s.source)).toEqual(["system", "cards", "world-info", "history"]);
  expect(budget.sources.reduce((sum, s) => sum + s.tokens, 0)).toBe(budget.totalTokens);
  expect(budget.ceilingTokens).toBe(8192);
  // Every source's tokens are non-zero (an empty bucket is dropped, never a zero-width segment).
  expect(budget.sources.every((s) => s.tokens > 0)).toBe(true);
});

test("a plain (non-game) chat has NO game-state row; a game chat does", () => {
  const plain = buildAssemblyBudget({ slices: [slice("system", "main prompt", "RULES")], history: NO_HISTORY, ceilingTokens: 0 });
  expect(plain.sources.map((s) => s.source)).toEqual(["system"]);

  const game = buildAssemblyBudget({
    slices: [slice("system", "main prompt", "RULES"), slice("game-state", "state block", "## Game state\nroster: Mara")],
    history: NO_HISTORY,
    ceilingTokens: 0,
  });
  expect(game.sources.map((s) => s.source)).toEqual(["system", "game-state"]);
  expect(game.sources.find((s) => s.source === "game-state")?.text).toContain("roster: Mara");
});

test("the history row carries COST and shape, never content", () => {
  const budget = buildAssemblyBudget({ slices: [], history: { usedTokens: 1624, keptCount: 41, droppedCount: 3 }, ceilingTokens: 8192 });

  const history = budget.sources.find((s) => s.source === "history");
  expect(history).toEqual({ source: "history", detail: "41 turns · 3 dropped", tokens: 1624, text: "" });
  // A one-turn chat reads singular, and a fit that dropped nothing says nothing about drops.
  const single = buildAssemblyBudget({ slices: [], history: { usedTokens: 40, keptCount: 1, droppedCount: 0 }, ceilingTokens: 8192 });
  expect(single.sources.find((s) => s.source === "history")?.detail).toBe("1 turn");
  // An empty chat has no history row at all.
  expect(buildAssemblyBudget({ slices: [], history: NO_HISTORY, ceilingTokens: 0 }).sources).toEqual([]);
});

test("the detail line dedupes contributors and caps the spelled-out set", () => {
  const budget = buildAssemblyBudget({
    slices: [
      slice("cards", "character description", "a"),
      slice("cards", "character description", "b"), // same contributor twice (merged cast) ⇒ named once
      slice("cards", "personality", "c"),
      slice("cards", "dialogue examples", "d"),
      slice("cards", "persona", "e"),
    ],
    history: NO_HISTORY,
    ceilingTokens: 0,
  });

  expect(budget.sources[0]?.detail).toBe("character description · personality · dialogue examples · +1 more");
  // The drill-in body is every contribution joined — the whole card block, verbatim.
  expect(budget.sources[0]?.text).toBe("a\n\nb\n\nc\n\nd\n\ne");
});
