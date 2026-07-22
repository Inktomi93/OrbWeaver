// domain/tool-use/contract/service — the typed API surface. One registry, projected onto wires; the
// domain never loops (the recurse loop is chat's) and owns no tables. Chat consumes via injected ops
// on ChatContext, never a sideways import.

import type { Can } from "@orb/contracts/identity";
import type { AgentToolServer, WireTool } from "#infra/providers";
import type { CreateAgentToolServer, PluginToolSpec, ToolCallBatch, ToolDefinition, ToolExecutionContext } from "./params";
import type { PluginToolHandle, ResolvedToolSet, ToolCallRecord } from "./results";

export interface ToolUseContext {
  readonly can: Can;
  readonly clock: () => number;
}

export interface ToolUseService {
  /** Compose-time only: insert one definition. Duplicate name throws (boot-fatal, never last-write-wins). */
  readonly register: <A>(def: ToolDefinition<A>) => void;
  /** RUNTIME registrar (plugin-design PL-A; D48 source (b)): insert a plugin-sourced tool at ACTIVATION and
   *  return a deregistration handle (plugin deactivation/uninstall calls it — no ghost tools). The guest args
   *  arrive as raw JSON Schema (lifted to zod host-side — PL-B) and the ceiling runs as the INSTALLING
   *  principal (PL-C). A collision is activation-fatal (`ToolNameCollisionError`), never boot-fatal. */
  readonly registerPluginTool: (spec: PluginToolSpec) => PluginToolHandle;
  /** Resolve caller-supplied names against the registry. Unknown name throws (our wiring bug). */
  readonly resolveTools: (names: readonly string[]) => ResolvedToolSet;
  /** Run model-emitted calls sequentially, in array order; never throws for a per-call failure. */
  readonly executeToolCalls: (set: ResolvedToolSet, calls: ToolCallBatch, exec: ToolExecutionContext) => Promise<readonly ToolCallRecord[]>;
  readonly toWireTools: (set: ResolvedToolSet) => readonly WireTool[];
  /** Wrap the resolved set as an agent-sdk tool server (tool-use-design/02 §3). Each wrapped handler routes
   *  back through executeToolCalls (the SAME pipeline), and `onRecord` fires per invocation so the caller
   *  persists the same ToolCallRecord[] the wire path persists. `createAgentToolServer` is injected (the D47
   *  factory) so this domain never imports the SDK. */
  readonly toAgentToolServer: (
    set: ResolvedToolSet,
    exec: ToolExecutionContext,
    deps: { readonly createAgentToolServer: CreateAgentToolServer },
    onRecord: (record: ToolCallRecord) => void,
  ) => AgentToolServer;
}
