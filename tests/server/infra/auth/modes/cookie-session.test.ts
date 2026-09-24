import { MODE_RESOLVERS, SESSION_COOKIE_NAME_INSECURE, SESSION_COOKIE_NAME_SECURE, SESSION_COOKIES, sessionCookieFor } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeAuthConfig as cfg, headers } from "../_support.ts";

// Post-D40 (Route A) infra does NOT read or validate the session cookie — the seam validates it via
// `sessions.validate` BEFORE calling `resolve` (entry/auth/seam.ts). So at the infra layer the cookie modes
// (`local`/`oidc`) resolve to `null` unconditionally. What `cookie-session.ts` homes is the per-transport
// cookie NAME + attributes, shared by the seam's reader and the entry route writer.

const resolveCookie = MODE_RESOLVERS.local;

describe("sessionCookieFor — the cookie is keyed by the request's transport", () => {
  test("https → the __Host- name with the full __Host- policy (Secure, host-only, Path=/, HttpOnly, SameSite=Lax)", () => {
    expect(sessionCookieFor("https")).toEqual({ name: "__Host-orb_session", attrs: "Path=/; HttpOnly; Secure; SameSite=Lax" });
  });

  // A browser drops a `Secure` cookie set over plain http on any origin but localhost, so the http cookie
  // omits it and carries a name with no prefix (`__Host-`/`__Secure-` both REQUIRE `Secure`).
  test("http → the prefix-less insecure name, without Secure", () => {
    const http = sessionCookieFor("http");
    expect(http.name).toBe("orb_session_insecure");
    expect(http.attrs).not.toContain("Secure");
    expect(http.name.startsWith("__")).toBe(false);
  });

  // NEITHER FULL NAME MAY BE A SUBSTRING OF THE OTHER: an ad-hoc `includes`/regex written against one name
  // would otherwise also match the other, and a reader that confuses the two lets logout revoke a decoy while
  // the seam keeps authenticating the real one.
  test("the two names are DISTINCT and neither is a SUBSTRING of the other", () => {
    expect(SESSION_COOKIE_NAME_SECURE).not.toBe(SESSION_COOKIE_NAME_INSECURE);
    expect(SESSION_COOKIE_NAME_SECURE.includes(SESSION_COOKIE_NAME_INSECURE)).toBe(false);
    expect(SESSION_COOKIE_NAME_INSECURE.includes(SESSION_COOKIE_NAME_SECURE)).toBe(false);
  });

  test("SESSION_COOKIES is every transport's cookie, each with the attributes its name requires", () => {
    expect(SESSION_COOKIES).toEqual([sessionCookieFor("https"), sessionCookieFor("http")]);
    // dropping `Secure` costs confidentiality on the wire and nothing else — the other three stay
    for (const { attrs } of SESSION_COOKIES) {
      expect(attrs).toContain("HttpOnly");
      expect(attrs).toContain("SameSite=Lax");
      expect(attrs).toContain("Path=/");
      expect(attrs).not.toContain("Domain=");
    }
  });
});

describe("resolveCookieSession (via the cookie mode) — inert at infra post-D40", () => {
  test("no cookie present → null", async () => {
    expect(await resolveCookie(headers(), cfg(), {})).toBeNull();
  });

  test("our cookie present → STILL null (infra never reads the cookie; the seam owns it)", async () => {
    expect(await resolveCookie(headers({ cookie: `${SESSION_COOKIE_NAME_SECURE}=tok-abc` }), cfg(), {})).toBeNull();
  });
});
