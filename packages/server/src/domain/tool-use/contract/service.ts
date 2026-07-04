// domain/tool-use/contract/service — the typed API surface (read THIS to know everything the domain
// does). ONE registry, projected onto wires; the domain never loops (the recurse loop is chat's — D48)
// and owns NO tables (records persist via chat persistence on the variant; there is NO `db` on the
// context — the committed §4 sketch's `db` was rejected in 01 §0: handlers reach their own domain's
// persistence through their registration closures). T5 NOTE: `toAgentToolServer` (the D47 `project-mcp`
// projection, tool-use-design/02 §3) is NOT on this interface yet — it lands WITH buddy's consumption
// (its dependency is the agent-sdk factory; the lands-with-its-consumer rule). Chat consumes this via
// injected ops on ChatContext (03 §1), never a sideways import.

import type { Can } from "@orb/contracts/identity";
import type { WireTool } from "#infra/providers";
import type { ToolCallInput, ToolDefinition, ToolExecutionContext } from "./params";
import type { ResolvedToolSet, ToolCallRecord } from "./results";

/**
 * The DI bundle the verbs close over (wired at the composition root). Deliberately THIN (01 §0):
 *   - `can` — the injected `@orb/contracts/identity` privilege seam (the same injection chat uses;
 *     never an admin import). The capability gate feeds it principal + action + resource.
 *   - `clock` — epoch-ms, injected (`durationMs` on records; test-determinism law).
 */
export interface ToolUseContext {
  readonly can: Can;
  readonly clock: () => number;
}

export interface ToolUseService {
  /** Compose-time ONLY: insert one definition. Duplicate name → `ToolNameCollisionError` (boot-fatal
   *  — the env-spine precedent; never last-write-wins). Also refuses a name failing TOOL_NAME_RE. */
  readonly register: <A>(def: ToolDefinition<A>) => void;
  /** The per-turn read surface: resolve caller-supplied names against the registry. Unknown name →
   *  `ToolNotFoundError` (THROWN — at attach time an unknown name is OUR wiring bug; the model's
   *  execute-time unknown is errors-as-data instead). Order = caller order (byte-stable bodies). */
  readonly resolveTools: (names: readonly string[]) => ResolvedToolSet;
  /** Run a batch of model-emitted calls: SEQUENTIAL, in array order; NEVER throws for a per-call
   *  failure (every outcome is a record — errors-as-data; 01 §5's six steps). */
  readonly executeToolCalls: (
    set: ResolvedToolSet,
    calls: readonly ToolCallInput[],
    exec: ToolExecutionContext,
  ) => Promise<readonly ToolCallRecord[]>;
  /** Registry → the OpenAI-wire `tools[]` (the cached projections; order = resolve order). */
  readonly toWireTools: (set: ResolvedToolSet) => readonly WireTool[];
}
