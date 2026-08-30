// domain/credentials/substrate/credential-not-found — the persistence→typed-error mapping seam: undefined
// (missing OR not owned — persistence never distinguishes) throws CredentialsNotFoundError naming the id;
// a defined row passes through unchanged.

import type { UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { CredentialsNotFoundError } from "../../../../../packages/server/src/domain/credentials/contract/errors.ts";
import { requireOwned } from "../../../../../packages/server/src/domain/credentials/substrate/credential-not-found.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CREDENTIAL_ID = castId<UserCredentialId>("credential_x");

describe("requireOwned", () => {
  test("undefined (missing or not owned) throws CredentialsNotFoundError naming the id", () => {
    expect(() => requireOwned(undefined, CREDENTIAL_ID)).toThrow(CredentialsNotFoundError);
    expect(() => requireOwned(undefined, CREDENTIAL_ID)).toThrow(CREDENTIAL_ID);
  });

  test("a defined row passes through UNCHANGED (identity, not a copy)", () => {
    const row = { id: CREDENTIAL_ID, source: "openrouter" };
    expect(requireOwned(row, CREDENTIAL_ID)).toBe(row);
  });

  test("a falsy-but-defined row (0, '', false) is NOT treated as missing — only undefined is", () => {
    expect(requireOwned(0, CREDENTIAL_ID)).toBe(0);
    expect(requireOwned("", CREDENTIAL_ID)).toBe("");
    expect(requireOwned(false, CREDENTIAL_ID)).toBe(false);
  });
});
