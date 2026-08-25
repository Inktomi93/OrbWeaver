// domain/tool-use/contract/results — the resolved-set surface. A registry stores many ToolDefinition<A>s;
// the handler's contravariance makes ToolDefinition<unknown> unassignable from a typed def, so register<A>
// erases each into a RegisteredTool whose run closes over the typed pair (schema + handler) — zero casts,
// variance-sound by construction.

import type { UserId } from "@orb/kit/ids";
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
  /** WHO this entry belongs to. `null` for a `builtin` — a first-party tool is a build artifact with no
   *  owner; the INSTALLER's `UserId` for a `plugin` entry.
   *
   *  It is retained (rather than closed over in `run` like the rest of the PL-C ceiling) because reachability
   *  is a question asked about an entry WITHOUT invoking it: "which contributor tools may THIS user point at
   *  by name" — the automation `run_tool` mint gate, its per-fire pause check, and the per-turn attach
   *  contribution all ask exactly that, and none of them is in a position to invoke first and see.
   *  `substrate/reachability.ts::isDirectDrivableBy` is the ONE predicate over it. It is ALSO the owner half of
   *  the entry's {@link ToolRegistryKey} (#677) — the same fact, stored once, read two ways: the key decides
   *  WHERE the entry lives, the predicate decides who may point at it. */
  readonly owner: UserId | null;
  readonly parameters: Record<string, unknown>;
  /** The zod raw shape (the registered object schema's `.shape`) the MCP projection hands the agent-sdk
   *  factory — the SDK's `tool()` requires a shape, not the cached JSON-schema `parameters`. Computed once
   *  at registration. */
  readonly argShape: ZodRawShape;
  /** Parse the args, call gate (deny maps to "denied"), invoke the handler. Never rejects. */
  readonly run: (parsedJson: unknown, exec: ToolExecutionContext, gate: () => void) => Promise<RunOutcome>;
}

declare const toolRegistryKeyBrand: unique symbol;

/** The registry's key: an entry's `(owner, name)` pair, flattened by the ONE derivation in
 *  `substrate/partition.ts`. Branded so nothing else can mint one — a `registry.get(name)` keyed on a bare tool
 *  name is a TYPE ERROR, which is what keeps the per-installer partition (#677) from silently collapsing back
 *  into a global name shelf the first time someone adds a lookup. */
export type ToolRegistryKey = string & { readonly [toolRegistryKeyBrand]: true };

/** The registry's mutable state — created once per service. Compose-time `register` never removes (boot-
 *  fatal collision, v1); the RUNTIME plugin registrar (PL-A) adds + removes at activation/deactivation via
 *  {@link PluginToolHandle} — the ONE registry, two write paths (D48), never a parallel plugin-tool map.
 *
 *  Keyed by {@link ToolRegistryKey}, NOT by name: the same namespaced plugin tool name legitimately exists once
 *  per installing user (`substrate/partition.ts` carries the why). Iteration order stays insertion order, so
 *  `listDrivableToolNames` still reports registration order within an owner. */
export type ToolRegistry = Map<ToolRegistryKey, RegisteredTool>;

/** The deregistration handle the runtime plugin registrar returns (PL-A). Plugin deactivation/uninstall calls
 *  `unregister` so a disabled plugin's tool never stays resolvable — no ghost tools. */
export interface PluginToolHandle {
  readonly unregister: () => void;
}

/** The opaque ordered set resolveTools returns and both projections + executeToolCalls accept — resolving
 *  once per turn guarantees the tools the model saw are exactly the tools that can run. */
export interface ResolvedToolSet {
  readonly entries: readonly RegisteredTool[];
}
