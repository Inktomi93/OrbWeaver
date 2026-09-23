// domain/tool-use/contract/service — the typed API surface. One registry, projected onto wires; the
// domain never loops (the recurse loop is chat's) and owns no tables. Chat consumes via injected ops
// on ChatContext, never a sideways import.

import type { Can } from "@orb/contracts/identity";
import type { ChatToolDefinition } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import type { PluginToolSpec, ToolCallBatch, ToolDefinition, ToolExecutionContext } from "./params.ts";
import type { PluginToolHandle, ResolvedToolSet, ToolCallRecord } from "./results.ts";

export interface ToolUseContext {
  readonly can: Can;
  readonly clock: () => number;
}

export interface ToolUseService {
  /** Compose-time only: insert one definition. Duplicate name throws (boot-fatal, never last-write-wins). */
  readonly register: <A>(def: ToolDefinition<A>) => void;
  /** RUNTIME registrar (PL-A; D48 source (b)): insert a plugin-sourced tool at ACTIVATION and
   *  return a deregistration handle (plugin deactivation/uninstall calls it — no ghost tools). The guest args
   *  arrive as raw JSON Schema (lifted to zod host-side — PL-B) and the ceiling runs as the INSTALLING
   *  principal (PL-C). A collision is activation-fatal (`ToolNameCollisionError`), never boot-fatal. */
  readonly registerPluginTool: (spec: PluginToolSpec) => PluginToolHandle;
  /** DIRECT-DRIVE reachability, the TEST half (`substrate/reachability.ts` is the predicate): may `userId`
   *  point at `name` themselves — in an automation `run_tool` arm, or by attaching it to a turn they host?
   *  A DIFFERENT question from "may this call run" (that is the `can()` ceiling + the PL-C installer gate at
   *  invocation): this one asks WHOSE contributor the tool is, and answers `true` only for a plugin the user
   *  installed themselves. Consumed by automation's mint gate and its per-fire D146-d pause check. */
  readonly isToolDrivableBy: (name: string, userId: UserId) => boolean;
  /** DIRECT-DRIVE reachability, the ENUMERATION half: every contributor tool `userId` may drive right now.
   *  Read-through — a deactivated plugin's tools have already left the registry, so a name that stops being
   *  drivable stops appearing, and the per-turn attach seam can never hand `resolveTools` a ghost. */
  readonly listDrivableToolNames: (userId: UserId) => readonly string[];
  /** Resolve caller-supplied names against `driverUserId`'s view of the registry — their own contributor tools
   *  plus the first-party ones, never another user's (#677; `substrate/partition.ts`). The driver is the turn
   *  HOST for a chat attach (the identity `listDrivableToolNames` enumerated from) and the rule AUTHOR for the
   *  `run_tool` arm. Unknown name throws (our wiring bug). */
  readonly resolveTools: (driverUserId: UserId, names: readonly string[]) => ResolvedToolSet;
  /** Run model-emitted calls sequentially, in array order; never throws for a per-call failure. */
  readonly executeToolCalls: (set: ResolvedToolSet, calls: ToolCallBatch, exec: ToolExecutionContext) => Promise<readonly ToolCallRecord[]>;
  /** The resolved set as backend-neutral definitions (the cached JSON schema + the zod shape it came from).
   *  `@orb/inference` projects them onto whichever wire the turn rides — an array wire's `tools[]`, or the Agent
   *  SDK's in-process MCP server whose every invocation still funnels back through `executeToolCalls` (via the
   *  caller's execute callback) — so this domain has ONE projection and never learns a backend. */
  readonly toToolDefinitions: (set: ResolvedToolSet) => readonly ChatToolDefinition[];
}
