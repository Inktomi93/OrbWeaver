// tests/inference/backends/agent-sdk/verify — the SDK error-code classification that decides a key's fate.
//
// `auth_failed` is the one kind the credentials domain revokes on (`maybe-revoke-on-auth-failed.ts`). An
// account-state block must therefore never classify as it: the token still works once the account clears,
// and a revoke would force the user to paste it again.

import { classifyAssistantError } from "../../../../packages/inference/src/backends/agent-sdk/verify.ts";
import { expect, test } from "../../../support/fixtures.ts";

test("account-state blocks are non-retryable and never strike out the stored token", () => {
  for (const code of ["account_on_hold", "verification_required"] as const) {
    expect(classifyAssistantError(code), code).toEqual({ kind: "billing", retryable: false });
  }
  expect(classifyAssistantError("cloud_credential_error")).toEqual({ kind: "unknown", retryable: false });
});

test("a rejected token is still the revoking kind", () => {
  expect(classifyAssistantError("authentication_failed")).toEqual({ kind: "auth_failed", retryable: false });
});
