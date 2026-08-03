import { MODE_RESOLVERS, SESSION_COOKIE_NAME } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeAuthConfig as cfg, headers } from "../_support.ts";

// Post-D40 (Route A) infra does NOT read or validate the session cookie — the seam validates it via
// `sessions.validate` BEFORE calling `resolve` (entry/auth/seam.ts). So at the infra layer the cookie modes
// (`local`/`oidc`) resolve to `null` unconditionally, and `resolve` falls through to the owner-fallback /
// unauth path. The only thing still homed in `cookie-session.ts` is the cookie NAME (shared by the seam's
// reader + the entry route writer). The cookie PARSE/validate coverage lives at the seam now, not here.

const resolveCookie = MODE_RESOLVERS.local;

describe("SESSION_COOKIE_NAME", () => {
  test("is the __Host-pinned orbweaver session cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("__Host-orb_session");
  });
});

describe("resolveCookieSession (via the cookie mode) — inert at infra post-D40", () => {
  test("no cookie present → null", async () => {
    expect(await resolveCookie(headers(), cfg(), {})).toBeNull();
  });

  test("our cookie present → STILL null (infra never reads the cookie; the seam owns it)", async () => {
    expect(await resolveCookie(headers({ cookie: `${SESSION_COOKIE_NAME}=tok-abc` }), cfg(), {})).toBeNull();
  });
});
