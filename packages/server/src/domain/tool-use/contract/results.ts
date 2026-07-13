// domain/tool-use/contract/results — the resolved-set surface. A registry stores many ToolDefinition<A>s;
// the handler's contravariance makes ToolDefinition<unknown> unassignable from a typed def, so register<A>
// erases each into a RegisteredTool whose run closes over the typed pair (schema + handler) — zero casts,
// variance-sound by construction.

import type { ToolCapability, ToolExecutionContext, ToolSource } from "./params";

export type { ToolCallRecord } from "@orb/contracts/chat";
export type { ToolHandlerResult } from "./params";

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
  /** Parse the args, call gate (deny maps to "denied"), invoke the handler. Never rejects. */
  readonly run: (
    parsedJson: unknown,
    exec: ToolExecutionContext,
    gate: () => void,
  ) => Promise<RunOutcome>;
}

/** The registry's mutable state — created once per service; deliberately no unregister in v1. */
export type ToolRegistry = Map<string, RegisteredTool>;

/** The opaque ordered set resolveTools returns and both projections + executeToolCalls accept — resolving
 *  once per turn guarantees the tools the model saw are exactly the tools that can run. */
export interface ResolvedToolSet {
  readonly entries: readonly RegisteredTool[];
}
