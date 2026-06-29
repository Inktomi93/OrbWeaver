// SHAPE shaper: fitHistoryToWindow (chat.md Part II §2 SHAPE fit-pass — the stateless-runner hard cap).
import { describe, expect, test } from "vitest";
import { fitHistoryToWindow } from "../../../../../packages/server/src/domain/chat/assembly/history-budget";

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
});
