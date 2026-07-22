// infra/plugin-host — front door. The QuickJS-ng WASM sandbox runtime (D46) and NOTHING else: this is a
// sealed I/O executor BELOW domain (the `plugin-no-ambient` invariant) — it imports zero domains and is
// handed its host-function op bundle at compose (P4). P1 delivers the runtime SKELETON proven by the spike
// suite (tests/server/infra/plugin-host/): module load, context-per-instance, injected-seam realm, the
// per-invocation DoS budget, the async promise bridge, `boundHostFn`, and the ambient-authority denial.
//
// The evidence report + the findings P2–P6 inherit live in ./README.md. The full `PluginHostV1` surface
// is P2 (`@orb/contracts/plugin`); lifecycle/registry/grants are P3/P4.

export {
  EVENT_QUEUE_DEPTH,
  GUEST_MAX_STACK_BYTES,
  HOST_CALLS_IN_FLIGHT_MAX,
  HOST_FN_DEADLINE_MS,
  HOST_FN_RESULT_CAP_BYTES,
  LOG_BYTES_PER_INVOCATION,
  LOG_LINES_PER_INVOCATION,
  PLUGIN_INVOCATION_CPU_MS,
  PLUGIN_MEMORY_LIMIT_BYTES,
  SNIPPET_WALL_MS,
} from "./budgets";
export { getPluginQuickJS } from "./module";
export { createPluginHost, type PluginHostSeamDeps } from "./port";
export { type HostSeams, installRealm, LogRing } from "./realm";
export { boundHostFn, type EvalOutcome, type GuestError, Sandbox, type SandboxLimits } from "./sandbox";
