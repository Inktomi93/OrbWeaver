// assembly/budget — the per-source context accounting behind the host Preview tab's stacked bar (D-4), and
// the per-SECTION partition the preset editor's bound Prompt readout prices its rack off (D121-G). Pins the
// invariants the surfaces' honesty rests on: the segments PARTITION the total exactly, the rows come back in
// prompt order with empty sources omitted (a plain chat has no game-state row), the history row carries
// cost-not-content, the detail line stays a bounded one-liner — and the section partition keys on real rack
// ids, prices the pivot off the FIT, and omits what rendered nothing.

import type { PromptSection } from "@orb/contracts/preset";
import { buildAssemblyBudget } from "../../../../../packages/server/src/domain/chat/assembly/budget.ts";
import type { AssemblySlice } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const NO_HISTORY = { usedTokens: 0, keptCount: 0, droppedCount: 0, rows: [] } as const;

function slice(source: AssemblySlice["source"], label: string, text: string, sectionId?: string): AssemblySlice {
  return sectionId === undefined ? { source, label, text } : { source, label, text, sectionId };
}

/** A rack row, minimally — only `id`/`type`/`marker` matter to the accounting. */
function marker(id: string, markerType: Extract<PromptSection, { type: "marker" }>["marker"]): PromptSection {
  return { type: "marker", id, name: id, marker: markerType, role: "system", enabled: true };
}

test("the source rows partition the total exactly, in prompt order, empties omitted", () => {
  const budget = buildAssemblyBudget({
    slices: [
      slice("cards", "character description", "a bold knight who never yields"),
      slice("system", "main prompt", "SYSTEM RULES"),
      slice("world-info", "world info (before)", "LORE: the lantern road"),
      slice("steering", "author's note", ""), // whitespace-empty ⇒ contributes nothing
    ],
    history: { usedTokens: 120, keptCount: 8, droppedCount: 2, rows: [] },
    ceilingTokens: 8192,
    ceilingEstimated: false,
    sections: [],
  });

  expect(budget.sources.map((s) => s.source)).toEqual(["system", "cards", "world-info", "history"]);
  expect(budget.sources.reduce((sum, s) => sum + s.tokens, 0)).toBe(budget.totalTokens);
  expect(budget.ceilingTokens).toBe(8192);
  // Every source's tokens are non-zero (an empty bucket is dropped, never a zero-width segment).
  expect(budget.sources.every((s) => s.tokens > 0)).toBe(true);
});

test("a plain (non-game) chat has NO game-state row; a game chat does", () => {
  const plain = buildAssemblyBudget({
    slices: [slice("system", "main prompt", "RULES")],
    history: NO_HISTORY,
    ceilingTokens: 0,
    ceilingEstimated: false,
    sections: [],
  });
  expect(plain.sources.map((s) => s.source)).toEqual(["system"]);

  const game = buildAssemblyBudget({
    slices: [slice("system", "main prompt", "RULES"), slice("game-state", "state block", "## Game state\nroster: Mara")],
    history: NO_HISTORY,
    ceilingTokens: 0,
    ceilingEstimated: false,
    sections: [],
  });
  expect(game.sources.map((s) => s.source)).toEqual(["system", "game-state"]);
  expect(game.sources.find((s) => s.source === "game-state")?.text).toContain("roster: Mara");
});

test("the history row carries COST and shape, never content", () => {
  const budget = buildAssemblyBudget({
    slices: [],
    history: { usedTokens: 1624, keptCount: 41, droppedCount: 3, rows: [] },
    ceilingTokens: 8192,
    ceilingEstimated: false,
    sections: [],
  });

  const history = budget.sources.find((s) => s.source === "history");
  expect(history).toEqual({ source: "history", detail: "41 turns · 3 dropped", tokens: 1624, parts: [], text: "" });
  // A one-turn chat reads singular, and a fit that dropped nothing says nothing about drops.
  const single = buildAssemblyBudget({
    slices: [],
    history: { usedTokens: 40, keptCount: 1, droppedCount: 0, rows: [] },
    ceilingTokens: 8192,
    ceilingEstimated: false,
    sections: [],
  });
  expect(single.sources.find((s) => s.source === "history")?.detail).toBe("1 turn");
  // An empty chat has no history row at all.
  expect(buildAssemblyBudget({ slices: [], history: NO_HISTORY, ceilingTokens: 0, ceilingEstimated: false, sections: [] }).sources).toEqual([]);
});

test("the detail line dedupes contributors and caps the spelled-out set", () => {
  const budget = buildAssemblyBudget({
    slices: [
      slice("cards", "Mara", "a"),
      slice("cards", "Mara", "b"), // the same member across two sections ⇒ named ONCE
      slice("cards", "Niko", "c"),
      slice("cards", "Sera", "d"),
      slice("cards", "Alex (persona)", "e"),
    ],
    history: NO_HISTORY,
    ceilingTokens: 0,
    ceilingEstimated: false,
    sections: [],
  });

  expect(budget.sources[0]?.detail).toBe("Mara · Niko · Sera · +1 more");
  // The drill-in body is every contribution joined — the whole card block, verbatim.
  expect(budget.sources[0]?.text).toBe("a\n\nb\n\nc\n\nd\n\ne");
});

// ── the per-SECTION partition (D121-G — the preset editor's bound Prompt readout) ─────────────────────────

test("the section partition keys on RACK IDS, in rack order, and omits what rendered nothing", () => {
  const budget = buildAssemblyBudget({
    sections: [marker("main", "main_prompt"), marker("wi-before", "world_info_before"), marker("scenario", "scenario")],
    slices: [
      // Deliberately emitted OUT of rack order — the partition follows the RACK, which is what the readout draws.
      slice("world-info", "World info (before)", "LORE: the lantern road", "wi-before"),
      slice("system", "Main", "SYSTEM RULES", "main"),
      // A section that rendered to nothing contributes no row at all (never a fabricated zero).
      slice("cards", "Scenario", "   ", "scenario"),
      // An INJECTION carries no sectionId — it is not a rack row, and must not invent one.
      slice("steering", "chat injections", "remember the cake"),
    ],
    history: NO_HISTORY,
    ceilingTokens: 0,
    ceilingEstimated: false,
  });

  expect(budget.sections.map((s) => s.sectionId)).toEqual(["main", "wi-before"]);
  expect(budget.sections.every((s) => s.tokens > 0)).toBe(true);
  // Every section reports its breakdown — a single-contributor section is ONE row, never an empty list.
  expect(budget.sections.map((s) => s.rows.map((r) => r.label))).toEqual([["Main"], ["World info (before)"]]);
});

test("the history PIVOT is priced off the FIT, with one materialized row per kept turn", () => {
  const rows = [
    { label: "user", tokens: 300 },
    { label: "Azarael", tokens: 924 },
  ];
  const budget = buildAssemblyBudget({
    sections: [marker("main", "main_prompt"), marker("chat-history", "chat_history"), marker("chat-history-2", "chat_history")],
    slices: [slice("system", "Main", "SYSTEM RULES", "main")],
    history: { usedTokens: 1224, keptCount: 2, droppedCount: 3, rows },
    ceilingTokens: 8192,
    ceilingEstimated: false,
  });

  // The pivot renders nothing in the BUILD walk (it IS the split), so its cost comes from the fit — and the
  // SECOND `chat_history` row splits nothing, so it stays absent rather than double-counting the conversation.
  expect(budget.sections.map((s) => s.sectionId)).toEqual(["main", "chat-history"]);
  const pivot = budget.sections.find((s) => s.sectionId === "chat-history");
  expect(pivot?.tokens).toBe(1224);
  expect(pivot?.rows).toEqual(rows);
});

test("a section's rows FOLD by contributor — a merged card section is one row per member", () => {
  const budget = buildAssemblyBudget({
    sections: [marker("char-desc", "char_description")],
    slices: [
      slice("cards", "Mara", "Mara is a bold knight of the Lantern Road.", "char-desc"),
      slice("cards", "Niko", "Niko is a wary scout.", "char-desc"),
      slice("cards", "Mara", "Mara holds the line.", "char-desc"),
    ],
    history: NO_HISTORY,
    ceilingTokens: 0,
    ceilingEstimated: false,
  });

  const desc = budget.sections[0];
  expect(desc?.rows.map((r) => r.label)).toEqual(["Mara", "Niko"]);
  expect(desc?.rows.every((r) => r.tokens > 0)).toBe(true);
  // The section total is estimated over the JOINED text (the source-row rule), so it is the whole block's cost.
  expect(desc?.tokens).toBeGreaterThan(desc?.rows[0]?.tokens ?? 0);
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
    history: { usedTokens: 40, keptCount: 2, droppedCount: 0, rows: [] },
    ceilingTokens: 8192,
    ceilingEstimated: false,
    sections: [],
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
