import type { OidcDiscover } from "@orb/server/infra/auth";
import { createOidcConfigCache } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// The openid-client Configuration type, borrowed through the module's own injected-thunk type (the tests
// workspace does not depend on openid-client directly).
type OidcConfig = Awaited<ReturnType<OidcDiscover>>;

// oidc-discovery.ts — the SINGLE-FLIGHT discovery contract (#762, owner ruling 2026-08-30). The three
// ruled clauses, each with its own pin: one shared in-flight attempt · a rejection is NEVER cached · a
// settled success is. The discover thunk is injected, so every clause is proven deterministically with
// zero network — which is precisely why the cache lives in its own module instead of inline at the
// composition root (the old `cachedConfig ??= await discovery(…)` was untestable there).

/** A deterministic stand-in for openid-client's `Configuration`. */
function fakeConfig(issuer: string): OidcConfig {
  // @orb-waive no-test-fabrication(unknown): openid-client's Configuration has no test constructor and this suite never calls a Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // method on it — identity (which object came back) is the entire assertion.
  return { serverMetadata: () => ({ issuer }) } as unknown as OidcConfig;
}

/** A discover thunk whose settlement this test controls, plus its call counter. */
function controllableDiscover(): {
  readonly discover: OidcDiscover;
  readonly calls: () => number;
  readonly resolveWith: (config: OidcConfig) => void;
  readonly rejectWith: (err: Error) => void;
} {
  let calls = 0;
  let settle: { resolve: (c: OidcConfig) => void; reject: (e: Error) => void } | null = null;
  return {
    discover: (): Promise<OidcConfig> => {
      calls += 1;
      return new Promise<OidcConfig>((resolve, reject) => {
        settle = { resolve, reject };
      });
    },
    calls: (): number => calls,
    resolveWith: (config): void => settle?.resolve(config),
    rejectWith: (err): void => settle?.reject(err),
  };
}

describe("createOidcConfigCache — clause 1: one shared in-flight attempt", () => {
  test("N concurrent COLD callers perform exactly ONE discovery and all receive the same Configuration", async () => {
    const control = controllableDiscover();
    const getConfig = createOidcConfigCache(control.discover);
    const config = fakeConfig("https://idp.example");

    // Five callers arrive while the round-trip is still open — the exact shape the old `??= await`
    // memo could not serve (it published nothing until the await resolved, so all five would have
    // started their own discovery).
    const joined = [getConfig(), getConfig(), getConfig(), getConfig(), getConfig()];
    expect(control.calls()).toBe(1);

    control.resolveWith(config);
    const results = await Promise.all(joined);

    expect(control.calls()).toBe(1);
    expect(results).toEqual([config, config, config, config, config]);
  });

  test("callers arriving AFTER the success read the cached Configuration without discovering again", async () => {
    const control = controllableDiscover();
    const getConfig = createOidcConfigCache(control.discover);
    const config = fakeConfig("https://idp.example");

    const first = getConfig();
    control.resolveWith(config);
    await first;

    expect(await getConfig()).toBe(config);
    expect(await getConfig()).toBe(config);
    expect(control.calls()).toBe(1);
  });
});

describe("createOidcConfigCache — clause 2: a rejection is NEVER cached", () => {
  test("a rejected FIRST discovery rejects its callers, and the NEXT caller discovers again and can succeed", async () => {
    const control = controllableDiscover();
    const getConfig = createOidcConfigCache(control.discover);

    const first = getConfig();
    control.rejectWith(new Error("issuer unreachable"));
    await expect(first).rejects.toThrow("issuer unreachable");
    expect(control.calls()).toBe(1);

    // The retry: a poisoned cache here would turn one transient boot-time DNS/TLS blip into a
    // permanently dead login route.
    const second = getConfig();
    expect(control.calls()).toBe(2);
    const config = fakeConfig("https://idp.example");
    control.resolveWith(config);
    expect(await second).toBe(config);

    // ...and the recovered success IS cached (clause 3 still holds after a failure).
    expect(await getConfig()).toBe(config);
    expect(control.calls()).toBe(2);
  });

  test("EVERY joiner of a failed attempt rejects, and the whole next wave still costs exactly ONE retry", async () => {
    const control = controllableDiscover();
    const getConfig = createOidcConfigCache(control.discover);

    // The two clauses have to hold TOGETHER: releasing ownership on failure (clause 2) must not cost the
    // single-flight property (clause 1). A release that only ran on SUCCESS would leave the dead attempt
    // published, and this second wave would join a promise that can never settle; a release that dropped
    // the memo on success would make the wave discover twice more.
    const firstWave = [getConfig(), getConfig(), getConfig()];
    control.rejectWith(new Error("issuer unreachable"));
    await expect(Promise.allSettled(firstWave)).resolves.toEqual([
      { status: "rejected", reason: expect.any(Error) },
      { status: "rejected", reason: expect.any(Error) },
      { status: "rejected", reason: expect.any(Error) },
    ]);
    expect(control.calls()).toBe(1);

    const secondWave = [getConfig(), getConfig(), getConfig()];
    expect(control.calls()).toBe(2);

    const config = fakeConfig("https://idp.example");
    control.resolveWith(config);
    expect(await Promise.all(secondWave)).toEqual([config, config, config]);
    expect(control.calls()).toBe(2);
  });
});
