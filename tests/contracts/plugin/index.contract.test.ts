// Contract tests for the @orb/contracts/plugin BARREL (plugin-design P2): the reserved-origin single-arm
// (lifecycle.ts), the capability→function map's runtime coverage (host-v1.ts — the completeness checkpoint's
// runtime mirror; the type-level pin lives in index.test-d.ts), and the two guest-observable membrane errors
// (errors.ts). The manifest matrix + the capability axis live in the manifest.ts mirror (manifest.contract.test.ts).

import { HOST_FUNCTION_CAPABILITY, HostVersionError, PLUGIN_CAPABILITIES, PLUGIN_ORIGINS, PluginCapabilityError } from "@orb/contracts/plugin";
import { expect, test } from "../../support/fixtures.ts";

test("PLUGIN_ORIGINS is the reserved single-arm [upload] (catalog rides an additive member, D86)", () => {
  expect(PLUGIN_ORIGINS).toEqual(["upload"]);
});

test("HOST_FUNCTION_CAPABILITY maps 35 gated functions, every value a real capability, every capability covered", () => {
  const entries = Object.entries(HOST_FUNCTION_CAPABILITY);
  // 23 → 25 at U6: `transforms.registerDisplay` + `macros.register`, both riding the EXISTING `chat.transform`
  // capability (plugin-ui-plane §5.5/§5.15) — a widened surface with no new consent line. 25 → 28 at U5:
  // `ui.registerCommand` + `ui.toast` + `ui.openDialog`, all three riding the EXISTING `ui.surface` grant
  // (§4.5/§4.5a) — a command in the app's own menu, a toast in its own slot, a dialog in its own modal shell
  // are all already described by the surface consent line.
  // 28 → 29 at U7: `ui.registerFrame`, and this one is the OPPOSITE claim — it is a separate function precisely
  // BECAUSE it needs a NEW consent line (`ui.frame`). The membrane gates per function, so a tier needing louder
  // consent needs its own door. Together the "no new consent for U5/U6" and "a new consent for U7" claims are
  // exactly what this count plus the coverage loop below makes checkable.
  // 29 → 31 at U8: `databank.ingest` + `character.ingest`, each keyed 1:1 to its OWN capability — a canon write
  // into the installer's own library is a distinct consent line, unlike the U5/U6 fns that rode existing grants.
  // 31 → 33 at U8 §5a: `pubsub.emit` + `pubsub.on`, both riding the ONE `plugin_events` grant (a symmetric
  // installer-private plane — the send and receive halves are one consent line).
  // 33 → 35 at U8 D148: `character.setCardData` + `character.getCardData`, both keyed to the ONE
  // `character.card_state` grant (symmetric like `pubsub` — "store its own data on your characters" covers reading
  // it back). Two functions, one capability: the same 1:many the coverage loop below tolerates.
  expect(entries).toHaveLength(35);

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

// U7's capability FORK, at the map that decides it. Two functions in one namespace, two capabilities: the
// declarative door and the escape hatch. Collapsing `ui.registerFrame` onto `ui.surface` would let a plugin
// granted "show its own panels" open an isolated frame — the exact laundering the fork exists to stop — and it
// would do so without failing any other pin, which is why this one names both values explicitly.
test("the two `ui` registrars carry DIFFERENT capabilities — the hatch cannot ride the panel's consent", () => {
  expect(HOST_FUNCTION_CAPABILITY["ui.register"]).toBe("ui.surface");
  expect(HOST_FUNCTION_CAPABILITY["ui.setState"]).toBe("ui.surface");
  expect(HOST_FUNCTION_CAPABILITY["ui.registerFrame"]).toBe("ui.frame");
  // …and NOTHING ELSE claims `ui.frame`: it has exactly one door, so revoking it closes the whole hatch.
  expect(Object.entries(HOST_FUNCTION_CAPABILITY).filter(([, cap]) => cap === "ui.frame")).toEqual([["ui.registerFrame", "ui.frame"]]);
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
