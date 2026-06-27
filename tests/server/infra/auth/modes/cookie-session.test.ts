import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthConfig, ResolveDeps, ResolvedIdentity } from "@orb/server/infra/auth";
import { MODE_RESOLVERS, SESSION_COOKIE_NAME } from "@orb/server/infra/auth";
import { describe, expect, test } from "vitest";

// The shared cookie read path both `local` and `oidc` delegate to (resolveCookieSession is not on the
// barrel — it's reached through the cookie modes; `local` is a pure passthrough). Covered here: the
// `__Host` cookie NAME, the inert-without-validator + no-cookie short-circuits, the minimal cookie parse
// (named lookup among many, trimming, percent-decode + its URIError tolerance), and the onSlide forward.
// The db validate is INJECTED (a fake that captures what it was handed); the resolver yields the pre-row
// identity unchanged (NO userId/role).

const resolveCookie = MODE_RESOLVERS.local;

function cfg(over: Partial<AuthConfig> = {}): AuthConfig {
  return {
    mode: "local",
    fallback: "owner",
    defaultHandle: "owner",
    verifyForwardJwt: false,
    trustedLocalHosts: [],
    trustedPrivateRanges: [],
    forwardTrustedProxies: [],
    jwksAllowlist: [],
    ...over,
  };
}

const headers = (init: Record<string, string> = {}): Headers => new Headers(init);
const IDENTITY: ResolvedIdentity = {
  externalId: null,
  handle: castId<Handle>("alice"),
  groups: [],
};

/** A validator that records the token it was handed and yields a fixed live identity. */
function capturingDeps(): { deps: ResolveDeps; token: () => string | null } {
  let seen: string | null = null;
  const deps: ResolveDeps = {
    validateCookie: (t: string): Promise<ResolvedIdentity | null> => {
      seen = t;
      return Promise.resolve(IDENTITY);
    },
  };
  return { deps, token: (): string | null => seen };
}

describe("SESSION_COOKIE_NAME", () => {
  test("is the __Host-pinned orbweaver session cookie name", () => {
    expect(SESSION_COOKIE_NAME).toBe("__Host-orb_session");
  });
});

describe("resolveCookieSession (via the cookie mode)", () => {
  test("no validateCookie injected → null (the layer is inert without the db port)", async () => {
    expect(
      await resolveCookie(headers({ cookie: `${SESSION_COOKIE_NAME}=t` }), cfg(), {}),
    ).toBeNull();
  });

  test("no Cookie header → null even with a validator wired", async () => {
    const { deps } = capturingDeps();
    expect(await resolveCookie(headers(), cfg(), deps)).toBeNull();
  });

  test("a cookie of a DIFFERENT name → null (the validator is never consulted)", async () => {
    const { deps, token } = capturingDeps();
    expect(await resolveCookie(headers({ cookie: "other=t" }), cfg(), deps)).toBeNull();
    expect(token()).toBeNull();
  });

  test("our cookie → the exact token reaches the validator; its identity is returned as-is", async () => {
    const { deps, token } = capturingDeps();
    const res = await resolveCookie(
      headers({ cookie: `${SESSION_COOKIE_NAME}=abc123` }),
      cfg(),
      deps,
    );
    expect(token()).toBe("abc123");
    expect(res).toEqual(IDENTITY);
  });

  test("our cookie among several, with whitespace, is found and trimmed", async () => {
    const { deps, token } = capturingDeps();
    const cookie = `a=1; ${SESSION_COOKIE_NAME}=tok ; b=2`;
    await resolveCookie(headers({ cookie }), cfg(), deps);
    expect(token()).toBe("tok");
  });

  test("a percent-encoded token value is decoded before the validator sees it", async () => {
    const { deps, token } = capturingDeps();
    await resolveCookie(headers({ cookie: `${SESSION_COOKIE_NAME}=a%41b` }), cfg(), deps);
    expect(token()).toBe("aAb");
  });

  test("a malformed percent-encoding is treated as no-session (null), not a thrown URIError", async () => {
    const { deps, token } = capturingDeps();
    const res = await resolveCookie(
      headers({ cookie: `${SESSION_COOKIE_NAME}=%E0%A4%A` }),
      cfg(),
      deps,
    );
    expect(res).toBeNull();
    expect(token()).toBeNull();
  });

  test("the onSessionSlide callback is forwarded to the validator", async () => {
    let received: ((expiresAt: number) => void) | undefined;
    const onSlide = (_expiresAt: number): void => {
      // inert in this test — we only assert the reference is forwarded.
    };
    const deps: ResolveDeps = {
      validateCookie: (
        _t: string,
        slide?: (expiresAt: number) => void,
      ): Promise<ResolvedIdentity | null> => {
        received = slide;
        return Promise.resolve(IDENTITY);
      },
      onSessionSlide: onSlide,
    };
    await resolveCookie(headers({ cookie: `${SESSION_COOKIE_NAME}=t` }), cfg(), deps);
    expect(received).toBe(onSlide);
  });

  test("a validator that reports the session gone (null) → null", async () => {
    const deps: ResolveDeps = {
      validateCookie: (): Promise<ResolvedIdentity | null> => Promise.resolve(null),
    };
    expect(
      await resolveCookie(headers({ cookie: `${SESSION_COOKIE_NAME}=dead` }), cfg(), deps),
    ).toBeNull();
  });
});
