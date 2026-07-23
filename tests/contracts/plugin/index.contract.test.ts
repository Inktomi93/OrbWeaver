// Contract tests for the @orb/contracts/plugin BARREL (plugin-design P2): the reserved-origin single-arm
// (lifecycle.ts), the capability→function map's runtime coverage (host-v1.ts — the completeness checkpoint's
// runtime mirror; the type-level pin lives in index.test-d.ts), and the two guest-observable membrane errors
// (errors.ts). The manifest matrix + the capability axis live in the manifest.ts mirror (manifest.contract.test.ts).

import { HOST_FUNCTION_CAPABILITY, HostVersionError, PLUGIN_CAPABILITIES, PLUGIN_ORIGINS, PluginCapabilityError } from "@orb/contracts/plugin";
import { expect, test } from "../../support/fixtures";

test("PLUGIN_ORIGINS is the reserved single-arm [upload] (catalog rides an additive member, D86)", () => {
  expect(PLUGIN_ORIGINS).toEqual(["upload"]);
});

test("HOST_FUNCTION_CAPABILITY maps 20 gated functions, every value a real capability, every capability covered", () => {
  const entries = Object.entries(HOST_FUNCTION_CAPABILITY);
  expect(entries).toHaveLength(20);
  const values = new Set(Object.values(HOST_FUNCTION_CAPABILITY));
  // Every mapped capability is a member of the axis.
  for (const cap of values) {
    expect(PLUGIN_CAPABILITIES).toContain(cap);
  }
  // Every capability is claimed by at least one function (runtime mirror of the test-d coverage pin).
  for (const cap of PLUGIN_CAPABILITIES) {
    expect(values.has(cap)).toBe(true);
  }
});

test("PluginCapabilityError carries the ungranted capability and a stable name", () => {
  const err = new PluginCapabilityError("net.fetch");
  expect(err).toBeInstanceOf(Error);
  expect(err.name).toBe("PluginCapabilityError");
  expect(err.capability).toBe("net.fetch");
  expect(err.message).toContain("net.fetch");
});

test("HostVersionError carries the requested + served majors and a stable name", () => {
  const err = new HostVersionError(2, [1]);
  expect(err).toBeInstanceOf(Error);
  expect(err.name).toBe("HostVersionError");
  expect(err.requested).toBe(2);
  expect(err.served).toEqual([1]);
  expect(err.message).toContain("2");
  expect(err.message).toContain("1");
});
