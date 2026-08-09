// A7 — authErrorMessage maps the OIDC callback's sanitized ?authError=<code> to user copy (or null when
// there is nothing to show). Known codes get bespoke copy; an unknown-but-shape-safe code falls back to a
// generic line rather than echoing the raw token.

import { describe } from "vitest";
// A lib INTERNAL the front door doesn't re-export — deep-imported like the _ct-stories precedent.
import { authErrorMessage } from "../../../../../packages/client/src/features/auth/lib/auth-error.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("authErrorMessage", () => {
  test("null / undefined / empty ⇒ null (no error to show)", () => {
    expect(authErrorMessage(null)).toBeNull();
    expect(authErrorMessage(undefined)).toBeNull();
    expect(authErrorMessage("")).toBeNull();
  });

  test("each KNOWN code maps to a bespoke, non-empty message", () => {
    for (const code of ["invalid_state", "no_identity", "not_authorized", "account_exists", "account_disabled", "access_denied", "token_exchange_failed"]) {
      const msg = authErrorMessage(code);
      expect(msg).not.toBeNull();
      expect((msg ?? "").length).toBeGreaterThan(0);
    }
  });

  test("account_disabled copy covers the awaiting-approval case (A2 lands here as enabled:false)", () => {
    expect(authErrorMessage("account_disabled")).toContain("approval");
  });

  test("account_exists copy (MS-W1) tells the user to have an admin LINK the account", () => {
    expect(authErrorMessage("account_exists")).toContain("link");
  });

  test("an UNKNOWN (but shape-safe) code falls back to a generic line — never echoed raw", () => {
    const msg = authErrorMessage("some_unmapped_code");
    expect(msg).not.toBeNull();
    expect(msg).not.toContain("some_unmapped_code");
  });
});
