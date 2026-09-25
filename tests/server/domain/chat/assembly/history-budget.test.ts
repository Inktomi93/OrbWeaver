// SHAPE shaper: fitHistoryToWindow (the chat design doc Part II §2 SHAPE fit-pass — the stateless-runner hard cap).
import type { ProviderId } from "@orb/contracts/inference";
import { GENERATION_FLOOR } from "@orb/contracts/inference";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { detectModelFamily } from "../../../../../packages/inference/src/capability/families.ts";
import { curatedRows } from "../../../../../packages/inference/src/capability/sources/curated/loader.ts";
import { synthesizeCapability } from "../../../../../packages/inference/src/capability/synthesize.ts";
import {
  buildHistoryBudget,
  fitHistoryToWindow,
  HISTORY_TRIM_CHUNK_FRACTION,
  historyTurnTokens,
} from "../../../../../packages/server/src/domain/chat/assembly/history-budget.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const turn = (content: string): { role: "user"; content: string } => ({ role: "user", content });

describe("fitHistoryToWindow", () => {
  test("no trustworthy ceiling (window + softMax both unset) → never trims", () => {
    const h = [turn("a"), turn("b")];
    const out = fitHistoryToWindow(h, { reserveOutputTokens: 1000, systemTokens: 100 });
    expect(out.droppedCount).toBe(0);
    expect(out.history).toEqual(h);
  });

  test("drops oldest turns until the conversation fits the window", () => {
    // QuadChars: ~1 token / 4 ascii chars + 4 overhead/msg. 40-char turns ≈ 14 tokens each.
    const big = "x".repeat(40);
    const h = [turn(`${big}1`), turn(`${big}2`), turn(`${big}3`)];
    const out = fitHistoryToWindow(h, {
      windowTokens: 100,
      reserveOutputTokens: 40,
      systemTokens: 10,
    });
    expect(out.droppedCount).toBeGreaterThan(0);
    // The newest turn is always retained as the LAST element.
    expect(out.history.at(-1)?.content).toBe(`${big}3`);
  });

  test("always keeps the newest turn even when it alone blows the budget (irreducible)", () => {
    const huge = "y".repeat(10_000);
    const out = fitHistoryToWindow([turn("old"), turn(huge)], {
      windowTokens: 50,
      reserveOutputTokens: 10,
      systemTokens: 10,
    });
    expect(out.history).toEqual([turn(huge)]);
    expect(out.droppedCount).toBe(1);
  });

  // The live-context-cutoff catch (2026-07-24): the preview's shaped history ends on the ID-LESS
  // continuation nudge; anchoring the irreducible keep on the newest ROW kept only the nudge under a
  // blown budget — dropping the user's real newest message AND leaving the boundary unnameable
  // (boundaryMessageId null while droppedCount > 0). The irreducible tail is the newest id-bearing
  // turn plus its trailing synthetics.
  test("a blown budget keeps the newest ID-BEARING turn + trailing synthetics, and names it as the boundary", () => {
    const id = (n: number): { role: "user"; content: string; messageId: MessageId } => ({
      role: "user",
      content: `real message ${n} with words`,
      messageId: castId<MessageId>(`message_test_${n}`),
    });
    const nudge = { role: "user" as const, content: "[Continue the conversation.]" };
    const out = fitHistoryToWindow([id(1), id(2), id(3), nudge], {
      windowTokens: 20, // budget deeply negative after reserve+system+margin — nothing "fits"
      reserveOutputTokens: 100,
      systemTokens: 100,
    });
    // The newest real turn survives WITH its trailing nudge; only genuinely older turns drop.
    expect(out.history).toEqual([id(3), nudge]);
    expect(out.droppedCount).toBe(2);
    expect(out.earliestKeptMessageId).toBe(castId<MessageId>("message_test_3"));
  });

  test("the soft cap lowers the ceiling below the window", () => {
    const big = "z".repeat(40);
    const h = [turn(`${big}1`), turn(`${big}2`), turn(`${big}3`)];
    const wide = fitHistoryToWindow(h, {
      windowTokens: 1_000_000,
      reserveOutputTokens: 10,
      systemTokens: 10,
    });
    const capped = fitHistoryToWindow(h, {
      windowTokens: 1_000_000,
      softMaxTokens: 60,
      reserveOutputTokens: 10,
      systemTokens: 10,
    });
    expect(wide.droppedCount).toBe(0);
    expect(capped.droppedCount).toBeGreaterThan(0);
  });

  // The prompt cache is an exact prefix, so the trim snaps to a chunk grid instead of dropping one row per turn.
  describe("the chunked trim", () => {
    const budget = { windowTokens: 2000, reserveOutputTokens: 200, systemTokens: 300 };
    const room = budget.windowTokens - budget.systemTokens - budget.reserveOutputTokens - 64;
    const chunk = Math.round(HISTORY_TRIM_CHUNK_FRACTION * (budget.windowTokens - budget.reserveOutputTokens));
    // Uneven row sizes, so a chunk boundary rarely falls exactly on a row start.
    const rows = Array.from({ length: 240 }, (_, i) => turn(`${i} `.concat("w".repeat(20 + ((i * 37) % 120)))));
    const starts = rows.reduce<number[]>((acc, row) => [...acc, (acc.at(-1) ?? 0) + historyTurnTokens(row)], [0]);
    const startOf = (index: number): number => starts[index] ?? Number.NaN;
    // The oracle: the fewest oldest rows whose removal fits the room.
    const minimalCut = (length: number): number => {
      let cut = 0;
      while (startOf(length) - startOf(cut) > room) {
        cut += 1;
      }
      return cut;
    };
    const fits = Array.from({ length: rows.length }, (_, i) => fitHistoryToWindow(rows.slice(0, i + 1), budget));

    test("every trim fits the room and drops at most one chunk beyond the minimal cut", () => {
      const violations = fits.flatMap((fit, i) => {
        const minimal = minimalCut(i + 1);
        const extra = startOf(fit.droppedCount) - startOf(minimal);
        const lastExtraRow = fit.droppedCount > minimal ? historyTurnTokens(rows[fit.droppedCount - 1] ?? turn("")) : 0;
        return fit.usedTokens <= room && fit.droppedCount >= minimal && extra < chunk + lastExtraRow ? [] : [{ length: i + 1, minimal, cut: fit.droppedCount }];
      });
      expect(violations).toEqual([]);
    });

    test("the cut never moves back as the history grows, and moves once per chunk of growth", () => {
      const cuts = fits.map((fit) => fit.droppedCount).filter((cut) => cut > 0);
      expect(cuts.filter((cut, i) => i > 0 && cut < (cuts[i - 1] ?? 0))).toEqual([]);
      const moves = cuts.filter((cut, i) => i > 0 && cut !== cuts[i - 1]).length;
      const trimmedGrowth = startOf(rows.length) - startOf(fits.findIndex((fit) => fit.droppedCount > 0) + 1);
      expect(moves).toBeGreaterThan(0);
      expect(moves).toBeLessThanOrEqual(Math.ceil(trimmedGrowth / chunk));
    });
  });
});

// The fit reads the resolved window, so a direct hosted model that resolves to the estimated floor loses most of
// its chat on every turn.
describe("the fit against a direct hosted model's resolved window", () => {
  const chat = Array.from({ length: 33 }, (_, i) => turn(`row ${i} `.concat("r".repeat(3200))));
  const budget = (windowTokens: number): Parameters<typeof fitHistoryToWindow>[1] =>
    buildHistoryBudget({ windowTokens, maxContextTokens: undefined, maxOutputTokens: undefined, systemTokens: 1500 });

  test("gpt-4.1-mini keeps a 33-row chat whole, which the estimated floor trims", () => {
    const resolved = synthesizeCapability("generation", detectModelFamily("gpt-4.1-mini"), {
      curated: curatedRows({ model: "gpt-4.1-mini", providerId: castId<ProviderId>("openai"), wire: "openai-compat", api: "chat-completions" }),
    }).capability;
    if (resolved.kind !== "generation") {
      throw new Error("expected a generation capability");
    }
    expect(resolved.generation.context).toEqual({ window: 1_047_576 });

    const kept = fitHistoryToWindow(chat, budget(resolved.generation.context.window));
    expect(kept.droppedCount).toBe(0);
    expect(kept.history).toEqual(chat);

    // PLANTED CONTROL: the chat is long enough that the floor this model used to resolve to drops most of it.
    expect(fitHistoryToWindow(chat, budget(GENERATION_FLOOR.context.window)).droppedCount).toBeGreaterThan(20);
  });
});
