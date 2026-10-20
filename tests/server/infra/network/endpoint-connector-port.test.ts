import type { LookupFunction } from "node:net";
import { __firewallConnectForTest, __setFirewallLookupForTest, publishPrivateEndpointAllowlist } from "@orb/server/infra/network";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import type { buildConnector } from "undici";
import { vi } from "vitest";

const raw = vi.hoisted((): { reached: Error; calls: string[] } => ({ reached: new Error("controlled raw dial reached"), calls: [] }));

// Only the physical connector is scripted. The production lookup callback makes the actual address judgment.
vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  const build: typeof actual.buildConnector = (options) => {
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
  return { ...actual, buildConnector: build };
});

const LOOKUP: LookupFunction = (hostname, options, callback): void => {
  const address = hostname === "public.example" ? "93.184.215.14" : "127.0.0.1";
  if (options.all === true) {
    callback(null, [{ address, family: 4 }], 0);
  } else {
    callback(null, address, 4);
  }
};

function connect(hostname: string, port: string): Promise<Parameters<buildConnector.Callback>> {
  const connector = __firewallConnectForTest();
  return new Promise((resolve) => connector({ hostname, protocol: "http:", port }, (...args) => resolve(args)));
}

test("the actual connector rejects a wrong hostname port before the physical dial despite its resolved CIDR", async () => {
  raw.calls.length = 0;
  __setFirewallLookupForTest(LOOKUP);
  publishPrivateEndpointAllowlist(["engine.lan:11434", "127.0.0.0/8"]);
  try {
    const [error, socket] = await connect("engine.lan", "22");
    expect(error?.message).toContain("SSRF_BLOCKED");
    expect(error).not.toBe(raw.reached);
    expect(socket).toBeNull();
    expect(raw.calls).toEqual([]);
  } finally {
    __setFirewallLookupForTest(null);
    publishPrivateEndpointAllowlist([]);
  }
});

test("the connector preserves exact-port, unrelated-CIDR-host and public-address admission", async () => {
  raw.calls.length = 0;
  __setFirewallLookupForTest(LOOKUP);
  publishPrivateEndpointAllowlist(["engine.lan:11434", "public.example:11434", "127.0.0.0/8"]);
  try {
    for (const [hostname, port] of [
      ["engine.lan", "11434"],
      ["other.lan", "22"],
      ["public.example", "22"],
    ] as const) {
      const [error, socket] = await connect(hostname, port);
      expect(error).toBe(raw.reached);
      expect(socket).toBeNull();
    }
    expect(raw.calls).toEqual(["engine.lan:11434", "other.lan:22", "public.example:22"]);
  } finally {
    __setFirewallLookupForTest(null);
    publishPrivateEndpointAllowlist([]);
  }
});
