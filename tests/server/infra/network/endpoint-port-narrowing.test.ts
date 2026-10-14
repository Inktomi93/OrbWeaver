import type { LookupFunction } from "node:net";
import { __setFirewallLookupForTest, publishPrivateEndpointAllowlist, resolvedEndpointAdmission } from "@orb/server/infra/network";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const resolvedHosts: string[] = [];
const LOOKUP: LookupFunction = (hostname, options, callback): void => {
  resolvedHosts.push(hostname);
  const address = hostname === "public.example" ? "93.184.215.14" : "127.0.0.1";
  if (options.all === true) {
    callback(null, [{ address, family: 4 }], 0);
  } else {
    callback(null, address, 4);
  }
};

test("an exact hostname port cannot be re-widened by the resolved address's containing CIDR", async () => {
  resolvedHosts.length = 0;
  __setFirewallLookupForTest(LOOKUP);
  publishPrivateEndpointAllowlist(["engine.lan:11434", "127.0.0.0/8"]);
  try {
    const verdict = await resolvedEndpointAdmission("http://engine.lan:22");
    expect(resolvedHosts).toEqual(["engine.lan"]);
    expect(verdict).toBe("refused");
  } finally {
    __setFirewallLookupForTest(null);
    publishPrivateEndpointAllowlist([]);
  }
});

test("the exact declared port and a different hostname inside the CIDR remain admitted", async () => {
  __setFirewallLookupForTest(LOOKUP);
  publishPrivateEndpointAllowlist(["engine.lan:11434", "127.0.0.0/8"]);
  try {
    await expect(resolvedEndpointAdmission("http://engine.lan:11434")).resolves.toBe("admitted");
    await expect(resolvedEndpointAdmission("http://other.lan:22")).resolves.toBe("public");
  } finally {
    __setFirewallLookupForTest(null);
    publishPrivateEndpointAllowlist([]);
  }
});

test("a public resolved address is not turned into a private-endpoint port restriction", async () => {
  __setFirewallLookupForTest(LOOKUP);
  publishPrivateEndpointAllowlist(["public.example:11434", "127.0.0.0/8"]);
  try {
    await expect(resolvedEndpointAdmission("http://public.example:22")).resolves.toBe("public");
  } finally {
    __setFirewallLookupForTest(null);
    publishPrivateEndpointAllowlist([]);
  }
});
