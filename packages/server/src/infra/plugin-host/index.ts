// infra/plugin-host — front door. The QuickJS-ng WASM sandbox runtime (D46) and NOTHING else: this is a
// sealed I/O executor BELOW domain (the `plugin-no-ambient` invariant) — it imports zero domains and is
// handed its host-function op bundle at compose. The runtime SKELETON is proven by the spike
// suite (tests/server/infra/plugin-host/): module load, context-per-instance, injected-seam realm, the
// per-invocation DoS budget, the async promise bridge, and the ambient-authority denial.
//
// The evidence report lives in ./README.md. The full `PluginHostV1` surface is
// `@orb/contracts/plugin`; lifecycle/registry/grants are this module's port/sandbox.

export { PLUGIN_LOG_RING_CHARS, PLUGIN_LOG_RING_LINES } from "./budgets.ts";
export type { PluginHostSeamDeps } from "./contract/port.ts";
export { createPluginHost } from "./process-runtime.ts";
export { AMBIENT_STUBS } from "./realm.ts";
export { Sandbox } from "./sandbox.ts";
