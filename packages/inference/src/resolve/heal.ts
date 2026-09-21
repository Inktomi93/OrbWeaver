// Source-specific id NORMALISATION only — trim, and the agent-sdk alias → the daemon's `resolvedModel`. There
// is NO default-model heal (F16): an unset or unknown model is `requirement: { ok: false, missing: ["model"] }`
// and availability `no-connection`; the picker is the only way a model gets set.

import type { AgentSdkModel } from "@orb/contracts/inference";
import { modelIdSchema } from "@orb/contracts/inference";
import type { ModelId } from "@orb/kit/ids";
import { agentSdkRowFor } from "../capability/sources/advertised/agent-sdk.ts";

export function normalizeModelId(raw: string, daemonRows: readonly AgentSdkModel[] | null): ModelId {
  const trimmed = raw.trim();
  const row = agentSdkRowFor(trimmed, daemonRows);
  return modelIdSchema.parse(row?.resolvedModel ?? trimmed);
}
