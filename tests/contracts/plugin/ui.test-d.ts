// Type-level pins for @orb/contracts/plugin/ui (#679 U0): the `PLUGIN_NODE_KINDS` tuple and the
// `PluginSurfaceNode` discriminated union must never drift — a kind added to one but not the other is exactly
// the gap the client renderer's exhaustive `Record<NodeKind, Renderer>` exists to catch downstream, pinned
// HERE at the vocabulary home so the two spellings are locked before any consumer reads them.

import type { PluginCommandArgValue, PluginNodeKind, PluginSurfaceNode, PluginSurfaceSpec, pluginSurfaceNodeSchema } from "@orb/contracts/plugin";
import { pluginCommandArgsSchema } from "@orb/contracts/plugin";
import { expectTypeOf, test } from "vitest";
import type { z } from "zod";

test("PLUGIN_NODE_KINDS is EXACTLY the union's `kind` discriminants — neither side can drift", () => {
  expectTypeOf<PluginNodeKind>().toEqualTypeOf<PluginSurfaceNode["kind"]>();
});

test("PluginSurfaceSpec is the node union — the spec root is one node of the closed vocabulary", () => {
  expectTypeOf<PluginSurfaceSpec>().toEqualTypeOf<PluginSurfaceNode>();
  expectTypeOf<z.output<typeof pluginSurfaceNodeSchema>>().toEqualTypeOf<PluginSurfaceNode>();
});

test("plugin command schema output keeps literal required and optional argument names", () => {
  const schema = pluginCommandArgsSchema([
    { name: "requiredArg", type: "string", required: true },
    { name: "optionalArg", type: "number" },
  ] as const);
  type Output = z.output<typeof schema>;
  expectTypeOf<Output["requiredArg"]>().toEqualTypeOf<PluginCommandArgValue>();
  expectTypeOf<Output["optionalArg"]>().toEqualTypeOf<PluginCommandArgValue | undefined>();
});
