// domain/tool-use/contract/service — the typed API surface. One registry, projected onto wires; the
// domain never loops (the recurse loop is chat's) and owns no tables. Chat consumes via injected ops
// on ChatContext, never a sideways import.

import type { Can } from "@orb/contracts/identity";
import type { WireTool } from "#infra/providers";
import type { ToolCallBatch, ToolDefinition, ToolExecutionContext } from "./params";
import type { ResolvedToolSet, ToolCallRecord } from "./results";

export interface ToolUseContext {
  readonly can: Can;
  readonly clock: () => number;
}

export interface ToolUseService {
  /** Compose-time only: insert one definition. Duplicate name throws (boot-fatal, never last-write-wins). */
  readonly register: <A>(def: ToolDefinition<A>) => void;
  /** Resolve caller-supplied names against the registry. Unknown name throws (our wiring bug). */
  readonly resolveTools: (names: readonly string[]) => ResolvedToolSet;
  /** Run model-emitted calls sequentially, in array order; never throws for a per-call failure. */
  readonly executeToolCalls: (set: ResolvedToolSet, calls: ToolCallBatch, exec: ToolExecutionContext) => Promise<readonly ToolCallRecord[]>;
  readonly toWireTools: (set: ResolvedToolSet) => readonly WireTool[];
}
