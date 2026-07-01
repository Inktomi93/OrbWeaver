// substrate: macro-swap — the load-bearing two-pass collision invariant (persona.md §Esoteric). The
// critical case is a description containing BOTH macros: a naive one-pass swap would double-hit and corrupt
// it; the two intermediate tokens guarantee each source macro lands exactly once.

import { describe } from "vitest";
import { swapPersonaMacros } from "../../../../../packages/server/src/domain/persona/substrate/macro-swap.ts";
import { expect, test } from "../../../../support/fixtures";

describe("swapPersonaMacros", () => {
  test("inverts both macros in a string containing BOTH (the collision case)", () => {
    expect(swapPersonaMacros("{{char}} greets {{user}}")).toBe("{{user}} greets {{char}}");
  });

  test("a double-swap would corrupt — the two-pass keeps it a clean single inversion", () => {
    // If the swap collided, applying it twice would NOT return to the original. It must round-trip.
    const original = "{{char}} and {{user}} and {{char}}";
    expect(swapPersonaMacros(swapPersonaMacros(original))).toBe(original);
  });

  test("is case-insensitive on the macro tokens", () => {
    expect(swapPersonaMacros("{{Char}} / {{USER}}")).toBe("{{user}} / {{char}}");
  });

  test("leaves text without macros untouched", () => {
    expect(swapPersonaMacros("no macros here")).toBe("no macros here");
  });
});
