// The parsed env record reaches the composition root as a dependency: a knob set in the harness record changes
// what the real ingress, egress, settings and forwarded-header reads do, with no process env involved.
// @subject packages/server/src/entry/compose/process-seams.ts
// @subject packages/server/src/infra/network/ingress.ts
// @subject packages/server/src/infra/network/egress.ts
// @subject packages/server/src/infra/auth/transport.ts
// @subject packages/server/src/domain/settings/effective-config/layer.ts
import { authConfigSchema } from "@orb/contracts/auth-config";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { describe } from "vitest";

const LISTED_PEER = "203.0.113.9";
const UNLISTED_PEER = "198.51.100.4";
const PROXY_PEER = "203.0.113.5";
const FORBIDDEN = 403;
const OK = 200;
// A private literal the single-user loopback floor of the endpoint allowlist does not admit.
const PRIVATE_TARGET = "http://10.0.0.7:8080/v1/models";

describe("IP_ALLOWLIST through the record", () => {
  test("refuses a non-listed public peer before any route and admits a listed one", async () => {
    let peer = UNLISTED_PEER;
    await using root = await createServerHarness({ physicalPeer: () => peer, env: { ["IP_ALLOWLIST"]: "203.0.113.0/24" } });
    expect((await root.http.request("/healthz")).status).toBe(FORBIDDEN);
    peer = LISTED_PEER;
    expect((await root.http.request("/healthz")).status).toBe(OK);
  });
});

describe("EGRESS_FIREWALL through the record", () => {
  test("off lets the scoped egress dial a private target the default refuses", async () => {
    const dialed: string[] = [];
    const fetch: typeof globalThis.fetch = (input) => {
      dialed.push(input instanceof Request ? input.url : String(input));
      return Promise.resolve(new Response("{}", { status: OK }));
    };
    await using guarded = await createServerHarness({ networkExecution: { fetch } });
    await expect(guarded.app.egress.configuredEndpointFetch(PRIVATE_TARGET)).rejects.toThrow();
    expect(dialed).toEqual([]);

    await using open = await createServerHarness({ networkExecution: { fetch }, env: { ["EGRESS_FIREWALL"]: "false" } });
    expect((await open.app.egress.configuredEndpointFetch(PRIVATE_TARGET)).status).toBe(OK);
    expect(dialed).toEqual([PRIVATE_TARGET]);
  });
});

describe("a settings env floor through the record", () => {
  test("RATE_LIMIT_LOGIN sets the effective login cap an admin has not overridden", async () => {
    await using root = await createServerHarness({ env: { ["RATE_LIMIT_LOGIN"]: "7" } });
    expect(root.services.settings.getEffectiveConfig().rateLimits.login).toBe(7);
  });
});

describe("FORWARD_AUTH_TRUSTED_PROXIES through the record", () => {
  test("a trusted proxy's X-Forwarded-For names the client the IP allowlist judges", async () => {
    const forwarded = { headers: { ["x-forwarded-for"]: LISTED_PEER } };
    await using untrusted = await createServerHarness({ physicalPeer: () => PROXY_PEER, env: { ["IP_ALLOWLIST"]: `${LISTED_PEER}/32` } });
    expect((await untrusted.http.request("/healthz", forwarded)).status).toBe(FORBIDDEN);

    await using trusted = await createServerHarness({
      physicalPeer: () => PROXY_PEER,
      env: { ["IP_ALLOWLIST"]: `${LISTED_PEER}/32`, ["FORWARD_AUTH_TRUSTED_PROXIES"]: `${PROXY_PEER}/32` },
    });
    expect((await trusted.http.request("/healthz", forwarded)).status).toBe(OK);
  });

  test("a trusted proxy's X-Forwarded-Proto decides the cookie transport", async () => {
    const proto = { headers: { ["x-forwarded-proto"]: "https" } };
    const transportOf = async (root: Awaited<ReturnType<typeof createServerHarness>>): Promise<string> =>
      authConfigSchema.parse(await (await root.http.request("/api/auth/config", proto)).json()).transport;
    await using untrusted = await createServerHarness({ physicalPeer: () => PROXY_PEER });
    expect(await transportOf(untrusted)).toBe("http");
    await using trusted = await createServerHarness({ physicalPeer: () => PROXY_PEER, env: { ["FORWARD_AUTH_TRUSTED_PROXIES"]: `${PROXY_PEER}/32` } });
    expect(await transportOf(trusted)).toBe("https");
  });

  test("a value production refuses is refused by the harness record", async () => {
    await expect(createServerHarness({ env: { ["TRUSTED_PRIVATE_RANGES"]: "not-a-range" } })).rejects.toThrow("TRUSTED_PRIVATE_RANGES");
  });
});
