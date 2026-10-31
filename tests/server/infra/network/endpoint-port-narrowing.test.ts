import type { ScopedEgressOptions } from "@orb/server/infra/network";
import { createScopedEgress, systemConnector } from "@orb/server/infra/network";
import { createQuietTimers, PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createTestLogger } from "@orb/testkit/node/composed";
import { createTestEnv } from "@orb/testkit/node/helpers";

// Admission never performs a request; a fetch reaching the transport is the defect these cases would surface.
const unscriptedFetch: ScopedEgressOptions["fetch"] = () => Promise.reject(new Error("admission attempted a raw request"));

test("an exact hostname port cannot be re-widened by the resolved address's containing CIDR", async () => {
  const resolvedHosts: string[] = [];
  await using egress = createScopedEgress({
    traces: null,
    log: createTestLogger(),
    env: createTestEnv(),
    timers: createQuietTimers(),
    fetch: unscriptedFetch,
    buildConnector: systemConnector,
    resolver: (hostname) => {
      resolvedHosts.push(hostname);
      return Promise.resolve(["127.0.0.1"]);
    },
  });
  egress.publishPrivateEndpointAllowlist(["engine.lan:11434", "127.0.0.0/8"]);
  const verdict = await egress.resolvedEndpointAdmission("http://engine.lan:22");
  expect(resolvedHosts).toEqual(["engine.lan"]);
  expect(verdict).toBe("refused");
});

test("the exact declared port and a different hostname inside the CIDR remain admitted", async () => {
  await using egress = createScopedEgress({
    traces: null,
    log: createTestLogger(),
    env: createTestEnv(),
    timers: createQuietTimers(),
    fetch: unscriptedFetch,
    buildConnector: systemConnector,
    resolver: () => Promise.resolve(["127.0.0.1"]),
  });
  egress.publishPrivateEndpointAllowlist(["engine.lan:11434", "127.0.0.0/8"]);
  await expect(egress.resolvedEndpointAdmission("http://engine.lan:11434")).resolves.toBe("admitted");
  await expect(egress.resolvedEndpointAdmission("http://other.lan:22")).resolves.toBe("public");
});

test("a public resolved address is not turned into a private-endpoint port restriction", async () => {
  await using egress = createScopedEgress({
    traces: null,
    log: createTestLogger(),
    env: createTestEnv(),
    timers: createQuietTimers(),
    fetch: unscriptedFetch,
    buildConnector: systemConnector,
    resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]),
  });
  egress.publishPrivateEndpointAllowlist(["public.example:11434", "127.0.0.0/8"]);
  await expect(egress.resolvedEndpointAdmission("http://public.example:22")).resolves.toBe("public");
});
