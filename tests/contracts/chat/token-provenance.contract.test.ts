import { combineTokenProvenance, TOKEN_PROVENANCES, tokenProvenanceSchema } from "@orb/contracts/chat";
import { expect, test } from "../../support/fixtures.ts";

test("token provenance has exactly one canonical three-member vocabulary", () => {
  expect(TOKEN_PROVENANCES).toEqual(["measured", "estimated", "unrecorded"]);
  expect(tokenProvenanceSchema.options).toEqual([...TOKEN_PROVENANCES]);
  expect(tokenProvenanceSchema.safeParse("inferred").success).toBe(false);
  for (const value of TOKEN_PROVENANCES) {
    expect(tokenProvenanceSchema.parse(JSON.parse(JSON.stringify(value)))).toBe(value);
  }
});

test("token provenance combination makes estimates dominant and absence neutral", () => {
  expect(combineTokenProvenance("measured", "estimated")).toBe("estimated");
  expect(combineTokenProvenance("unrecorded", "measured")).toBe("measured");
  expect(combineTokenProvenance("unrecorded", "unrecorded")).toBe("unrecorded");
  for (const left of TOKEN_PROVENANCES) {
    for (const right of TOKEN_PROVENANCES) {
      const measured = left === "measured" || right === "measured" ? "measured" : "unrecorded";
      const expected = left === "estimated" || right === "estimated" ? "estimated" : measured;
      expect(combineTokenProvenance(left, right)).toBe(expected);
    }
  }
});
