import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowMacroNameContext, RowPersonaName } from "@orb/kit/macro";
import { describe } from "vitest";
import { DEFAULT_OUTPUT_RESERVE_TOKENS, fitBlockToBudget, SUMMARIZER_CONTEXT_FLOOR } from "../../../../../../../packages/server/src/domain/chat/memory/build/substrate/token-guard.ts";
import type { MsgRow } from "../../../../../../../packages/server/src/domain/chat/memory/types.ts";
import { expect, test } from "../../../../../../support/fixtures.ts";

const aria = castId<CharacterId>("character_aria");
const names: RowMacroNameContext = {
  characterNamesById: new Map([[aria, { name: "Aria" }]]),
  personaNamesById: new Map<PersonaId, RowPersonaName>(),
};

function row(seq: number, content: string): MsgRow {
  return {
    seq,
    role: "assistant",
    kind: "standard",
    characterId: aria,
    authorUserId: null,
    personaId: null,
    content,
  };
}

describe("memory/build/substrate/token-guard", () => {
  test("a block that fits the budget is returned unchanged", () => {
    const rows = [row(1, "hello"), row(2, "there")];
    expect(fitBlockToBudget(rows, names, 32_000, 100, DEFAULT_OUTPUT_RESERVE_TOKENS)).toEqual(rows);
  });

  test("trim-to-fit drops the OLDEST messages until the transcript fits (never truncates the tail)", () => {
    const rows = [row(1, "a".repeat(4000)), row(2, "short")];
    // A budget that fits "Aria: short" but not the giant oldest message ⇒ the oldest is dropped.
    const fitted = fitBlockToBudget(rows, names, 1100, 0, DEFAULT_OUTPUT_RESERVE_TOKENS);
    expect(fitted).not.toBeNull();
    expect(fitted?.map((r) => r.seq)).toEqual([2]);
  });

  test("skip-and-flag: when even the newest single message overflows, returns null (no silent truncation)", () => {
    const rows = [row(1, "a".repeat(4000)), row(2, "b".repeat(4000))];
    expect(fitBlockToBudget(rows, names, 64, 0, DEFAULT_OUTPUT_RESERVE_TOKENS)).toBeNull();
  });

  test("a non-positive budget (system prompt + reserve exceed the context) returns null", () => {
    expect(fitBlockToBudget([row(1, "x")], names, 100, 5000, DEFAULT_OUTPUT_RESERVE_TOKENS)).toBeNull();
  });

  test("the §10 context floor is a positive constant the build's soft-warning compares against", () => {
    expect(SUMMARIZER_CONTEXT_FLOOR).toBeGreaterThan(0);
  });
});
