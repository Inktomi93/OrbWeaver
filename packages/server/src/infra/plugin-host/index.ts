// infra/plugin-host — front door. The QuickJS-ng WASM sandbox runtime (D46) and NOTHING else: this is a
// sealed I/O executor BELOW domain (the `plugin-no-ambient` invariant) — it imports zero domains and is
// handed its host-function op bundle at compose. The runtime SKELETON is proven by the spike
// suite (tests/server/infra/plugin-host/): module load, context-per-instance, injected-seam realm, the
// per-invocation DoS budget, the async promise bridge, and the ambient-authority denial.
//
// The evidence report lives in ./README.md. The full `PluginHostV1` surface is
// `@orb/contracts/plugin`; lifecycle/registry/grants are this module's port/sandbox.

export {
  EVENT_QUEUE_DEPTH,
  GUEST_MAX_STACK_BYTES,
  HOST_CALLS_IN_FLIGHT_MAX,
  HOST_FN_ARGS_MAX_BYTES,
  HOST_FN_DEADLINE_MS,
  HOST_FN_RESULT_CAP_BYTES,
  LOG_BYTES_PER_INVOCATION,
  LOG_LINES_PER_INVOCATION,
  PLUGIN_INVOCATION_CPU_MS,
  PLUGIN_LOG_RING_CHARS,
  PLUGIN_LOG_RING_LINES,
  PLUGIN_MEMORY_LIMIT_BYTES,
  PLUGIN_RESIDENT_RUNTIME_MAX,
  PLUGIN_SNIPPET_RUNTIME_MAX,
  SNIPPET_WALL_MS,
} from "./budgets.ts";
export { getPluginQuickJS } from "./module.ts";
export { createPluginHost, type PluginHostSeamDeps } from "./port.ts";
export { AMBIENT_STUBS, type HostSeams, installRealm, LogRing } from "./realm.ts";
export { type EvalOutcome, type GuestError, PLUGIN_INVOCATION_ENDED, Sandbox, type SandboxLimits } from "./sandbox.ts";
