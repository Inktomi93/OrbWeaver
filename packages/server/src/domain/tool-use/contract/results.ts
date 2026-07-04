// domain/tool-use/contract/results — the resolved-set surface + the one-home re-exports: the record
// every outcome becomes is the cross-boundary `ToolCallRecord` (`@orb/contracts/chat` — the client's
// ONLY tool read surface); `ToolHandlerResult` lives in params.ts beside the handler type (re-exported
// here so the spec's contract map holds without a params↔results cycle).
//
// ERASURE NOTE: a registry stores MANY `ToolDefinition<A>`s; the handler's contravariance makes
// `ToolDefinition<unknown>` unassignable from a typed def, so `register<A>` erases each def into a
// `RegisteredTool` whose `run` CLOSES OVER the typed pair (schema + handler) — parse→gate→invoke stay
// in the 01 §5 order via the injected `gate` thunk, and `parsed.data: A` never leaves the closure
// (zero casts, variance-sound by construction).

import type { ToolCapability, ToolExecutionContext, ToolSource } from "./params";

export type { ToolCallRecord } from "@orb/contracts/chat";
export type { ToolHandlerResult } from "./params";

/** One erased call's terminal shape (execute serializes it — the ONE stringify site stays there). */
export type RunOutcome =
  | { readonly kind: "invalid"; readonly issues: string }
  | { readonly kind: "denied" }
  | { readonly kind: "result"; readonly ok: boolean; readonly value: string }
  | { readonly kind: "threw"; readonly message: string };

/** One ERASED registry entry: the identity/ceiling columns + the JSON-schema projection cached at
 *  registration + the fused parse→gate→invoke closure (see the erasure note above). */
export interface RegisteredTool {
  readonly name: string;
  readonly description: string;
  readonly capability: ToolCapability | null;
  readonly source: ToolSource;
  readonly parameters: Record<string, unknown>;
  /** Parse the (already JSON.parsed) args, call `gate` (throws the kit `DomainForbiddenError` on
   *  deny — mapped to `denied`), invoke the handler. Never rejects: every path is a {@link RunOutcome}. */
  readonly run: (
    parsedJson: unknown,
    exec: ToolExecutionContext,
    gate: () => void,
  ) => Promise<RunOutcome>;
}

/** The registry's mutable state — created once per service (tests build a fresh service instead of
 *  clearing; deliberately NO unregister in v1 — reserved-additive for D46 plugin unload). */
export type ToolRegistry = Map<string, RegisteredTool>;

/** The opaque ordered set `resolveTools` returns and BOTH projections + `executeToolCalls` accept —
 *  resolving once per turn, then projecting and executing against the SAME set, guarantees the tools
 *  the model saw are exactly the tools that can run (01 §4). */
export interface ResolvedToolSet {
  readonly entries: readonly RegisteredTool[];
}
