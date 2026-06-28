// roll — the deterministic gacha. BYTE-STABLE (buddy.md invariant #4): the golden test PINS
// `roll(knownId)` to fixed bones so a salt rotation or a draw-order change goes RED (it would re-roll
// every user's preview). Also pins purity (same id → same bones) + per-id divergence. (substrate is a
// flat file — imported by deep relative path, not the @orb front door which only exposes directories.)

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import { roll } from "../../../../../packages/server/src/domain/buddy/substrate/roll.ts";

const alice = castId<UserId>("user_alice");
const bob = castId<UserId>("user_bob");

describe("roll (deterministic gacha)", () => {
  test("GOLDEN: a known id rolls fixed bones (salt + draw order are frozen — invariant #4)", () => {
    const b = roll(alice).bones;
    expect(b.rarity).toBe("uncommon");
    expect(b.species).toBe("scribe");
    expect(b.eye).toBe("°");
    expect(b.hat).toBe("crown");
    expect(b.shiny).toBe(false);
    // biome-ignore lint/style/useNamingConvention: STAT_NAMES are the CONSTANT_CASE disposition-stat axis (the @orb/contracts/buddy one home).
    expect(b.stats).toEqual({ LORE: 70, WIT: 54, WARMTH: 24, MISCHIEF: 31, FOCUS: 15 });
    expect(roll(alice).inspirationSeed).toBe(390_640_600);
  });

  test("a common buddy always wears no hat (the rarity→hat rule)", () => {
    const r = roll(bob);
    expect(r.bones.rarity).toBe("common");
    expect(r.bones.hat).toBe("none");
  });

  test("the roll is a pure function of the id — same id → identical bones", () => {
    expect(roll(alice)).toEqual(roll(alice));
  });

  test("different ids roll different creatures", () => {
    expect(roll(alice).bones).not.toEqual(roll(bob).bones);
  });

  test("every stat stays within [1, 100]", () => {
    for (const value of Object.values(roll(alice).bones.stats)) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});
