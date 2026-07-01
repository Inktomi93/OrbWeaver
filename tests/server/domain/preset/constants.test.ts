// The enforcer for preset.md esoteric #1: SYSTEM_DEFAULT_PRESET_ID is the NIL TypeID, and it MUST satisfy
// the branded `typeIdSchema('preset_')` constraint (every request boundary validates the prefix; a human-
// readable sentinel would be rejected). This test pins that the chosen literal is a valid preset id — if
// someone "cleans it up" to `'system-default'`, this goes red before it reaches a boundary.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { SYSTEM_DEFAULT_PRESET_ID } from "@orb/server/domain/preset";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

describe("SYSTEM_DEFAULT_PRESET_ID", () => {
  test("is the all-zero NIL TypeID literal", () => {
    expect(SYSTEM_DEFAULT_PRESET_ID).toBe("preset_00000000000000000000000000");
  });

  test("satisfies the branded typeIdSchema('preset_') constraint (passes a request boundary)", () => {
    const parsed = typeIdSchema(ID_PREFIX.preset).safeParse(SYSTEM_DEFAULT_PRESET_ID);
    expect(parsed.success).toBe(true);
  });
});
