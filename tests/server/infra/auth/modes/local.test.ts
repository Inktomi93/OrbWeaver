import { MODE_RESOLVERS } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { makeAuthConfig as cfg, headers } from "../_support";

// `local` mode resolver — post-D40 a pure null-returner at the infra layer: the seam validates the cookie
// via `sessions.validate` BEFORE `resolve`, so infra never reads it (the cookie modes contribute nothing
// and `resolve` falls through to the owner-fallback / unauth path). Reached via MODE_RESOLVERS.local (the
// resolver isn't on the barrel). The invariants: it resolves to null on ANY input, and its outcome is
// invariant under `config`.

const resolveLocal = MODE_RESOLVERS.local;

const COOKIE = { cookie: "__Host-orb_session=t" };

describe("resolveLocal", () => {
  test("no cookie → null", async () => {
    expect(await resolveLocal(headers(), cfg(), {})).toBeNull();
  });

  test("our cookie present → STILL null (infra doesn't read cookies post-D40; the seam owns it)", async () => {
    expect(await resolveLocal(headers(COOKIE), cfg(), {})).toBeNull();
  });

  test("the outcome is invariant under `config` (the resolver ignores its config arg)", async () => {
    const a = await resolveLocal(headers(COOKIE), cfg({ fallback: "deny" }), {});
    const b = await resolveLocal(headers(COOKIE), cfg({ fallback: "owner", defaultHandle: "someone-else", trustedLocalHosts: ["x"] }), {});
    expect(a).toEqual(b);
    expect(a).toBeNull();
  });
});
