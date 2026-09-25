// A9 (default flipped 2026-08-09) — the SSO auto-redirect decision (features/auth/lib/sso-redirect.ts). The
// login surface's effect calls this to decide whether to bounce straight to the IdP. Pins: the DEFAULT is to
// show the branded page (no redirect); only `oidc` + explicit `?sso` bounces; `?authError` (a failed
// round-trip) suppresses it even beside `?sso`; non-oidc modes never bounce. (The "already authed" case is
// the route guard's, upstream — never this helper's.)

import { describe } from "vitest";
import { isPendingJoinLanding, oidcLoginUrl, shouldAutoRedirectToSso } from "../../../../../packages/client/src/features/auth/lib/sso-redirect.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("shouldAutoRedirectToSso (A9)", () => {
  test("oidc DEFAULT is show-the-page (no redirect without the opt-in)", () => {
    expect(shouldAutoRedirectToSso("oidc", "")).toBe(false);
    expect(shouldAutoRedirectToSso("oidc", "?next=/chats")).toBe(false);
    expect(shouldAutoRedirectToSso("oidc", "?form")).toBe(false);
  });

  test("?sso opts into the instant bounce", () => {
    expect(shouldAutoRedirectToSso("oidc", "?sso")).toBe(true);
    expect(shouldAutoRedirectToSso("oidc", "?sso=1")).toBe(true);
    expect(shouldAutoRedirectToSso("oidc", "?next=/chats&sso")).toBe(true);
  });

  test("non-oidc modes never auto-redirect (even with ?sso)", () => {
    expect(shouldAutoRedirectToSso("local", "?sso")).toBe(false);
    expect(shouldAutoRedirectToSso("forward-header", "?sso")).toBe(false);
    expect(shouldAutoRedirectToSso("single-user", "?sso")).toBe(false);
  });

  test("?authError wins even beside ?sso (a failed round-trip must not loop)", () => {
    expect(shouldAutoRedirectToSso("oidc", "?authError=not_authorized")).toBe(false);
    expect(shouldAutoRedirectToSso("oidc", "?sso&authError=not_authorized")).toBe(false);
  });
});

// D259 — the pending-join landing and the invite hand-off to the OIDC login route.
describe("the OIDC signup-invite hand-off", () => {
  test("the pending-join landing never auto-redirects, even beside ?sso", () => {
    expect(isPendingJoinLanding("?pendingJoin=1")).toBe(true);
    expect(isPendingJoinLanding("")).toBe(false);
    expect(shouldAutoRedirectToSso("oidc", "?sso&pendingJoin=1")).toBe(false);
  });

  test("a stashed invite rides the login route as an encoded ?invite=, and none leaves the route bare", () => {
    expect(oidcLoginUrl(null)).toBe("/api/auth/oidc/login");
    const url = new URL(oidcLoginUrl("tok&x=1 +/"), "https://orb.example");
    expect(url.pathname).toBe("/api/auth/oidc/login");
    expect([...url.searchParams.keys()]).toEqual(["invite"]);
    expect(url.searchParams.get("invite")).toBe("tok&x=1 +/");
  });
});
