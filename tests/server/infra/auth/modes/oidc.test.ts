import { MODE_RESOLVERS, SESSION_COOKIE_NAME } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";
import { makeAuthConfig as cfg, headers } from "../_support";

// `resolveOidc` (the `oidc` AUTH_MODE arm, wired via MODE_RESOLVERS.oidc) delegates to the shared cookie
// layer. Post-D40 that layer is INERT at infra: the seam validates the session cookie via
// `sessions.validate` BEFORE ever calling `resolve`, so the oidc arm resolves to `null` unconditionally and
// `resolve` falls through to owner-fallback / unauth. The PKCE/state/nonce verify lives in the callback
// route (entry/http/auth-routes.ts) + openid-client — NOT here.

const resolveOidc = MODE_RESOLVERS.oidc;

describe("resolveOidc — inert at infra post-D40", () => {
  test("no cookie present → null", async () => {
    expect(await resolveOidc(headers(), cfg({ mode: "oidc" }), {})).toBeNull();
  });

  test("a session cookie present → STILL null (infra never resolves the cookie; the seam owns it)", async () => {
    expect(await resolveOidc(headers({ cookie: `${SESSION_COOKIE_NAME}=tok-abc` }), cfg({ mode: "oidc" }), {})).toBeNull();
  });
});
