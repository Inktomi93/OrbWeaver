// SHAPE shaper: fitHistoryToWindow (chat.md Part II §2 SHAPE fit-pass — the stateless-runner hard cap).
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { fitHistoryToWindow } from "../../../../../packages/server/src/domain/chat/assembly/history-budget";
import { expect, test } from "../../../../support/fixtures";

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
});
