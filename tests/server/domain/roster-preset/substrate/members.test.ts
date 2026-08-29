// substrate/members — the pure wire→junction normalization: sort by wire position (stable — wire order
// breaks ties), re-stamp dense 0..n-1, canonicalize knob absence (talkativeness → NULL, disabled → false).

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { normalizeMembers } from "../../../../../packages/server/src/domain/roster-preset/substrate/members.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const A = castId<CharacterId>("character_a");
const B = castId<CharacterId>("character_b");
const C = castId<CharacterId>("character_c");

describe("normalizeMembers", () => {
  test("sorts by wire position and re-stamps dense 0..n-1 (sparse + out-of-order input)", () => {
    const out = normalizeMembers([
      { kind: "character", characterId: A, position: 30 },
      { kind: "character", characterId: B, position: 5 },
      { kind: "character", characterId: C, position: 12 },
    ]);
    expect(out.map((m) => m.characterId)).toEqual([B, C, A]);
    expect(out.map((m) => m.position)).toEqual([0, 1, 2]);
  });

  test("ties keep wire order (stable sort) and knob absence canonicalizes", () => {
    const out = normalizeMembers([
      { kind: "character", characterId: A, position: 0, talkativeness: 0.7 },
      { kind: "character", characterId: B, position: 0, disabled: true },
    ]);
    expect(out.map((m) => m.characterId)).toEqual([A, B]);
    expect(out[0]).toEqual({ characterId: A, position: 0, talkativeness: 0.7, disabled: false });
    expect(out[1]).toEqual({ characterId: B, position: 1, talkativeness: null, disabled: true });
  });
});
