import type { ProviderDef } from "@orb/contracts/inference";
import type { Resolved } from "../contract/resolved.ts";
import type { EmbeddingExecution } from "../contract/roles.ts";
import { embedRequestTimeoutMs, LOCAL_ENCODER_PROBE_TIMEOUT_MS } from "../contract/roles.ts";

/** The backend loader admits Hub identities only; application data never selects a filesystem path. */
export function requiresHubModelId(provider: ProviderDef): boolean {
  return provider.wire === "local-light";
}

/** Managed markers and their system-token accounting apply to the stateful chat protocol. */
export function supportsManagedCompaction(connection: Pick<Resolved, "api">): boolean {
  return connection.api === "agent-sdk";
}

/** Runtime route facts only; the embeddings domain still owns probing and packaged-vector lookup. */
export function embeddingExecution(connection: Pick<Resolved, "wire" | "features">): EmbeddingExecution {
  const local = connection.wire === "local-light";
  return { widthProbeTimeoutMs: local ? LOCAL_ENCODER_PROBE_TIMEOUT_MS : embedRequestTimeoutMs(connection.features), seedVectors: local };
}
