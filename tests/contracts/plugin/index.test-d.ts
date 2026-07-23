import type { HOST_FUNCTION_CAPABILITY, HostFunctionRef, PluginCapability, PluginHostV1 } from "@orb/contracts/plugin";
import { expectTypeOf, test } from "vitest";

// The P2 completeness checkpoint (04 §P2): a capability with no function, OR a function with no capability, must
// fail `tsc`. The FORWARD direction (a gated function with no capability) is enforced in the SOURCE by
// `HOST_FUNCTION_CAPABILITY satisfies Record<HostFunctionRef, PluginCapability>` (a new gated method widens
// `HostFunctionRef` → the const is missing that key → RED). These two pins make both directions explicit and
// keep them observable as tests.

test("HOST_FUNCTION_CAPABILITY keys are EXACTLY the gated host functions — no function is unmapped", () => {
  // Adding a method to a gated namespace of PluginHostV1 widens HostFunctionRef; if the map does not gain the
  // key this equality (and the source `satisfies`) go red.
  expectTypeOf<keyof typeof HOST_FUNCTION_CAPABILITY>().toEqualTypeOf<HostFunctionRef>();
});

test("HOST_FUNCTION_CAPABILITY values COVER every PluginCapability — no capability is orphaned", () => {
  // The value union is ⊆ PluginCapability by construction (the `satisfies`); equality ⟺ surjective. A capability
  // added to PLUGIN_CAPABILITIES with no function mapping it leaves the value union short → RED.
  expectTypeOf<(typeof HOST_FUNCTION_CAPABILITY)[HostFunctionRef]>().toEqualTypeOf<PluginCapability>();
});

// The membrane's refused surface (01 §2 "deliberately does NOT expose") — recorded so it STAYS refused: no raw
// DB/SQL, no preset/connection/credential reads, no message write/edit. A future namespace named any of these
// would make the `Extract` non-`never` and turn this red.
test("PluginHostV1 exposes no db/sql/preset/connection/credential/message-write namespace (leak vectors stay refused)", () => {
  expectTypeOf<Extract<keyof PluginHostV1, "db" | "sql" | "query" | "preset" | "connection" | "credentials">>().toEqualTypeOf<never>();
  expectTypeOf<Extract<keyof PluginHostV1, "messages" | "editMessage" | "writeMessage" | "emit">>().toEqualTypeOf<never>();
});

// The version is a pinned literal (01 §3) — the manifest's `hostVersion: 1` and this must not drift apart.
test("PluginHostV1.version is the literal 1", () => {
  expectTypeOf<PluginHostV1["version"]>().toEqualTypeOf<1>();
});
