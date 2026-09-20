// Coherence is DATA: a connection's `api` must be ∈ `PROVIDER.apis` (validated on write by the domain,
// re-checked here on resolve). "auto" ⇒ the provider's first api; a non-chat kind has no api at all. There
// is no `assertCoherent` matrix and no client mirror — the picker offers `coherentApis(provider)`.

import type { ChatApi, ModelKind, ProviderDef, UserConnection } from "@orb/contracts/inference";
import { coherentApis } from "@orb/contracts/inference";
import { ProviderError } from "../contract/errors.ts";

export function resolveApi(provider: ProviderDef, connection: UserConnection, kind: ModelKind): ChatApi | null {
  if (kind !== "generation") {
    return null;
  }
  const apis = coherentApis(provider);
  if (connection.api === "auto") {
    const first = apis[0];
    if (first === undefined) {
      throw new ProviderError({ kind: "invalid", retryable: false, message: `provider "${provider.id}" speaks no chat api` });
    }
    return first;
  }
  if (!apis.includes(connection.api)) {
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `connection "${connection.label}" names api "${connection.api}", which provider "${provider.id}" does not speak`,
    });
  }
  return connection.api;
}
