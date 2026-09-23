// contracts/inference/capability/reads — the message-handling ladder's reads: the strictness order, the
// floor clamp every turn runs, and the levels the preset knob may offer on a model. One home for the rank:
// SHAPE and the client's knob both read these, so a level added to `ROLE_HANDLING` moves both at once.

import type { RoleHandling } from "@orb/contracts/inference";
import {
  clampRoleHandling,
  GENERATION_FLOOR,
  isStricterRoleHandling,
  ROLE_HANDLING,
  roleHandlingFloorOf,
  USER_ROLE_HANDLING,
  userRoleHandlingOptions,
} from "@orb/contracts/inference";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

describe("the strictness order is the tuple order", () => {
  test("slotted sits between merge and semi-strict", () => {
    expect(isStricterRoleHandling("slotted", "merge")).toBe(true);
    expect(isStricterRoleHandling("semi-strict", "slotted")).toBe(true);
    expect(isStricterRoleHandling("merge", "merge")).toBe(false);
  });
});

describe("clampRoleHandling — the stricter of the model floor and the preset knob", () => {
  test("every (floor, knob) pair resolves to the later of the two in ROLE_HANDLING", () => {
    for (const floor of ROLE_HANDLING) {
      for (const knob of ROLE_HANDLING) {
        const expected: RoleHandling = ROLE_HANDLING.indexOf(knob) > ROLE_HANDLING.indexOf(floor) ? knob : floor;
        expect(clampRoleHandling(floor, knob), `${floor} × ${knob}`).toBe(expected);
      }
    }
  });

  test("an unset knob runs the floor", () => {
    for (const floor of ROLE_HANDLING) {
      expect(clampRoleHandling(floor, undefined)).toBe(floor);
    }
  });

  test("an unmeasured model runs the fail-closed floor, whatever the knob asks", () => {
    expect(clampRoleHandling(roleHandlingFloorOf(GENERATION_FLOOR), "none")).toBe("strict");
    expect(clampRoleHandling(roleHandlingFloorOf({ ...GENERATION_FLOOR, turns: undefined }), undefined)).toBe("strict");
  });
});

describe("the preset knob offers only user levels at or above the model floor", () => {
  test("`slotted` is model-only: the knob never offers it", () => {
    expect(USER_ROLE_HANDLING).toStrictEqual(["none", "merge", "semi-strict", "strict"]);
  });

  test("a slotted floor offers semi-strict and strict; a none floor offers every user level", () => {
    expect(userRoleHandlingOptions("slotted")).toStrictEqual(["semi-strict", "strict"]);
    expect(userRoleHandlingOptions("none")).toStrictEqual(USER_ROLE_HANDLING);
    expect(userRoleHandlingOptions("strict")).toStrictEqual(["strict"]);
  });
});
