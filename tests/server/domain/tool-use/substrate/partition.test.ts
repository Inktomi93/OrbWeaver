// substrate/partition — the per-owner registry KEY derivation + driver lookup (#677). Pure. Pins the header's
// whole argument: two installers' copies of the same namespaced name are DISTINCT registry entries, a driver
// resolves their OWN copy first and falls back to the ownerless (builtin) shelf, and a name only another
// user installed is simply ABSENT for anyone else.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { RegisteredTool, ToolRegistry } from "../../../../../packages/server/src/domain/tool-use/contract/results.ts";
import { lookupForDriver, toolRegistryKey } from "../../../../../packages/server/src/domain/tool-use/substrate/partition.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ALICE: UserId = castId("user_alice");
const BOB: UserId = castId("user_bob");

/** A minimal entry — `run` is never invoked by this file's assertions (partition/lookup only). */
function toolFor(owner: UserId | null, name: string): RegisteredTool {
  return {
    name,
    description: "test",
    capability: null,
    source: owner === null ? "builtin" : "plugin",
    owner,
    parameters: {},
    argShape: {},
    run: (): Promise<never> => Promise.reject(new Error("not invoked by this test")),
  };
}

describe("toolRegistryKey", () => {
  test("the null owner (builtin) key is disjoint from every user's — the empty owner half cannot collide with a real UserId", () => {
    expect(toolRegistryKey(null, "tick_clock")).toBe(":tick_clock");
    expect(toolRegistryKey(ALICE, "tick_clock")).toBe("user_alice:tick_clock");
  });

  test("two different owners of the SAME name get two DISTINCT keys", () => {
    expect(toolRegistryKey(ALICE, "plugin_shared_report")).not.toBe(toolRegistryKey(BOB, "plugin_shared_report"));
  });
});

describe("lookupForDriver", () => {
  test("a driver resolves their OWN copy of a shared name, not any other user's", () => {
    const registry: ToolRegistry = new Map([
      [toolRegistryKey(ALICE, "plugin_shared_report"), toolFor(ALICE, "plugin_shared_report")],
      [toolRegistryKey(BOB, "plugin_shared_report"), toolFor(BOB, "plugin_shared_report")],
    ]);
    expect(lookupForDriver(registry, ALICE, "plugin_shared_report")?.owner).toBe(ALICE);
    expect(lookupForDriver(registry, BOB, "plugin_shared_report")?.owner).toBe(BOB);
  });

  test("a name only ANOTHER user installed is ABSENT, never resolved for a driver who did not install it", () => {
    const registry: ToolRegistry = new Map([[toolRegistryKey(ALICE, "plugin_shared_report"), toolFor(ALICE, "plugin_shared_report")]]);
    expect(lookupForDriver(registry, BOB, "plugin_shared_report")).toBeUndefined();
  });

  test("a builtin (owner: null) entry resolves for every driver via the fallback", () => {
    const registry: ToolRegistry = new Map([[toolRegistryKey(null, "tick_clock"), toolFor(null, "tick_clock")]]);
    expect(lookupForDriver(registry, ALICE, "tick_clock")?.owner).toBeNull();
    expect(lookupForDriver(registry, BOB, "tick_clock")?.owner).toBeNull();
  });

  test("a driver's OWN copy takes precedence over a same-named builtin", () => {
    const registry: ToolRegistry = new Map([
      [toolRegistryKey(null, "shadowed"), toolFor(null, "shadowed")],
      [toolRegistryKey(ALICE, "shadowed"), toolFor(ALICE, "shadowed")],
    ]);
    expect(lookupForDriver(registry, ALICE, "shadowed")?.owner).toBe(ALICE);
  });
});
