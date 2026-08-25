// Type-level pins for @orb/contracts/plugin/ui (#679 U0): the `PLUGIN_NODE_KINDS` tuple and the
// `PluginSurfaceNode` discriminated union must never drift — a kind added to one but not the other is exactly
// the gap the client renderer's exhaustive `Record<NodeKind, Renderer>` exists to catch downstream, pinned
// HERE at the vocabulary home so the two spellings are locked before any consumer reads them.

import type { PluginNodeKind, PluginSurfaceNode, PluginSurfaceSpec } from "@orb/contracts/plugin";
import { expectTypeOf, test } from "vitest";

test("PLUGIN_NODE_KINDS is EXACTLY the union's `kind` discriminants — neither side can drift", () => {
  expectTypeOf<PluginNodeKind>().toEqualTypeOf<PluginSurfaceNode["kind"]>();
});

test("PluginSurfaceSpec is the node union — the spec root is one node of the closed vocabulary", () => {
  expectTypeOf<PluginSurfaceSpec>().toEqualTypeOf<PluginSurfaceNode>();
});
