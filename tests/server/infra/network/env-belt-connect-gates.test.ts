// Both connect-time gates judge the env belt by host and port: the DNS lookup gate for a name that resolves private,
// and the IP-literal connector gate, which alone judges a redirect hop. The OIDC issuer admits only its own port.
// @subject packages/server/src/infra/network/egress.ts

import { createServer } from "node:http";
import type { LookupFunction } from "node:net";
import { OIDC_ISSUER_KEY } from "@orb/contracts/identity";
import type { ScopedEgressOptions } from "@orb/server/infra/network";
import { createScopedEgress, systemConnector, systemFetch, systemResolver } from "@orb/server/infra/network";
import { createQuietTimers, PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createTestLogger } from "@orb/testkit/node/composed";
import { createTestEnv } from "@orb/testkit/node/helpers";

const IDP_HOST = "idp.lan";
const PROXY_HOST = "proxy.lan";
const LAN_ADDRESS = "192.168.1.20";
const LOOPBACK_ADDRESS = "127.0.0.1";
const SSRF_BLOCKED = "SSRF_BLOCKED";
const REACHED = "reached";

type EgressEnv = Parameters<typeof createTestEnv>[0];

/** Every physical dial the lookup gate let through, as `host:port`. */
const dials: string[] = [];
const dialReached = new Error("controlled raw dial reached");

// Only the physical connector is scripted. The production lookup callback makes the address judgment.
const scriptedConnector: ScopedEgressOptions["buildConnector"] = (options) => {
  if (options === undefined || !("lookup" in options) || typeof options.lookup !== "function") {
    throw new Error("the connector control requires the production lookup adapter");
  }
  const lookup: LookupFunction = options.lookup;
  return (target, callback): void => {
    lookup(target.hostname, { all: true }, (error): void => {
      if (error !== null) {
        callback(error, null);
        return;
      }
      dials.push(`${target.hostname}:${target.port}`);
      callback(dialReached, null);
    });
  };
};

// The pin resolves first and sees a public answer; the connector's own lookup then sees the LAN answer, so the
// lookup gate is the gate that decides.
function rebindingResolver(): NonNullable<ScopedEgressOptions["resolver"]> {
  let answered = false;
  return () => {
    const address = answered ? LAN_ADDRESS : PUBLIC_PEER_ADDRESS;
    answered = true;
    return Promise.resolve([address]);
  };
}

/** One request through the lookup gate on a fresh egress, settled to `reached` or the connector's refusal. */
async function throughLookupGate(env: EgressEnv, url: string): Promise<string> {
  await using egress = createScopedEgress({
    traces: null,
    log: createTestLogger(),
    env: createTestEnv(env),
    timers: createQuietTimers(),
    fetch: systemFetch,
    resolver: rebindingResolver(),
    buildConnector: scriptedConnector,
  });
  const cause = await egress.configuredEndpointFetch(url).then(
    () => new Error("the scripted connector never yields a socket"),
    (rejection: unknown) => (rejection instanceof Error ? rejection.cause : rejection),
  );
  if (cause === dialReached) {
    return REACHED;
  }
  return cause instanceof Error && cause.message.includes(SSRF_BLOCKED) ? SSRF_BLOCKED : String(cause);
}

const ISSUER = { [OIDC_ISSUER_KEY]: `https://${IDP_HOST}/application/o/orb/` };

test.for([
  { name: "the issuer's own port", env: ISSUER, url: `https://${IDP_HOST}/v1`, verdict: REACHED },
  { name: "another port on the issuer host", env: ISSUER, url: `https://${IDP_HOST}:6379/v1`, verdict: SSRF_BLOCKED },
  { name: "the issuer host's default http port", env: ISSUER, url: `http://${IDP_HOST}/v1`, verdict: SSRF_BLOCKED },
  // Port 22 is a fetch bad port, refused before any gate runs, so the off-port rows use a port fetch dials.
  { name: "a bare EGRESS_ALLOWLIST host at any port", env: { ["EGRESS_ALLOWLIST"]: PROXY_HOST }, url: `http://${PROXY_HOST}:8080/v1`, verdict: REACHED },
  { name: "a host:port entry at its port", env: { ["EGRESS_ALLOWLIST"]: `${PROXY_HOST}:3128` }, url: `http://${PROXY_HOST}:3128/v1`, verdict: REACHED },
  {
    name: "a host:port entry at another port",
    env: { ["EGRESS_ALLOWLIST"]: `${PROXY_HOST}:3128` },
    url: `http://${PROXY_HOST}:8080/v1`,
    verdict: SSRF_BLOCKED,
  },
])("the DNS lookup gate: $name", async ({ env, url, verdict }) => {
  dials.length = 0;

  expect(await throughLookupGate(env, url)).toBe(verdict);
  expect(dials).toHaveLength(verdict === REACHED ? 1 : 0);
});

interface Listener extends AsyncDisposable {
  readonly port: number;
  /** Every request path the listener received. */
  readonly received: readonly string[];
}

async function listen(answer: (path: string) => { readonly status: number; readonly location?: string }): Promise<Listener> {
  const received: string[] = [];
  const server = createServer((incoming, outgoing) => {
    const path = incoming.url ?? "";
    received.push(path);
    const { status, location } = answer(path);
    outgoing.writeHead(status, location === undefined ? {} : { location });
    outgoing.end();
  });
  await new Promise<void>((resolve) => server.listen(0, LOOPBACK_ADDRESS, resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("the redirect control requires a physical loopback listener");
  }
  return {
    port: address.port,
    received,
    [Symbol.asyncDispose]: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
    },
  };
}

/** Request the first listener, which redirects to the second; settle to the final status or the refusal. */
async function throughRedirect(env: (first: number, second: number) => EgressEnv): Promise<{ readonly outcome: string; readonly secondReceived: number }> {
  await using second = await listen(() => ({ status: 200 }));
  await using first = await listen(() => ({ status: 302, location: `http://${LOOPBACK_ADDRESS}:${String(second.port)}/landed` }));
  await using egress = createScopedEgress({
    traces: null,
    log: createTestLogger(),
    env: createTestEnv(env(first.port, second.port)),
    timers: createQuietTimers(),
    fetch: systemFetch,
    resolver: systemResolver,
    buildConnector: systemConnector,
  });
  const outcome = await egress.configuredEndpointFetch(`http://${LOOPBACK_ADDRESS}:${String(first.port)}/start`).then(
    async (response) => {
      await response.arrayBuffer();
      return String(response.status);
    },
    (rejection: unknown) => {
      const cause = rejection instanceof Error ? rejection.cause : rejection;
      return cause instanceof Error && cause.message.includes(SSRF_BLOCKED) ? SSRF_BLOCKED : String(cause);
    },
  );
  // Positive control for every row: the first hop passed the same literal gate and reached its listener.
  expect(first.received).toEqual(["/start"]);
  return { outcome, secondReceived: second.received.length };
}

test.for([
  {
    name: "the issuer's own port admits the first hop and refuses a redirect to another port on its host",
    env: (first: number): EgressEnv => ({ [OIDC_ISSUER_KEY]: `http://${LOOPBACK_ADDRESS}:${String(first)}/application/o/orb/` }),
    expected: { outcome: SSRF_BLOCKED, secondReceived: 0 },
  },
  {
    name: "a host:port entry refuses a redirect to an unlisted port",
    env: (first: number): EgressEnv => ({ ["EGRESS_ALLOWLIST"]: `${LOOPBACK_ADDRESS}:${String(first)}` }),
    expected: { outcome: SSRF_BLOCKED, secondReceived: 0 },
  },
  {
    name: "host:port entries for both ports follow the redirect",
    env: (first: number, second: number): EgressEnv => ({ ["EGRESS_ALLOWLIST"]: `${LOOPBACK_ADDRESS}:${String(first)},${LOOPBACK_ADDRESS}:${String(second)}` }),
    expected: { outcome: "200", secondReceived: 1 },
  },
  {
    name: "a bare host follows the redirect to any port",
    env: (): EgressEnv => ({ ["EGRESS_ALLOWLIST"]: LOOPBACK_ADDRESS }),
    expected: { outcome: "200", secondReceived: 1 },
  },
])("the IP-literal connector gate: $name", async ({ env, expected }) => {
  expect(await throughRedirect(env)).toEqual(expected);
});
