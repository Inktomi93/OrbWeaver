// The env egress belt admits a declared host only at the ports it was declared with: the identity provider's key URL
// opens its own port, not every port on that host, while a bare `EGRESS_ALLOWLIST` host keeps every port.
// @subject packages/server/src/infra/network/egress.ts

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { makeGenerationCapability } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

const IDP_HOST = "idp.lan";
const IDP_PORT = 9443;
const IDP_ORIGIN = `https://${IDP_HOST}:${String(IDP_PORT)}`;
const IDP_ADDRESS = "192.168.1.20";
const PROXY_HOST = "proxy.lan";
const PROXY_ADDRESS = "192.168.1.30";
const ADDRESSES: Readonly<Record<string, string>> = { [IDP_HOST]: IDP_ADDRESS, [PROXY_HOST]: PROXY_ADDRESS };
const ADMITTED = "admitted";

/** A forward-header root whose operator key URL sits on a LAN identity provider; `calls` records the raw transport. */
function beltRoot(calls: string[], egressAllowlist?: string): Promise<ServerTestHarness> {
  return createServerHarness({
    env: {
      [AUTH_MODE_KEY]: "forward-header",
      [AUTH_FALLBACK_KEY]: "deny",
      ["FORWARD_AUTH_VERIFY_JWT"]: "true",
      ["FORWARD_AUTH_JWKS"]: `${IDP_ORIGIN}/application/o/orb/jwks/`,
      ["FORWARD_AUTH_JWT_ISSUER"]: `${IDP_ORIGIN}/application/o/orb/`,
      ["FORWARD_AUTH_JWT_AUDIENCE"]: "orb",
      ...(egressAllowlist === undefined ? {} : { ["EGRESS_ALLOWLIST"]: egressAllowlist }),
    },
    networkExecution: {
      resolver: (hostname) => {
        const address = ADDRESSES[hostname];
        return address === undefined ? Promise.reject(new Error(`unscripted resolution of ${hostname}`)) : Promise.resolve([address]);
      },
      fetch: (input, init) => {
        calls.push(new Request(input, init).url);
        return Promise.resolve(Response.json({ data: [] }));
      },
    },
  });
}

/** A member's own endpoint connection write, settled to `admitted` or the refusal's code. */
async function memberEndpoint(root: ServerTestHarness, baseUrl: string): Promise<unknown> {
  const member = await root.principalFor((await root.actor()).id);
  return await root.services.connection
    .create({
      principal: member,
      providerId: "custom-openai",
      credentialId: null,
      baseUrl,
      model: "member-model",
      declared: { kind: "generation", features: { detectServer: false }, generation: makeGenerationCapability() },
    })
    .then(
      () => ADMITTED,
      (err: unknown) => (err instanceof Error && "code" in err ? err.code : err),
    );
}

test("a member endpoint on the key URL's host is admitted at that port and refused at any other", async () => {
  await using root = await beltRoot([]);

  expect({
    declared: await memberEndpoint(root, `${IDP_ORIGIN}/v1`),
    other: await memberEndpoint(root, `http://${IDP_HOST}:6379/v1`),
    defaultHttp: await memberEndpoint(root, `http://${IDP_HOST}/v1`),
  }).toEqual({ declared: ADMITTED, other: CONNECTION_OP_CODES.baseUrlRefused, defaultHttp: CONNECTION_OP_CODES.baseUrlRefused });
});

test("an endpoint row on another port of the key URL's host is refused at connect, before the transport", async () => {
  const calls: string[] = [];
  await using root = await beltRoot(calls);

  await expect(root.app.egress.configuredEndpointFetch(`http://${IDP_HOST}:6379/v1/models`)).rejects.toMatchObject({
    name: "EgressBlockedError",
    reason: "private-address",
  });
  expect(calls).toEqual([]);
  // Positive control: the declared port reaches the transport through the same gate.
  await (await root.app.egress.configuredEndpointFetch(`${IDP_ORIGIN}/v1/models`)).arrayBuffer();
  expect(calls).toEqual([`${IDP_ORIGIN}/v1/models`]);
});

test.for([
  { name: "a bare host keeps every port", allowlist: PROXY_HOST, url: `http://${PROXY_HOST}:22/v1`, verdict: ADMITTED },
  { name: "a host with a port admits that port", allowlist: `${PROXY_HOST}:3128`, url: `http://${PROXY_HOST}:3128/v1`, verdict: ADMITTED },
  {
    name: "a host with a port refuses another",
    allowlist: `${PROXY_HOST}:3128`,
    url: `http://${PROXY_HOST}:22/v1`,
    verdict: CONNECTION_OP_CODES.baseUrlRefused,
  },
  {
    name: "the narrower spelling of one host wins",
    allowlist: `${PROXY_HOST}, ${PROXY_HOST}:3128`,
    url: `http://${PROXY_HOST}:22/v1`,
    verdict: CONNECTION_OP_CODES.baseUrlRefused,
  },
  { name: "a bare identity provider host keeps every port", allowlist: IDP_HOST, url: `http://${IDP_HOST}:6379/v1`, verdict: ADMITTED },
])("EGRESS_ALLOWLIST: $name", async ({ allowlist, url, verdict }) => {
  await using root = await beltRoot([], allowlist);

  expect(await memberEndpoint(root, url)).toBe(verdict);
});
