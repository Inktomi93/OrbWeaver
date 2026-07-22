// domain/connection/contract/errors — the typed connection errors. One home
// for the reason strings (no inline re-spell, §7.5).

import { DomainOperationError, DomainUnavailableError } from "@orb/kit/errors";

/** The `DomainOperationError.code` discriminators connection verbs throw. One home for the strings. */
const CONNECTION_OP_CODES = {
  /** An incoherent `(api, source)` pairing the role resolver can't map (e.g. a chat-completions api with a
   *  source that is neither openrouter/vllm/custom_openai). */
  routingIncoherent: "connection_routing_incoherent",
  /** An `agent-sdk` source reached the model heal with no explicit arm — the fail-LOUD guard that replaced
   *  the silent Claude-default catch-all (owner ruling: a source-blind fallthrough to opus masked the
   *  vLLM 404 two layers down). A new agent-sdk source must add its heal arm, not silently become opus. */
  agentModelHealUnhandled: "connection_agent_model_heal_unhandled",
} as const;

/**
 * An incoherent routing selection — the resolved `(api, source)` has no coherent backend (e.g. a
 * `chat-completions`/`responses` api requested with `source: 'max-pro-sub'`, which is agent-sdk-only).
 * HTTP 400 (it is a bad selection, not a server fault); clients key on the `code`.
 */
export class ConnectionRoutingError extends DomainOperationError {
  declare readonly code: typeof CONNECTION_OP_CODES.routingIncoherent;
  constructor(api: string, source: string) {
    super(CONNECTION_OP_CODES.routingIncoherent, `incoherent routing: api=${api} is not coherent with source=${source}`);
  }
}

/**
 * An `agent-sdk` source reached `healModel` with no explicit arm. Fail-LOUD by design: the previous
 * source-blind fallthrough silently healed EVERY agent-sdk source to a Claude default (opus), which for
 * `vllm` 404'd the loopback and crashed Claude Code two layers down. A new coherent agent-sdk source must be
 * given its own heal arm here. HTTP 400-shaped (a resolution the server can't map, surfaced not swallowed).
 */
export class AgentModelHealError extends DomainOperationError {
  declare readonly code: typeof CONNECTION_OP_CODES.agentModelHealUnhandled;
  constructor(source: string) {
    super(CONNECTION_OP_CODES.agentModelHealUnhandled, `agent-sdk model heal: unhandled source '${source}'`);
  }
}

/**
 * The OpenRouter catalog could not be fetched (no key, network down) AND no persisted snapshot exists.
 * `refreshCatalog` throws this when the live fetch fails with nothing to fall back to; a STALE snapshot is
 * NOT this error (it is served as-is — best-effort). HTTP 503-shaped (a transient upstream gap).
 */
export class CatalogUnavailableError extends DomainUnavailableError {
  constructor(reason: string, options?: { readonly cause?: unknown }) {
    super(`openrouter catalog unavailable: ${reason}`);
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/**
 * The agent-sdk daemon model catalog could not be discovered (spawn failure, discovery timeout) AND no
 * persisted snapshot exists. `refreshAgentSdkCatalog` throws this when the live `supportedModels()` fails
 * with nothing to fall back to; a STALE snapshot is served as-is (best-effort). HTTP 503-shaped. SEPARATE
 * from {@link CatalogUnavailableError} (OR ≠ agent-sdk) so a client can tell the two catalog gaps apart.
 */
export class AgentSdkCatalogUnavailableError extends DomainUnavailableError {
  constructor(reason: string, options?: { readonly cause?: unknown }) {
    super(`agent-sdk model catalog unavailable: ${reason}`);
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}
