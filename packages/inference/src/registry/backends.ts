// `BACKEND_DEFS: Record<Wire, BackendDef>` — one backend per wire (§5.6), and `buildBackends(deps)` constructs
// ONLY the wires whose needs are present: the agent-sdk wire needs the bundled `claude` executable (registration
// IS "the runtime resolves", §8.4-1); the other three need nothing beyond the deps every install has. A wire
// that is not built is absent from the registry, so availability reads `unavailable` and the picker never
// offers it (§3.3 `providers.available`). `serves` is pinned against each backend's implemented methods by the
// table test. Dispatch is `registry.get(connection.wire)` — no `(api, source)` matrix.
//
// STATED DEVIATION from §5.6's `needs: readonly (keyof InferenceDeps)[]`: the one real need is NESTED
// (`env.claudeExecutable`), which a top-level key list cannot spell, so `needs` is a predicate that names the
// missing need or `null` — same fact, honest shape.

import type { Task, Wire } from "@orb/contracts/inference";
import { WIRE_DEFS, WIRES } from "@orb/contracts/inference";
import type { AgentSdkBackend } from "../backends/agent-sdk/index.ts";
import { createAgentSdkBackend } from "../backends/agent-sdk/index.ts";
import { createAnthropicBackend } from "../backends/anthropic-messages/index.ts";
import type { LocalLightBackend } from "../backends/local-light/index.ts";
import { createLocalLightBackend } from "../backends/local-light/index.ts";
import type { OpenAiCompatBackend } from "../backends/openai-compat/index.ts";
import { createOpenAiCompatBackend } from "../backends/openai-compat/index.ts";
import type { BackendRegistry, ProviderBackend } from "../contract/backend.ts";
import type { InferenceDeps } from "../deps.ts";

/** @public knip type-face false positive — the shape of `BACKEND_DEFS` below, in the module that owns it. */
export interface BackendDef {
  readonly serves: readonly Task[];
  /** The missing need's name, or `null` when the wire can be built on these deps. */
  readonly needs: (deps: InferenceDeps) => string | null;
}

const ALWAYS = (): null => null;

/** @public Test-anchored module surface; the table test pins every wire's `serves` against `WIRE_DEFS`.
 *  Unreachable from `server` BY DESIGN — the package's exports map carries only the star subpath onto each
 *  directory index, so there is no `registry` subpath at all: that is what seals wire→backend dispatch
 *  inside this package at RESOLVE time (a server import fails `tsc` TS2307 and dependency-cruiser both). */
export const BACKEND_DEFS: Record<Wire, BackendDef> = {
  "openai-compat": { serves: WIRE_DEFS["openai-compat"].serves, needs: ALWAYS },
  "anthropic-messages": { serves: WIRE_DEFS["anthropic-messages"].serves, needs: ALWAYS },
  "agent-sdk": {
    serves: WIRE_DEFS["agent-sdk"].serves,
    needs: (deps) => (deps.env.claudeExecutable === undefined ? "env.claudeExecutable (the bundled `claude` runtime)" : null),
  },
  "local-light": { serves: WIRE_DEFS["local-light"].serves, needs: ALWAYS },
};

/** The constructed backends: the registry the executor dispatches on, plus the per-wire handles the runtime
 *  composes beside it (the endpoint reachability prober, the daemon catalog warm, the in-process tier's
 *  prefetch + matte). A handle is `undefined` exactly when its wire was not built. */
export interface BuiltBackends {
  readonly registry: BackendRegistry;
  readonly openAiCompat: OpenAiCompatBackend;
  readonly agentSdk: AgentSdkBackend | undefined;
  readonly localLight: LocalLightBackend;
  /** Why a wire was skipped, by wire — the picker's `runtime-missing` reason and the boot log line. */
  readonly skipped: ReadonlyMap<Wire, string>;
}

export function buildBackends(deps: InferenceDeps): BuiltBackends {
  const skipped = new Map<Wire, string>();
  for (const wire of WIRES) {
    const missing = BACKEND_DEFS[wire].needs(deps);
    if (missing !== null) {
      skipped.set(wire, missing);
      deps.log.info({ wire, missing }, "inference: wire not built — its need is absent on this install");
    }
  }
  const shared = {
    now: deps.now,
    random: deps.random,
    log: deps.log,
    addSpanEvent: deps.addSpanEvent,
    fetch: deps.sdkFetch,
    captureWire: deps.captureWire,
    captureWireReply: deps.captureWireReply,
    imageToPng: deps.imageToPng,
  };
  const openAiCompat = createOpenAiCompatBackend({ ...shared, app: deps.app, embedSpaceDims: deps.embedSpace.dims });
  const anthropic = createAnthropicBackend(shared);
  const localLight = createLocalLightBackend({ now: deps.now, log: deps.log, span: deps.span, config: deps.localLight });
  const agentSdk = skipped.has("agent-sdk")
    ? undefined
    : createAgentSdkBackend({
        now: deps.now,
        log: deps.log,
        env: deps.env,
        userRuntimeDir: deps.userRuntimeDir,
        agentSdk: deps.agentSdk,
        captureWire: deps.captureWire,
        imageToPng: deps.imageToPng,
      });
  const built: [Wire, ProviderBackend | undefined][] = [
    ["openai-compat", openAiCompat.backend],
    ["anthropic-messages", anthropic],
    ["agent-sdk", agentSdk?.backend],
    ["local-light", localLight.backend],
  ];
  const registry = new Map<Wire, ProviderBackend>();
  for (const [wire, backend] of built) {
    if (backend !== undefined) {
      registry.set(wire, backend);
    }
  }
  return { registry, openAiCompat, agentSdk, localLight, skipped };
}
