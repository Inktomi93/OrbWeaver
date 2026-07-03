// domain/connection/contract/errors — the typed connection errors. One home
// for the reason strings (no inline re-spell, §7.5).

import { DomainOperationError, DomainUnavailableError } from "@orb/kit/errors";

/** The `DomainOperationError.code` discriminators connection verbs throw. One home for the strings. */
export const CONNECTION_OP_CODES = {
  /** An incoherent `(api, source)` pairing the role resolver can't map (e.g. a chat-completions api with a
   *  source that is neither openrouter/vllm/custom_openai). */
  routingIncoherent: "connection_routing_incoherent",
} as const;

/** The reason-code union (derived from the one tuple of values — never re-spelled). */
export type ConnectionOpCode = (typeof CONNECTION_OP_CODES)[keyof typeof CONNECTION_OP_CODES];

/**
 * An incoherent routing selection — the resolved `(api, source)` has no coherent backend (e.g. a
 * `chat-completions`/`responses` api requested with `source: 'max-pro-sub'`, which is agent-sdk-only).
 * HTTP 400 (it is a bad selection, not a server fault); clients key on the `code`.
 */
export class ConnectionRoutingError extends DomainOperationError {
  declare readonly code: typeof CONNECTION_OP_CODES.routingIncoherent;
  constructor(api: string, source: string) {
    super(
      CONNECTION_OP_CODES.routingIncoherent,
      `incoherent routing: api=${api} is not coherent with source=${source}`,
    );
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
