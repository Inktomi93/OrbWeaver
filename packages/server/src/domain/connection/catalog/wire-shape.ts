// domain/connection/catalog/wire-shape — the DOMAIN-side wire-shape key (D66, Finding-1 fix, part 01 §3).
//
// THE LOAD-BEARING THREADING FIX. Turn-caps key on (WIRE-SHAPE × MODEL), but the resolver only ever
// received `source` — so a curated Claude on the openai-compat wire and the SAME Claude on the
// anthropic-messages `cli` wire got byte-identical `turns` cells (the per-shape distinction the design
// rests on was invisible). This file derives a DOMAIN wire-shape enum from `(api, source)` — `deriveRunner`'s
// inputs — WITHOUT importing the sealed `deriveRunner`/`BackendKey` (that infra vocab never leaves
// `infra/providers`, Tier-3b invariant 3). The resolver keys the curated `turns` refinement on it.
//
// ONE home, string-union dispatch (§5.5): `WIRE_SHAPES` + an `assertNever`-exhaustive map. A new `ChatApi`
// member is a `tsc` error here. No consumer sees a wire-shape string (it stays resolver-internal) and no
// runner reads a model id.

import type { ChatApi, ChatSource } from "@orb/contracts/connection";

/** The three-plus wire SHAPES chat is served over — the wire body a `(api, source)` implies, NOT the
 *  credential source. `anthropic-cli` = the agent-sdk backend (subprocess owns the body; modes 1/2/3 share
 *  ONE caps profile per model). `anthropic-direct` = the anth-direct backend (we own the body; part 02).
 *  The two openai shapes split by api (chat-completions vs responses). */
export const WIRE_SHAPES = [
  "openai-compat",
  "openai-responses",
  "anthropic-cli",
  "anthropic-direct",
] as const;
// File-local (NOT `export type` — no-inline-types §7.4 reserves exported type homes for `contract/`; the
// resolver re-derives the same union from WIRE_SHAPES for its refinement key). Consumers read the tuple.
type WireShape = (typeof WIRE_SHAPES)[number];

function assertNever(value: never): never {
  throw new Error(`deriveWireShape: unhandled api ${String(value)}`);
}

/**
 * Derive the wire-shape for a resolved `(api, source)`. The wire body is a function of the PROTOCOL axis
 * (`api`) — one source can serve several apis — so the shape keys on `api`: `chat-completions` → the
 * openai-compat shape; `responses` → the openai-responses shape; `agent-sdk` → the anthropic-messages wire
 * over the CLI transport; `anthropic-messages` (the anth-direct api, W7) → the same wire over the DIRECT
 * transport. `source` is carried for future (source, api) pairs that would refine further; today the shape
 * is api-determined (all agent-sdk modes share one profile — part 01 §1e), so it is the only discriminant.
 */
export function deriveWireShape(api: ChatApi, _source: ChatSource): WireShape {
  switch (api) {
    case "chat-completions":
      return "openai-compat";
    case "responses":
      return "openai-responses";
    case "agent-sdk":
      return "anthropic-cli";
    case "anthropic-messages":
      return "anthropic-direct";
    default:
      return assertNever(api);
  }
}
