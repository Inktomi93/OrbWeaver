import type { LookupFunction } from "node:net";
import type { ScopedEgressOptions } from "@orb/server/infra/network";
import { createScopedEgress, systemFetch } from "@orb/server/infra/network";
import { createControlledTimers, createFrozenClock } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createTestLogger } from "@orb/testkit/node/composed";
import { createTestEnv } from "@orb/testkit/node/helpers";

// A fresh scheduler per egress: these cases never wait on a deadline, so nothing advances it.
function quietTimers(): ReturnType<typeof createControlledTimers> {
  return createControlledTimers(createFrozenClock());
}

const raw = { reached: new Error("controlled raw dial reached"), calls: [] as string[] };

// Only the physical connector is scripted. The production lookup callback makes the actual address judgment.
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
      raw.calls.push(`${target.hostname}:${target.port}`);
      callback(raw.reached, null);
    });
  };
};

type EgressResolver = NonNullable<ScopedEgressOptions["resolver"]>;

const PUBLIC_ADDRESS = "93.184.215.14";
const LOOPBACK_ADDRESS = "127.0.0.1";

const resolveByHost: EgressResolver = (hostname) => Promise.resolve([hostname === "public.example" ? PUBLIC_ADDRESS : LOOPBACK_ADDRESS]);

// The write-time pin resolves first and admits the public answer; the connector's own lookup then sees the
// rebound loopback answer, so the connector is the gate that decides.
function rebindingResolver(): EgressResolver {
  let answered = false;
  return () => {
    const address = answered ? LOOPBACK_ADDRESS : PUBLIC_ADDRESS;
    answered = true;
    return Promise.resolve([address]);
  };
}

async function dialFailure(fetchPromise: Promise<Response>): Promise<unknown> {
  const error = await fetchPromise.then(
    () => new Error("the scripted connector never yields a socket"),
    (rejection: unknown) => rejection,
  );
  return error instanceof Error ? error.cause : error;
}

test("the actual connector rejects a wrong hostname port before the physical dial despite its resolved CIDR", async () => {
  raw.calls.length = 0;
  await using egress = createScopedEgress({
    log: createTestLogger(),
    env: createTestEnv(),
    timers: quietTimers(),
    fetch: systemFetch,
    resolver: rebindingResolver(),
    buildConnector: scriptedConnector,
  });
  egress.publishPrivateEndpointAllowlist(["engine.lan:11434", "127.0.0.0/8"]);
  const cause = await dialFailure(egress.configuredEndpointFetch("http://engine.lan:8080/v1"));
  expect(cause).not.toBe(raw.reached);
  expect(cause instanceof Error ? cause.message : cause).toContain("SSRF_BLOCKED");
  expect(raw.calls).toEqual([]);
});

test("the connector preserves exact-port, unrelated-CIDR-host and public-address admission", async () => {
  raw.calls.length = 0;
  await using egress = createScopedEgress({
    log: createTestLogger(),
    env: createTestEnv(),
    timers: quietTimers(),
    fetch: systemFetch,
    resolver: resolveByHost,
    buildConnector: scriptedConnector,
  });
  egress.publishPrivateEndpointAllowlist(["engine.lan:11434", "public.example:11434", "127.0.0.0/8"]);
  for (const url of ["http://engine.lan:11434/v1", "http://other.lan:8080/v1", "http://public.example:8080/v1"]) {
    await expect(dialFailure(egress.configuredEndpointFetch(url))).resolves.toBe(raw.reached);
  }
  expect(raw.calls).toEqual(["engine.lan:11434", "other.lan:8080", "public.example:8080"]);
});
