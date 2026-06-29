import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import {
  fitBlockToBudget,
  SUMMARIZER_CONTEXT_FLOOR,
} from "../../../../../../../packages/server/src/domain/chat/memory/build/substrate/token-guard";
import type { MsgRow } from "../../../../../../../packages/server/src/domain/chat/memory/types";

const aria = castId<CharacterId>("character_aria");
const names = new Map<CharacterId, string>([[aria, "Aria"]]);

function row(seq: number, content: string): MsgRow {
  return { seq, role: "assistant", characterId: aria, authorUserId: null, content };
}

describe("memory/build/substrate/token-guard", () => {
  test("a block that fits the budget is returned unchanged", () => {
    const rows = [row(1, "hello"), row(2, "there")];
    expect(fitBlockToBudget(rows, names, 32_000, 100)).toEqual(rows);
  });

  test("trim-to-fit drops the OLDEST messages until the transcript fits (never truncates the tail)", () => {
    const rows = [row(1, "a".repeat(4000)), row(2, "short")];
    // A budget that fits "Aria: short" but not the giant oldest message ⇒ the oldest is dropped.
    const fitted = fitBlockToBudget(rows, names, 1100, 0);
    expect(fitted).not.toBeNull();
    expect(fitted?.map((r) => r.seq)).toEqual([2]);
  });

  test("skip-and-flag: when even the newest single message overflows, returns null (no silent truncation)", () => {
    const rows = [row(1, "a".repeat(4000)), row(2, "b".repeat(4000))];
    expect(fitBlockToBudget(rows, names, 64, 0)).toBeNull();
  });

  test("a non-positive budget (system prompt + reserve exceed the context) returns null", () => {
    expect(fitBlockToBudget([row(1, "x")], names, 100, 5000)).toBeNull();
  });

  test("the §10 context floor is a positive constant the build's soft-warning compares against", () => {
    expect(SUMMARIZER_CONTEXT_FLOOR).toBeGreaterThan(0);
  });
});
