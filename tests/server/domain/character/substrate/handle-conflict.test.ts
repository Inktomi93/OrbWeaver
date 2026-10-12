// substrate/handle-conflict — the one classification of the per-owner handle-uniqueness refusal. rpg promotion
// recovers only from this refusal; every other failure, including another code on the same error class, stays loud.

import { CHARACTER_HANDLE_CONFLICT_OP_CODE, CHARACTER_HANDLE_RESERVED_OP_CODE } from "@orb/contracts/character";
import { CharacterOperationError, isCharacterHandleConflict } from "@orb/server/domain/character";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("only the handle-conflict code on the character operation error classifies as a conflict", () => {
  expect(isCharacterHandleConflict(new CharacterOperationError(CHARACTER_HANDLE_CONFLICT_OP_CODE, "taken"))).toBe(true);
  expect(isCharacterHandleConflict(new CharacterOperationError(CHARACTER_HANDLE_RESERVED_OP_CODE, "reserved"))).toBe(false);
  expect(isCharacterHandleConflict(new Error(CHARACTER_HANDLE_CONFLICT_OP_CODE))).toBe(false);
});
