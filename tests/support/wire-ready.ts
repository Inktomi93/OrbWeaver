// The ONE sanctioned TEST-SIDE mint of the `WireReady` brand (`@orb/kit/json-schema`). Production has a
// single producer — `projectJsonSchema` — and the brand is a phantom `unique symbol` no other module can
// name, so `ResponseFormat.schema` provably accepts only a projected schema (LANE #61). A test that hands a
// wire arm a HAND-WRITTEN minimal JSON Schema (to exercise the per-wire scrub / request mapping on a shape
// it controls, not the full projected tree, whose bytes the test would then have to re-derive) needs that
// literal to satisfy `ResponseFormat.schema` without dragging zod + `projectJsonSchema` into the fixture.
// This helper is that seam — greppable, one home, never imported by production. Its lone `as WireReady` is
// the only brand cast in the tree besides `projectJsonSchema`'s own.
import type { WireReady } from "@orb/kit/json-schema";

/** Brand a hand-authored test JSON Schema as {@link WireReady} — the projection is assumed, not run (the
 *  fixture IS the shape under test). See the file header for why this exists and where it may be used. */
export function wireSchema(schema: Record<string, unknown>): WireReady {
  return schema as WireReady;
}
