// domain/tool-use/contract/results — the resolved-set surface. A registry stores many ToolDefinition<A>s;
// the handler's contravariance makes ToolDefinition<unknown> unassignable from a typed def, so register<A>
// erases each into a RegisteredTool whose run closes over the typed pair (schema + handler) — zero casts,
// variance-sound by construction.

import type { ZodRawShape } from "zod";
import type { ToolCapability, ToolExecutionContext, ToolSource } from "./params.ts";

export type { ToolCallRecord } from "@orb/contracts/chat";

/** One erased call's terminal shape. */
export type RunOutcome =
  | { readonly kind: "invalid"; readonly issues: string }
  | { readonly kind: "denied" }
  | { readonly kind: "result"; readonly ok: boolean; readonly value: string }
  | { readonly kind: "threw"; readonly message: string };

/** One erased registry entry: identity/ceiling columns + the cached JSON-schema projection + the fused
 *  parse→gate→invoke closure. */
export interface RegisteredTool {
  readonly name: string;
  readonly description: string;
  readonly capability: ToolCapability | null;
  readonly source: ToolSource;
  readonly parameters: Record<string, unknown>;
  /** The zod raw shape (the registered object schema's `.shape`) the MCP projection hands the agent-sdk
   *  factory — the SDK's `tool()` requires a shape, not the cached JSON-schema `parameters`. Computed once
   *  at registration. */
  readonly argShape: ZodRawShape;
  /** Parse the args, call gate (deny maps to "denied"), invoke the handler. Never rejects. */
  readonly run: (parsedJson: unknown, exec: ToolExecutionContext, gate: () => void) => Promise<RunOutcome>;
}

/** The registry's mutable state — created once per service. Compose-time `register` never removes (boot-
 *  fatal collision, v1); the RUNTIME plugin registrar (PL-A) adds + removes at activation/deactivation via
 *  {@link PluginToolHandle} — the ONE registry, two write paths (D48), never a parallel plugin-tool map. */
export type ToolRegistry = Map<string, RegisteredTool>;

/** The deregistration handle the runtime plugin registrar returns (PL-A). Plugin deactivation/uninstall calls
 *  `unregister` so a disabled plugin's tool never stays resolvable (03 §5 — "no ghost tools"). */
export interface PluginToolHandle {
  readonly unregister: () => void;
}

/** The opaque ordered set resolveTools returns and both projections + executeToolCalls accept — resolving
 *  once per turn guarantees the tools the model saw are exactly the tools that can run. */
export interface ResolvedToolSet {
  readonly entries: readonly RegisteredTool[];
}
