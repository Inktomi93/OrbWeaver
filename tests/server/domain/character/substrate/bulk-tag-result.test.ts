// substrate/bulk-tag-result — the per-item result builder behind bulk-add/remove-card-tag (#1694). Pins the
// three outcome arms (applied / silent no-op / failed) and the CLOSED failure classification: only the tag
// domain's own `tag_resolve_failed` reads through by code; every other rejection — a foreign
// `DomainOperationError`, a plain `Error`, a non-Error throw — degrades to the honest `unexpected` fallback
// rather than fabricating a code the verb never threw.

import { CHARACTER_BULK_TAG_RESOLVE_FAILED_OP_CODE, CHARACTER_BULK_TAG_UNEXPECTED_OP_CODE } from "@orb/contracts/character";
import { DomainOperationError } from "@orb/kit/errors";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { buildBulkTagResult } from "../../../../../packages/server/src/domain/character/substrate/bulk-tag-result.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const A = castId<CharacterId>("character_bulktagresult00a");
const B = castId<CharacterId>("character_bulktagresult00b");
const C = castId<CharacterId>("character_bulktagresult00c");
const D = castId<CharacterId>("character_bulktagresult00d");

describe("buildBulkTagResult", () => {
  test("applied, silent no-op and failed land in their own arms, each named by its own id", () => {
    const result = buildBulkTagResult([
      { characterId: A, applied: true },
      { characterId: B, applied: false },
      { characterId: C, failed: new Error("the tag store is down") },
    ]);
    expect(result.applied).toStrictEqual([A]);
    expect(result.failed).toStrictEqual([{ id: C, error: { code: CHARACTER_BULK_TAG_UNEXPECTED_OP_CODE, message: "the tag store is down" } }]);
  });

  test("the failure union is CLOSED: only the tag domain's own code reads through, everything else is `unexpected`", () => {
    const result = buildBulkTagResult([
      { characterId: A, failed: new DomainOperationError(CHARACTER_BULK_TAG_RESOLVE_FAILED_OP_CODE, "no such tag") },
      { characterId: B, failed: new DomainOperationError("some_other_domain_code", "a foreign refusal") },
      { characterId: C, failed: "a bare string throw" },
      { characterId: D, failed: undefined },
    ]);
    expect(result.applied).toStrictEqual([]);
    expect(result.failed.map((f) => [f.id, f.error.code])).toStrictEqual([
      [A, CHARACTER_BULK_TAG_RESOLVE_FAILED_OP_CODE],
      [B, CHARACTER_BULK_TAG_UNEXPECTED_OP_CODE],
      [C, CHARACTER_BULK_TAG_UNEXPECTED_OP_CODE],
      [D, CHARACTER_BULK_TAG_UNEXPECTED_OP_CODE],
    ]);
    // A foreign code's MESSAGE still reads through (it is the verb's own words); a non-Error throw gets the
    // generic sentence, never a stringified value the client would render as prose.
    expect(result.failed[1]?.error.message).toBe("a foreign refusal");
    expect(result.failed[2]?.error.message).toBe("an unexpected error");
  });

  test("an empty batch is an empty result on both arms", () => {
    expect(buildBulkTagResult([])).toStrictEqual({ applied: [], failed: [] });
  });
});
