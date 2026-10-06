import { refinerySchemaPlanLine, refinerySchemaPlanSchema, schemaPlanReasonOf } from "@orb/contracts/refinery";
import { expect, test } from "../../support/fixtures.ts";

test("schema plans preserve each refusal and carrier outcome rather than substituting a success", () => {
  const plans = [
    { outcome: "unbound" },
    { outcome: "background-refused", model: "m" },
    { outcome: "sends", model: "m", carrier: "native" },
    { outcome: "sends", model: "m", carrier: "tool" },
    { outcome: "refused", model: "m", reasons: ["too deep"] },
    { outcome: "no-structured", model: "m" },
  ];
  for (const value of plans) {
    const parsed = refinerySchemaPlanSchema.parse(JSON.parse(JSON.stringify(value)));
    expect(parsed).toEqual(value);
    expect(refinerySchemaPlanLine(parsed)).toContain("Utility model");
  }
  expect(refinerySchemaPlanSchema.safeParse({ outcome: "sends", model: "m", carrier: "invented" }).success).toBe(false);
  expect(refinerySchemaPlanSchema.safeParse({ outcome: "unbound", privateField: "secret" }).success).toBe(false);
});

test("schema refusal copy preserves the violated location and actual ceiling", () => {
  expect(schemaPlanReasonOf({ kind: "depth", mode: "hosted-common", count: 8, limit: 4 })).toContain("8 levels deep, past its limit of 4");
  expect(schemaPlanReasonOf({ kind: "refused-keyword", mode: "hosted-common", path: "row.kind", keyword: "oneOf" })).toContain('"oneOf" at "row.kind"');
  expect(schemaPlanReasonOf({ kind: "root-not-object", mode: "hosted-common", path: "" })).toBe("a top level that is not an object with fields");
});
