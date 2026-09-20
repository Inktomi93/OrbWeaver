// domain/databank/contract/errors — the one typed NotFound for the slice: a document missing OR not the
// caller's collapses into ONE answer (fetchOwned semantics, no foreign-existence leak → NOT_FOUND). The
// extraction error pair is DECLARED ONCE in `@orb/contracts/extraction` (infra throws them, the domain +
// client both need the identities); callers import those directly from there (a re-export here would be a
// banned barrel), so this file owns only the databank-local NotFound.

import { DomainNotFoundError, DomainOperationError, DomainUnavailableError } from "@orb/kit/errors";
import type { CharacterId } from "@orb/kit/ids";

const DATABANK_ENTITY_KINDS = ["document"] as const;
export type DatabankEntityKind = (typeof DATABANK_ENTITY_KINDS)[number];

export class DocumentNotFoundError extends DomainNotFoundError {
  public readonly entityKind: DatabankEntityKind;
  public readonly entityId: string;
  constructor(entityId: string) {
    super("document", entityId);
    this.entityKind = "document";
    this.entityId = entityId;
    this.name = this.constructor.name;
  }
}

/** A web scrape's fetch failed — an SSRF refusal (safeFetch's EgressBlockedError: private/reserved address,
 *  non-https scheme, ip-literal, redirect-to-private, deadline), a non-2xx response, the size cap, or a
 *  network error. ONE leak-free message + `scrape_failed` code (a 400-class — the caller's URL is at fault,
 *  not the server); the SPECIFIC reason (and any resolved private address) stays server-side on `.cause` + the
 *  safeFetch `securityEvent` log — a client-visible reason would be an SSRF oracle (the hub `importGif`
 *  precedent: one leak-free code, the reason stays server-side). Maps to BAD_REQUEST via `classifyDomainError`. */
/** The owner has no `embed` connection bound — a bank cannot be chunked into nobody's space (§7.5). The
 *  `no-connection` class: a Connections-pane edit fixes it. */
export class DatabankNoEmbedSpaceError extends DomainUnavailableError {
  constructor() {
    super("No embedding connection is bound — bind one under Connections › Model roles to index documents.");
    this.name = this.constructor.name;
  }
}

export class ScrapeFailedError extends DomainOperationError {
  constructor(options?: { readonly cause?: unknown }) {
    super("scrape_failed", "The web page could not be scraped.");
    this.name = this.constructor.name;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

/** The character-scope attach gate's leak-free collapse (DB8): a foreign/absent character maps to NOT_FOUND,
 *  no existence oracle. Named distinctly from domain/character's own CharacterNotFoundError — two domains
 *  can't share an error class (the persona precedent: a same-named class would let instanceof match wrong). */
export class DatabankCharacterNotFoundError extends DomainNotFoundError {
  public readonly characterId: CharacterId;
  constructor(characterId: CharacterId) {
    super("character", characterId);
    this.characterId = characterId;
    this.name = this.constructor.name;
  }
}
