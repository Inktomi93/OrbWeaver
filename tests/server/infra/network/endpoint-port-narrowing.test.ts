import { createScopedEgress } from "@orb/server/infra/network";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("an exact hostname port cannot be re-widened by the resolved address's containing CIDR", async () => {
  const resolvedHosts: string[] = [];
  await using egress = createScopedEgress({
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
  await using egress = createScopedEgress({ resolver: () => Promise.resolve(["127.0.0.1"]) });
  egress.publishPrivateEndpointAllowlist(["engine.lan:11434", "127.0.0.0/8"]);
  await expect(egress.resolvedEndpointAdmission("http://engine.lan:11434")).resolves.toBe("admitted");
  await expect(egress.resolvedEndpointAdmission("http://other.lan:22")).resolves.toBe("public");
});

test("a public resolved address is not turned into a private-endpoint port restriction", async () => {
  await using egress = createScopedEgress({ resolver: () => Promise.resolve(["93.184.215.14"]) });
  egress.publishPrivateEndpointAllowlist(["public.example:11434", "127.0.0.0/8"]);
  await expect(egress.resolvedEndpointAdmission("http://public.example:22")).resolves.toBe("public");
});
