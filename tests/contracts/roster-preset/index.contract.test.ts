// @orb/contracts/roster-preset — the saved-party wire's shape pins: the member vocabulary is chat's D80
// `characterMemberSpecSchema` verbatim (kind-discriminated, prefix-validated ids), the member list is
// 1..MAX with one seat per character, `update` reuses the WHOLE create shape (full replace), and the
// groupConfig field refuses a stray key at the boundary (chat's strict arms ride through).

import { createRosterPresetSchema, ROSTER_PRESET_MEMBER_MAX, rosterPresetMembersSchema, updateRosterPresetSchema } from "@orb/contracts/roster-preset";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const CHAR_A = "character_01j0000000000000000000a01a";
const CHAR_B = "character_01j0000000000000000000a01b";

describe("roster-preset wire", () => {
  test("a minimal create input parses: description defaults, optional fields absent, knobs optional", () => {
    const parsed = createRosterPresetSchema.parse({
      name: "  Party  ",
      members: [{ kind: "character", characterId: CHAR_A, position: 0 }],
    });
    expect(parsed.name).toBe("Party"); // trimmed
    expect(parsed.description).toBe("");
    expect(parsed.members[0]?.characterId).toBe(CHAR_A);
    expect(parsed.members[0]?.talkativeness).toBeUndefined();
  });

  test("the member arm is chat's D80 spec: a wrong-prefix id and a missing kind both refuse", () => {
    expect(
      createRosterPresetSchema.safeParse({ name: "P", members: [{ kind: "character", characterId: "chat_01j0000000000000000000a01a", position: 0 }] }).success,
    ).toBe(false);
    expect(createRosterPresetSchema.safeParse({ name: "P", members: [{ characterId: CHAR_A, position: 0 }] }).success).toBe(false);
  });

  test("the member list clamps 1..MAX and refuses a duplicated character", () => {
    expect(rosterPresetMembersSchema.safeParse([]).success).toBe(false);
    const tooMany = Array.from({ length: ROSTER_PRESET_MEMBER_MAX + 1 }, (_, i) => ({
      kind: "character",
      characterId: `character_01j00000000000000000${String(i).padStart(4, "0")}`,
      position: i,
    }));
    expect(rosterPresetMembersSchema.safeParse(tooMany).success).toBe(false);
    expect(
      rosterPresetMembersSchema.safeParse([
        { kind: "character", characterId: CHAR_A, position: 0 },
        { kind: "character", characterId: CHAR_A, position: 1 },
      ]).success,
    ).toBe(false);
    expect(
      rosterPresetMembersSchema.safeParse([
        { kind: "character", characterId: CHAR_A, position: 0 },
        { kind: "character", characterId: CHAR_B, position: 1 },
      ]).success,
    ).toBe(true);
  });

  test("groupConfig rides chat's STRICT arms: a stray key refuses at the wire, a lenient input defaults", () => {
    const stray = createRosterPresetSchema.safeParse({
      name: "P",
      groupConfig: { output: "narrator", bogus: true },
      members: [{ kind: "character", characterId: CHAR_A, position: 0 }],
    });
    expect(stray.success).toBe(false);
    const ok = createRosterPresetSchema.parse({
      name: "P",
      groupConfig: { output: "per-speaker" },
      members: [{ kind: "character", characterId: CHAR_A, position: 0 }],
    });
    expect(ok.groupConfig).toMatchObject({ output: "per-speaker", cardScope: "merged", policy: "natural" });
  });

  test("update IS the create shape (full replace — one schema object, no drift)", () => {
    expect(updateRosterPresetSchema).toBe(createRosterPresetSchema);
  });
});
