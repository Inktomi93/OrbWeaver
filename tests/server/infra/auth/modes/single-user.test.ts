import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AuthConfig, ResolveDeps, ResolvedIdentity } from "@orb/server/infra/auth";
import { MODE_RESOLVERS } from "@orb/server/infra/auth";
import { describe, expect, test } from "vitest";

// `single-user` mode resolver — ALWAYS null: it never gates, never reads a cookie/header, and delegates
// entirely to the UNCONDITIONAL owner fallback in `resolve`. The load-bearing invariant is that it does
// NOT short-circuit on any input (a cookie/validator present must still yield null, so the fallback owns
// the decision). Reached via MODE_RESOLVERS["single-user"] (the resolver isn't on the barrel).

const resolveSingleUser = MODE_RESOLVERS["single-user"];

function cfg(over: Partial<AuthConfig> = {}): AuthConfig {
  return {
    mode: "single-user",
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

describe("resolveSingleUser", () => {
  test("empty headers + empty deps → null", async () => {
    expect(await resolveSingleUser(headers(), cfg(), {})).toBeNull();
  });

  test("a live session cookie + a validator is IGNORED → still null (never short-circuits)", async () => {
    const deps: ResolveDeps = {
      validateCookie: (): Promise<ResolvedIdentity | null> => Promise.resolve(IDENTITY),
    };
    expect(
      await resolveSingleUser(headers({ cookie: "__Host-orb_session=t" }), cfg(), deps),
    ).toBeNull();
  });

  test("an SSO-style forward header is IGNORED → still null", async () => {
    expect(
      await resolveSingleUser(headers({ "x-authentik-username": "alice" }), cfg(), {}),
    ).toBeNull();
  });
});
