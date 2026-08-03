// SHAPE shaper: squashSameRole (chat.md Part II §3 rule 6 — Anthropic adjacent-same-role defense) +
// clampRoleHandling (D66-C, W6 — the SHAPE floor-clamp: effective = stricter of the model floor + user knob).
import type { RoleHandling } from "@orb/contracts/connection";
import { describe } from "vitest";
import { clampRoleHandling, squashSameRole } from "../../../../../packages/server/src/domain/chat/assembly/role-squash.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("squashSameRole", () => {
  test("alternating canon passes through untouched (the common case)", () => {
    const h = [
      { role: "assistant" as const, content: "greeting" },
      { role: "user" as const, content: "u1" },
      { role: "assistant" as const, content: "a1" },
    ];
    expect(squashSameRole(h)).toEqual(h);
  });

  test("merges adjacent same-role with a blank-line join", () => {
    expect(
      squashSameRole([
        { role: "user" as const, content: "note" },
        { role: "user" as const, content: "u2" },
      ]),
    ).toEqual([{ role: "user", content: "note\n\nu2" }]);
  });

  test("drops empty / whitespace-only rows before squashing", () => {
    expect(
      squashSameRole([
        { role: "user" as const, content: "u1" },
        { role: "assistant" as const, content: "   " },
        { role: "user" as const, content: "u2" },
      ]),
    ).toEqual([{ role: "user", content: "u1\n\nu2" }]);
  });

  test("first-wins: extra fields on the FIRST of a same-role run are preserved (name-stamp relies on it)", () => {
    expect(
      squashSameRole([
        { role: "user" as const, content: "first line", authorName: "User" },
        { role: "user" as const, content: "second line" },
      ]),
    ).toEqual([{ role: "user", content: "first line\n\nsecond line", authorName: "User" }]);
  });

  test("a three-run collapses to one (the egocentric scoped fold)", () => {
    expect(
      squashSameRole([
        { role: "user" as const, content: "Aria: greeting" },
        { role: "user" as const, content: "u1" },
        { role: "user" as const, content: "Aria: Aria replies" },
        { role: "assistant" as const, content: "Kai replies" },
      ]),
    ).toEqual([
      { role: "user", content: "Aria: greeting\n\nu1\n\nAria: Aria replies" },
      { role: "assistant", content: "Kai replies" },
    ]);
  });
});

// D66-C (W6): the SHAPE floor-clamp — effective strategy = the STRICTER of the model floor + the user knob
// (`none < merge < semi-strict < strict`). The user may go STRICTER than the wire requires, never looser.
describe("clampRoleHandling (the SHAPE floor-clamp, every (floor, knob) pair)", () => {
  const values: readonly RoleHandling[] = ["none", "merge", "semi-strict", "strict"];
  const rank: Record<RoleHandling, number> = { none: 0, merge: 1, "semi-strict": 2, strict: 3 };

  test("returns the stricter (higher-rank) of floor + knob across every pair", () => {
    for (const floor of values) {
      for (const knob of values) {
        const expected = rank[floor] >= rank[knob] ? floor : knob;
        expect(clampRoleHandling(floor, knob)).toBe(expected);
      }
    }
  });

  test("an unset knob falls to the floor (per value)", () => {
    for (const floor of values) {
      expect(clampRoleHandling(floor, undefined)).toBe(floor);
    }
  });

  test("an unset floor defaults to strict (TURNS_FLOOR) — the conservative today-behavior", () => {
    expect(clampRoleHandling(undefined, undefined)).toBe("strict");
    // A user knob can never go LOOSER than the strict default floor.
    expect(clampRoleHandling(undefined, "none")).toBe("strict");
    expect(clampRoleHandling(undefined, "merge")).toBe("strict");
  });

  test("the user may go STRICTER than a loose floor", () => {
    expect(clampRoleHandling("none", "strict")).toBe("strict");
    expect(clampRoleHandling("merge", "semi-strict")).toBe("semi-strict");
  });

  test("the user can NEVER go looser than the floor (a none knob on a strict floor stays strict)", () => {
    expect(clampRoleHandling("strict", "none")).toBe("strict");
    expect(clampRoleHandling("semi-strict", "merge")).toBe("semi-strict");
  });
});

describe("squashSameRole — system rows (capability-kept depth-0 injections)", () => {
  test("adjacent system rows merge; a system row never folds into a user/assistant neighbor", () => {
    expect(
      squashSameRole([
        { role: "user", content: "u" },
        { role: "system", content: "a" },
        { role: "system", content: "b" },
      ]),
    ).toEqual([
      { role: "user", content: "u" },
      { role: "system", content: "a\n\nb" },
    ]);
  });
});
