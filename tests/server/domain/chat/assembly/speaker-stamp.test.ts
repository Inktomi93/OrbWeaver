// SHAPE shaper: hasMultipleCharacters (chat.md Part II §3 rule 5; Part III §12 inv 1 — the no-op guard
// that keeps SOLO byte-identical).
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { hasMultipleCharacters } from "../../../../../packages/server/src/domain/chat/assembly/speaker-stamp.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ARIA = castId<CharacterId>("character_aria");
const KAI = castId<CharacterId>("character_kai");

describe("hasMultipleCharacters", () => {
  test("solo (one character across all assistant rows) → false", () => {
    expect(hasMultipleCharacters([{ role: "assistant", characterId: ARIA }, { role: "user" }, { role: "assistant", characterId: ARIA }])).toBe(false);
  });

  test("two distinct authoring characters → true", () => {
    expect(
      hasMultipleCharacters([
        { role: "assistant", characterId: ARIA },
        { role: "assistant", characterId: KAI },
      ]),
    ).toBe(true);
  });

  test("user rows never count toward distinctness", () => {
    expect(
      hasMultipleCharacters([
        { role: "user", characterId: ARIA },
        { role: "user", characterId: KAI },
      ]),
    ).toBe(false);
  });

  test("unattributed assistant rows (null/absent characterId) don't count", () => {
    expect(hasMultipleCharacters([{ role: "assistant", characterId: null }, { role: "assistant" }])).toBe(false);
  });

  test("empty history → false", () => {
    expect(hasMultipleCharacters([])).toBe(false);
  });
});
