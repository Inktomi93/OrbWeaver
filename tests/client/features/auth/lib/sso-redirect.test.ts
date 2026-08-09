// A9 — the SSO-only auto-redirect decision + its suppression list (features/auth/lib/sso-redirect.ts). The
// login surface's effect calls this to decide whether to bounce straight to the IdP. Pins: only `oidc` mode
// redirects; `?authError` (a failed round-trip) and `?form` (the manual escape hatch) each suppress it; other
// params don't. (The "already authed" case is the route guard's, upstream — never this helper's.)

import { describe } from "vitest";
import { shouldAutoRedirectToSso } from "../../../../../packages/client/src/features/auth/lib/sso-redirect.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("shouldAutoRedirectToSso (A9)", () => {
  test("oidc with no suppressing params → redirect", () => {
    expect(shouldAutoRedirectToSso("oidc", "")).toBe(true);
    expect(shouldAutoRedirectToSso("oidc", "?next=/chats")).toBe(true);
  });

  test("non-oidc modes never auto-redirect", () => {
    expect(shouldAutoRedirectToSso("local", "")).toBe(false);
    expect(shouldAutoRedirectToSso("forward-header", "")).toBe(false);
    expect(shouldAutoRedirectToSso("single-user", "")).toBe(false);
  });

  test("?authError suppresses the redirect (a failed round-trip must not loop)", () => {
    expect(shouldAutoRedirectToSso("oidc", "?authError=not_authorized")).toBe(false);
  });

  test("?form suppresses the redirect (the explicit manual-button escape hatch)", () => {
    expect(shouldAutoRedirectToSso("oidc", "?form")).toBe(false);
    expect(shouldAutoRedirectToSso("oidc", "?form=1")).toBe(false);
  });
});
