import {
  MODE_RESOLVERS,
  SESSION_COOKIE_ATTRS,
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME_INSECURE,
  SESSION_COOKIE_NAME_SECURE,
  SESSION_COOKIES,
} from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeAuthConfig as cfg, headers } from "../_support.ts";

// Post-D40 (Route A) infra does NOT read or validate the session cookie — the seam validates it via
// `sessions.validate` BEFORE calling `resolve` (entry/auth/seam.ts). So at the infra layer the cookie modes
// (`local`/`oidc`) resolve to `null` unconditionally, and `resolve` falls through to the owner-fallback /
// unauth path. The only thing still homed in `cookie-session.ts` is the cookie NAME + its attributes (shared
// by the seam's reader and the entry route writer). The cookie PARSE/validate coverage lives at the seam now.

const resolveCookie = MODE_RESOLVERS.local;

describe("SESSION_COOKIE_NAME", () => {
  test("is the __Host-pinned orbweaver session cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("__Host-orb_session");
  });

  // #2413 — the DEFAULT must stay byte-identical to the pre-knob world, attributes included: adding an
  // opt-in downgrade must not have moved anything for the boxes that never set it.
  test("the default attributes are the full __Host- policy (Secure, host-only, Path=/, HttpOnly, SameSite=Lax)", () => {
    expect(SESSION_COOKIE_ATTRS).toBe("Path=/; HttpOnly; Secure; SameSite=Lax");
    expect(SESSION_COOKIE_ATTRS).not.toContain("Domain=");
  });

  // NEITHER FULL NAME MAY BE A SUBSTRING OF THE OTHER. The first spelling of the insecure name was the bare
  // `orb_session`, which `__Host-orb_session` ENDS WITH — so any `includes`/regex written against the
  // insecure name would silently also match the secure cookie (and `session-cookie-parity.suite.test.ts`
  // exists precisely because a reader that confuses two cookie names lets logout revoke a decoy while the
  // seam keeps authenticating the real one). The readers exact-match, so this is a legibility belt; it is
  // pinned because the failure it prevents is invisible in review.
  test("the two names are DISTINCT and neither is a SUBSTRING of the other", () => {
    expect(SESSION_COOKIE_NAME_SECURE).not.toBe(SESSION_COOKIE_NAME_INSECURE);
    expect(SESSION_COOKIE_NAME_SECURE.includes(SESSION_COOKIE_NAME_INSECURE)).toBe(false);
    expect(SESSION_COOKIE_NAME_INSECURE.includes(SESSION_COOKIE_NAME_SECURE)).toBe(false);
  });

  // The insecure name may NOT carry a cookie-prefix: `__Host-` and `__Secure-` both REQUIRE the `Secure`
  // attribute (RFC 6265bis §4.1.3), so a prefixed name without it is a Set-Cookie the browser discards —
  // i.e. the knob would silently do nothing at all.
  test("the insecure name carries no cookie-prefix (a prefixed name would require Secure and be dropped)", () => {
    expect(SESSION_COOKIE_NAME_INSECURE.startsWith("__")).toBe(false);
  });

  test("SESSION_COOKIES pairs each name with the attributes that name requires", () => {
    expect(SESSION_COOKIES.map(({ name }) => name)).toEqual([SESSION_COOKIE_NAME_SECURE, SESSION_COOKIE_NAME_INSECURE]);
    const [secure, insecure] = SESSION_COOKIES;
    expect(secure?.attrs).toContain("Secure");
    expect(insecure?.attrs).not.toContain("Secure");
    // dropping `Secure` costs confidentiality on the wire and nothing else — the other three belts stay
    for (const { attrs } of SESSION_COOKIES) {
      expect(attrs).toContain("HttpOnly");
      expect(attrs).toContain("SameSite=Lax");
      expect(attrs).toContain("Path=/");
    }
  });
});

// THE WIRING ARM — "env key → posture → this module's live name + attrs" — lives in
// tests/server/foundation/env/index.test.ts, which owns the re-import-under-a-crafted-process.env machinery
// (and the biome grant for it). It is named here so the coupling is findable from either side: a change to
// the constants above owes that arm a look.

describe("resolveCookieSession (via the cookie mode) — inert at infra post-D40", () => {
  test("no cookie present → null", async () => {
    expect(await resolveCookie(headers(), cfg(), {})).toBeNull();
  });

  test("our cookie present → STILL null (infra never reads the cookie; the seam owns it)", async () => {
    expect(await resolveCookie(headers({ cookie: `${SESSION_COOKIE_NAME}=tok-abc` }), cfg(), {})).toBeNull();
  });
});
