// domain/refinery/substrate/schema-library — pins the S5 registry-hygiene scar: the coded refusal names
// the exact submitted string (not a normalized one) in its message, while the REASON code stays constant
// for the client to key its UI off — the case-insensitivity itself is the CALLER's uniqueness check
// (queries.ts), this file's job is just to produce the right typed refusal.

import { describe } from "vitest";
import { SCHEMA_NAME_TAKEN_REASON, schemaNameTakenError } from "../../../../../packages/server/src/domain/refinery/substrate/schema-library.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("schemaNameTakenError", () => {
  test("the error carries the coded reason the client reads off the BAD_REQUEST body", () => {
    const err = schemaNameTakenError("MyScorer");
    expect(err.code).toBe(SCHEMA_NAME_TAKEN_REASON);
    expect(SCHEMA_NAME_TAKEN_REASON).toBe("refinery_schema_name_taken");
  });

  test("the message quotes the SUBMITTED name verbatim, not a normalized/lowercased one", () => {
    const err = schemaNameTakenError("MyScorer");
    expect(err.message).toContain('"MyScorer"');
    expect(err.message).not.toContain('"myscorer"');
  });

  test("the message states the per-library case-insensitive uniqueness rule", () => {
    const err = schemaNameTakenError("x");
    expect(err.message.toLowerCase()).toContain("case-insensitive");
  });
});
