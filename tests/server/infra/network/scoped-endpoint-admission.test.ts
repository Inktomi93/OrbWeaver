import { ANY_HOST, createScopedEgress } from "@orb/server/infra/network";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("unresolved write-time endpoint admission remains public without attempting a physical request", async () => {
  const failure = new Error("controlled NXDOMAIN");
  let rawCalls = 0;
  await using egress = createScopedEgress({
    resolver: () => Promise.reject(failure),
    fetch: () => {
      rawCalls += 1;
      return Promise.reject(new Error("write admission attempted raw HTTP"));
    },
  });
  await expect(egress.resolvedEndpointAdmission("https://unresolved.example/v1")).resolves.toBe("public");
  expect(rawCalls).toBe(0);
});

test.each([
  { address: "93.184.215.14", verdict: "public", allowlist: [] },
  { address: "10.0.0.7", verdict: "refused", allowlist: [] },
  { address: "169.254.169.254", verdict: "refused", allowlist: ["0.0.0.0/0"] },
] as const)("write-time admission preserves $address as $verdict", async ({ address, verdict, allowlist }) => {
  await using egress = createScopedEgress({ resolver: () => Promise.resolve([address]) });
  egress.publishPrivateEndpointAllowlist(allowlist);
  await expect(egress.resolvedEndpointAdmission("https://resolved.example/v1")).resolves.toBe(verdict);
});

test("configured and arbitrary URL execution still reject DNS failure before the raw transport", async () => {
  const failure = new Error("controlled physical DNS refusal");
  let rawCalls = 0;
  await using egress = createScopedEgress({
    resolver: () => Promise.reject(failure),
    fetch: () => {
      rawCalls += 1;
      return Promise.reject(new Error("a DNS failure reached the raw transport"));
    },
  });
  await expect(egress.configuredEndpointFetch("https://unresolved.example/v1")).rejects.toBe(failure);
  await expect(egress.safeFetch("https://unresolved.example/asset", { allowedHosts: ANY_HOST })).rejects.toBe(failure);
  expect(rawCalls).toBe(0);
});
