// domain/connection/catalog/wire-shape — the domain-side wire-shape key. Turn-caps key on (wire-shape ×
// model); this derives a domain wire-shape enum from (api, source) without importing the sealed
// deriveRunner/BackendKey (that infra vocab never leaves infra/providers). No consumer sees a wire-shape
// string outside the resolver.

import type { ChatApi, CredentialSource } from "@orb/contracts/connection";

export const WIRE_SHAPES = ["openai-compat", "openai-responses", "anthropic-cli"] as const;
type WireShape = (typeof WIRE_SHAPES)[number];

function assertNever(value: never): never {
  throw new Error(`deriveWireShape: unhandled api ${String(value)}`);
}

/** Keys on api (protocol axis) — one source can serve several apis; source is carried for future refinement. */
export function deriveWireShape(api: ChatApi, _source: CredentialSource): WireShape {
  switch (api) {
    case "chat-completions":
      return "openai-compat";
    case "responses":
      return "openai-responses";
    case "agent-sdk":
      return "anthropic-cli";

    default:
      return assertNever(api);
  }
}
